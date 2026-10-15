import { describe, expect, it } from 'vitest';
import { assignmentCalendar, foldCalendarLine, matchesAssignment, matchesDeadline, orderCourses } from './productivity';
import { courses, createAssignments, HOUR } from './domain';
import { studyPreferences } from './study';

const now = Date.parse('2026-10-15T15:30:00+08:00');
const item = createAssignments(now)[0];
describe('截止筛选和日历互通', () => {
  it('按中国标准时间的自然日筛选，未来七天不混入逾期和无日期作业', () => {
    expect(matchesDeadline({...item,dueAt:Date.parse('2026-10-15T00:00:00+08:00')},'today',now)).toBe(true);
    expect(matchesDeadline({...item,dueAt:Date.parse('2026-10-16T00:00:00+08:00')},'today',now)).toBe(false);
    expect(matchesDeadline({...item,dueAt:now-1},'week',now)).toBe(false);
    expect(matchesDeadline({...item,dueAt:now+7*24*HOUR},'week',now)).toBe(false);
    expect(matchesDeadline({...item,dueAt:now+24*HOUR},'week',now)).toBe(true);
    expect(matchesDeadline({...item,dueAt:1e15},'undated',now)).toBe(true);
    expect(matchesDeadline({...item,dueAt:1e15},'overdue',now)).toBe(false);
  });
  it('搜索合并标题、课程名和代码，兼容空格与大小写', () => {
    expect(matchesAssignment(item,courses,'cs3310 Socket')).toBe(true);
    expect(matchesAssignment(item,courses,'概率')).toBe(false);
  });
  it('日历仅包含可核实的未提交截止日期，转义并保留稳定 UID', () => {
    const a={...item,title:'中文,作业;一\\二\n换行',id:'特殊:ID'};
    const data=assignmentCalendar([a,{...item,id:'done',submission:'submitted'},{...item,id:'unknown',submission:'unknown'},{...item,id:'none',dueAt:1e15}],courses,now,true);
    expect(data.count).toBe(1);
    expect(data.text).toContain('SUMMARY:[演示] 中文\\,作业\\;一\\\\二\\n换行');
    expect(data.text).toContain('DTSTAMP:20261015T073000Z');
    expect(data.text).not.toContain('VALARM');
    const uid=data.text.match(/UID:.+/)?.[0];
    expect(assignmentCalendar([a],courses,now+HOUR).text).toContain(uid);
    expect(data.text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('中文及 emoji 在 UTF-8 字节边界折行，重新展开后内容完全一致', () => {
    const original='SUMMARY:'+ '课堂🧑‍🎓复习'.repeat(35);
    const folded=foldCalendarLine(original);
    expect(folded.split('\r\n').every(line=>new TextEncoder().encode(line).length<=75)).toBe(true);
    expect(folded.replace(/\r\n /g,'')).toBe(original);
  });
  it('置顶稳定排序，旧偏好数据可以迁移且不改变学期和忽略记录', () => {
    expect(orderCourses(courses,['ml','math']).map(c=>c.id)).toEqual(['math','ml','theory','net','os']);
    expect(studyPreferences({term:'all',ignoredAssignments:['a1']})).toEqual({term:'all',ignoredAssignments:['a1'],hiddenAssignments:[],hiddenCourses:[],pinnedCourses:[]});
  });
});
