import { describe, it, expect } from 'vitest';
import { createAssignments, sortAssignments, statusOf, submitDemo, reminderCandidates, DEFAULT_REMINDERS, HOUR, downloadProgress, countdown } from './domain';
const now = Date.parse('2026-10-15T08:00:00+08:00');
describe('作业控制面板', () => {
  it('按截止日期升序，且不修改原始数组', () => {
    const items = createAssignments(now), original = items.map(a=>a.id);
    const sorted = sortAssignments(items);
    expect(sorted.map(a=>a.dueAt)).toEqual([...items.map(a=>a.dueAt)].sort((a,b)=>a-b));
    expect(items.map(a=>a.id)).toEqual(original);
  });
  it('区分逾期未提交、临近截止与已提交', () => {
    const items = createAssignments(now);
    expect(statusOf(items[0],now).text).toBe('即将截止');
    expect(statusOf(items[3],now).text).toBe('已逾期');
    expect(statusOf(items[4],now).text).toBe('已提交');
  });
  it('截止瞬间转为逾期，并保持倒计时非负', () => {
    const a = {...createAssignments(now)[0],dueAt:now};
    expect(statusOf(a,now).text).toBe('已逾期');
    expect(countdown(now+1,now)).toBe('还剩 1 分钟');
    expect(countdown(now-2*HOUR,now)).toBe('已逾期 2 小时 0 分钟');
  });
  it('必须选择附件；普通提交与迟交分别记录', () => {
    const items=createAssignments(now);
    expect(()=>submitDemo(items,'a1',[],now)).toThrow('请至少选择一个附件');
    const result=submitDemo(submitDemo(items,'a1',['中文作业.pdf'],now),'a4',['late.zip'],now);
    expect(result[0].submission).toBe('submitted');
    expect(result[3].submission).toBe('late');
    expect(result[0].attachments).toEqual(['中文作业.pdf']);
    expect(items[0].submission).toBe('unsubmitted');
  });
});
describe('截止提醒', () => {
  it('24小时、2小时、30分钟、逾期各阶段只产生对应的一条提醒', () => {
    const a={...createAssignments(now)[0],dueAt:now+25*HOUR};
    const seen=new Set<string>();
    expect(reminderCandidates([a],DEFAULT_REMINDERS,now,seen)).toHaveLength(0);
    for(const hours of [1,23,24.5,25]) {
      const candidates=reminderCandidates([a],DEFAULT_REMINDERS,now+hours*HOUR,seen);
      expect(candidates).toHaveLength(1);
      candidates.forEach(r=>seen.add(r.id));
      expect(reminderCandidates([a],DEFAULT_REMINDERS,now+hours*HOUR,seen)).toHaveLength(0);
    }
    expect(seen.size).toBe(4);
  });
  it('已提交和迟交均不再提醒', () => {
    const items=submitDemo(submitDemo(createAssignments(now),'a1',['a.pdf'],now),'a4',['b.pdf'],now);
    expect(reminderCandidates(items.filter(a=>['a1','a4'].includes(a.id)),DEFAULT_REMINDERS,now+100*HOUR,new Set())).toHaveLength(0);
  });
  it('关闭总开关、单个提前量与逾期提醒都生效', () => {
    const a={...createAssignments(now)[0],dueAt:now+HOUR};
    expect(reminderCandidates([a],{...DEFAULT_REMINDERS,enabled:false},now,new Set())).toEqual([]);
    expect(reminderCandidates([a],{...DEFAULT_REMINDERS,offsets:[]},now,new Set())).toEqual([]);
    expect(reminderCandidates([{...a,dueAt:now-1}],{...DEFAULT_REMINDERS,overdue:false},now,new Set())).toEqual([]);
  });
  it('修改截止时间后使用新的提醒身份', () => {
    const a={...createAssignments(now)[0],dueAt:now+HOUR};
    const sent=reminderCandidates([a],DEFAULT_REMINDERS,now,new Set());
    const next=reminderCandidates([{...a,dueAt:now+HOUR+1}],DEFAULT_REMINDERS,now,new Set(sent.map(r=>r.id)));
    expect(next).toHaveLength(1);
  });
});
it('下载取消后不再增长，完成后不超过100%', () => {
  expect(downloadProgress([{id:'a',courseId:'net',name:'a',status:'running',progress:99},{id:'b',courseId:'net',name:'b',status:'cancelled',progress:20}])).toEqual([{id:'a',courseId:'net',name:'a',status:'completed',progress:100},{id:'b',courseId:'net',name:'b',status:'cancelled',progress:20}]);
});
