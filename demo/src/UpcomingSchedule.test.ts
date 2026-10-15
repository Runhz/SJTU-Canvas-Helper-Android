import {describe,expect,it} from 'vitest';
import {mapSchedule} from './UpcomingSchedule';
describe('actual calendar events',()=>{it('displays only valid future/current events in time order and removes duplicates',()=>{
  const event=(id:number,start:string,extra={})=>({id,title:'课程日程',start_at:start,...extra});
  const result=mapSchedule([event(2,'2026-10-15T15:00:00Z'),event(1,'2026-10-15T12:00:00Z'),event(1,'2026-10-15T12:00:00Z'),event(3,'2026-10-14T12:00:00Z'),event(4,'invalid'),event(5,'2026-10-16T12:00:00Z',{workflow_state:'deleted'})],Date.parse('2026-10-15T10:00:00Z'));
  expect(result.map(e=>e.id)).toEqual(['1','2']);
});});
