import { describe,it,expect } from 'vitest';
import { mapAssignment,NO_DEADLINE } from './runtime';
import { DEFAULT_REMINDERS,reminderCandidates } from './domain';
describe('真实 Canvas 数据映射',()=>{
  it('没有提交证据时保留未知，不能算已提交',()=>{
    const a=mapAssignment('9',{id:1,name:'未知状态',due_at:null});
    expect(a.submission).toBe('unknown');expect(a.dueAt).toBe(NO_DEADLINE);
    expect(reminderCandidates([a],DEFAULT_REMINDERS,Date.now(),new Set())).toEqual([]);
  });
  it('服务端提交记录分别映射已提交和迟交',()=>{
    const raw={id:1,name:'测试作业',due_at:'2026-10-15T10:00:00Z',submission:{submitted_at:'2026-10-15T09:00:00Z',workflow_state:'submitted',attachments:[{display_name:'中文.pdf'}]}};
    const a=mapAssignment('9',raw);expect(a.submission).toBe('submitted');expect(a.attachments).toEqual(['中文.pdf']);
    expect(mapAssignment('9',{...raw,submission:{...raw.submission,late:true}}).submission).toBe('late');
  });
  it('无截止时间作业保留在清单但不安排截止提醒',()=>{
    const a=mapAssignment('9',{id:1,name:'长期练习',due_at:null,submission:{workflow_state:'unsubmitted'}});
    expect(a.submission).toBe('unsubmitted');expect(a.dueAt).toBe(NO_DEADLINE);
    expect(reminderCandidates([a],DEFAULT_REMINDERS,Date.now(),new Set())).toEqual([]);
  });
  it('HTML 描述只提取文字，不执行远程脚本或嵌入内容',()=>{
    const a=mapAssignment('9',{id:1,name:'测试',description:'<p>请独立完成</p><img src="x" onerror="alert(1)">' });
    expect(a.description).toBe('请独立完成');expect(a.description).not.toContain('onerror');
  });
});
