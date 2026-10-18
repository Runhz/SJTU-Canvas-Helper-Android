import {afterEach,describe,it,expect} from 'vitest';
import {loadScheduleEdits,saveScheduleEdits,mergeSchedule,validEvent} from './personalSchedule';
import type {ScheduleEvent} from './UpcomingSchedule';
const event=(id:string,startAt=100):ScheduleEvent=>({id,title:'电力电子',startAt,endAt:startAt+50,location:'东上院',course:'EE230',allDay:false});
afterEach(()=>localStorage.clear());
describe('personal schedule overlay',()=>{
  it('survives a platform refresh and sorts personal and edited events by their chosen times',()=>{
    const edits=[{id:'1',value:{...event('1',300),location:'新教室'}},{id:'personal-2',value:event('personal-2',200)}];
    saveScheduleEdits('alice',edits);const result=mergeSchedule([event('1',100),event('3',400)],loadScheduleEdits('alice'),0);
    expect(result.map(e=>e.id)).toEqual(['personal-2','1','3']);expect(result[1].location).toBe('新教室');expect(loadScheduleEdits('bob')).toEqual([]);
  });
  it('can remove and restore an event without editing the Canvas event',()=>{
    const original=event('1');expect(mergeSchedule([original],[{id:'1',value:original,deleted:true}],0)).toEqual([]);
    expect(mergeSchedule([original],[{id:'1',value:original,deleted:false}],0)).toEqual([original]);expect(original.startAt).toBe(100);
  });
  it('rejects broken intervals and does not display finished personal events',()=>{expect(validEvent({...event('1'),endAt:0})).toBe(false);expect(mergeSchedule([],[{id:'personal-1',value:event('personal-1')}],200)).toEqual([])});
});
