import {describe,it,expect} from 'vitest';
import {mapCourse} from './runtime';
import {coursesForTerm,defaultStudy,reminderScope,subtitleExport,subtitleTime,updateStudy} from './study';
import type {Course,Assignment} from './domain';
const now=Date.parse('2026-10-15T08:00:00+08:00');
const course=(id:string,name:string):Course=>({id,name:'课程'+id,code:'CS',teacher:'',color:'blue',glyph:'network',files:[],term:{id,name}});
const list=[course('old','2025-2026 Spring'),course('current','2026-2027 Fall'),course('future','2026-2027 Spring'),{...course('unknown',''),term:undefined}];
const assignments=list.map(c=>({id:c.id+':1',courseId:c.id,title:'作业',description:'',dueAt:now+3600000,submission:'unsubmitted'} as Assignment));
describe('学期与本机管理',()=>{
  it('保留服务端学期及时间，默认只选当前学期，不推断未标注课程',()=>{
    expect(coursesForTerm(list,'current',now).map(c=>c.id)).toEqual(['current']);
    expect(coursesForTerm(list,'all',now)).toHaveLength(4);
    const mapped=mapCourse({id:9,term:{id:12,name:'课程学期',start_at:'2026-09-01T00:00:00Z',end_at:'2027-01-31T00:00:00Z'}});
    expect(mapped.term?.id).toBe('12');expect(coursesForTerm([mapped],'current',now)).toHaveLength(1);
  });
  it('识别数字学期、中文学期和跨年一月',()=>{
    expect(coursesForTerm([course('a','2026-2027-1'),course('b','2026-2027 第一学期')],'current',now)).toHaveLength(2);
    expect(coursesForTerm(list,'current',Date.parse('2027-01-15T08:00:00+08:00'))[0].id).toBe('current');
    expect(coursesForTerm(list,'current',Date.parse('2027-03-15T08:00:00+08:00'))[0].id).toBe('future');
  });
  it('忽略、移除、隐藏课程均停止提醒，恢复后重新加入',()=>{
    let prefs=defaultStudy();expect(reminderScope(assignments,list,prefs,now).map(a=>a.id)).toEqual(['current:1']);
    prefs=updateStudy(prefs,'assignment','current:1','ignore');expect(reminderScope(assignments,list,prefs,now)).toEqual([]);
    prefs=updateStudy(prefs,'assignment','current:1','restore');expect(reminderScope(assignments,list,prefs,now)).toHaveLength(1);
    prefs=updateStudy(prefs,'course','current','hide');expect(reminderScope(assignments,list,prefs,now)).toEqual([]);
    prefs=updateStudy(prefs,'course','current','restore');prefs=updateStudy(prefs,'assignment','current:1','hide');expect(reminderScope(assignments,list,prefs,now)).toEqual([]);
    expect(assignments).toHaveLength(4);
  });
  it('学期切换只改变范围，保留本机忽略记录',()=>{
    const prefs={...updateStudy(defaultStudy(),'assignment','old:1','ignore'),term:'all'};
    expect(reminderScope(assignments,list,prefs,now).map(a=>a.id)).toEqual(['current:1','future:1','unknown:1']);
  });
});
describe('字幕导出',()=>{
  it('保留毫秒和超过24小时的时间，缺失结束点时使用下一句时间',()=>{
    const lines=[{bg:1001,ed:0,res:'中文课堂'},{bg:3662003,ed:3664009,res:'下一句'}];
    expect(subtitleExport(lines,'srt')).toContain('00:00:01,001 --> 01:01:02,003');
    expect(subtitleExport(lines,'txt')).toContain('[01:01:02] 下一句');
    expect(subtitleTime(90061001,true)).toBe('25:01:01,001');
  });
});
