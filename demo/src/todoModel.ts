import type {Assignment} from './domain';
import type {ScheduleEvent} from './UpcomingSchedule';

export type UnifiedTodoKind='assignment'|'schedule';
export type UnifiedTodoState='open'|'done'|'overdue'|'scheduled';
export interface UnifiedTodo {id:string;kind:UnifiedTodoKind;title:string;course:string;courseId?:string;at:number;endAt:number;state:UnifiedTodoState;location?:string;editable:boolean}

export function unifiedTodos(assignments:Assignment[],events:ScheduleEvent[],now:number):UnifiedTodo[]{
  const rows:UnifiedTodo[]=assignments.filter(item=>Number.isFinite(item.dueAt)&&item.dueAt<1e15).map(item=>({id:`assignment:${item.id}`,kind:'assignment',title:item.title,courseId:item.courseId,course:'课程作业',at:item.dueAt,endAt:item.dueAt,state:item.submission==='submitted'||item.submission==='late'?'done':item.dueAt<=now?'overdue':'open',editable:false}));
  for(const event of events)rows.push({id:`schedule:${event.id}`,kind:'schedule',title:event.title,course:event.course,at:event.startAt,endAt:event.endAt,state:'scheduled',location:event.location,editable:true});
  return rows.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
}
