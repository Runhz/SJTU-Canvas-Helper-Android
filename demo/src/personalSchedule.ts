import type {ScheduleEvent} from './UpcomingSchedule';
export interface ScheduleEdit{id:string;value?:ScheduleEvent;deleted?:boolean}
export const scheduleKey=(scope:string)=>`canvas-personal-schedule-v1:${scope}`;
export function validEvent(value:unknown):value is ScheduleEvent{const e=value as ScheduleEvent;return !!e&&typeof e.id==='string'&&typeof e.title==='string'&&!!e.title.trim()&&Number.isFinite(e.startAt)&&Number.isFinite(e.endAt)&&e.endAt>=e.startAt&&typeof e.location==='string'&&typeof e.course==='string'&&typeof e.allDay==='boolean'}
export function loadScheduleEdits(scope:string):ScheduleEdit[]{try{const rows=JSON.parse(localStorage.getItem(scheduleKey(scope))||'[]');return Array.isArray(rows)?rows.filter(r=>typeof r.id==='string'&&(r.deleted===true||validEvent(r.value)&&r.value.id===r.id)):[]}catch{return[]}}
export function saveScheduleEdits(scope:string,rows:ScheduleEdit[]){localStorage.setItem(scheduleKey(scope),JSON.stringify(rows));window.dispatchEvent(new CustomEvent('canvas-schedule-edited',{detail:scope}))}
export function mergeSchedule(events:ScheduleEvent[],edits:ScheduleEdit[],now:number){const map=new Map(events.map(e=>[e.id,e]));for(const edit of edits){if(edit.deleted)map.delete(edit.id);else if(validEvent(edit.value))map.set(edit.id,edit.value)}return [...map.values()].filter(e=>e.endAt>=now).sort((a,b)=>a.startAt-b.startAt||a.id.localeCompare(b.id))}
export function localDateTime(value:number){const date=new Date(value);return new Date(value-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}
