import {describe,expect,it} from 'vitest';
import {unifiedTodos} from './todoModel';

describe('unified todos',()=>{
  it('merges assignments and editable schedule events in chronological order',()=>{
    const rows=unifiedTodos([{id:'a1',courseId:'net',title:'实验',description:'',dueAt:300,submission:'unsubmitted'},{id:'a2',courseId:'math',title:'已交',description:'',dueAt:100,submission:'submitted'}],[{id:'lesson',title:'课堂',startAt:200,endAt:260,location:'东上院',course:'计算机网络',allDay:false}],250);
    expect(rows.map(row=>row.id)).toEqual(['assignment:a2','schedule:lesson','assignment:a1']);
    expect(rows.map(row=>row.state)).toEqual(['done','scheduled','open']);
    expect(rows.find(row=>row.id==='schedule:lesson')).toMatchObject({editable:true,location:'东上院'});
  });
  it('marks unfinished past assignments overdue',()=>{
    expect(unifiedTodos([{id:'a',courseId:'c',title:'作业',description:'',dueAt:99,submission:'unsubmitted'}],[],100)[0].state).toBe('overdue');
  });
});
