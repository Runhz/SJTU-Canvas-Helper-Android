import {ScheduleEditor} from './ScheduleEditor';
import {loadScheduleEdits,readScheduleEdits,mergeSchedule} from './personalSchedule';
import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarClock, MapPin, RefreshCw } from 'lucide-react';
import { ResourceCache, CACHE_TTL } from './ResourceCache';
import * as runtime from './runtime';
import type { Assignment,Course } from './domain';
import {unifiedTodos} from './todoModel';
export interface ScheduleEvent { id:string; title:string; startAt:number; endAt:number; location:string; course:string; allDay:boolean }
export function mapSchedule(values:Record<string,any>[],now:number):ScheduleEvent[] {
  const unique=new Map<string,ScheduleEvent>();
  for(const value of values){const startAt=Date.parse(value.start_at),endAt=Date.parse(value.end_at||value.start_at);if(value.workflow_state==='deleted'||!Number.isFinite(startAt)||!Number.isFinite(endAt)||endAt<now||value.hidden)continue;const id=String(value.id);unique.set(id,{id,title:String(value.title||'课程日程'),startAt,endAt,location:String(value.location_name||''),course:String(value.context_name||''),allDay:!!value.all_day});}
  return [...unique.values()].sort((a,b)=>a.startAt-b.startAt);
}
export function UpcomingSchedule({account,courses,assignments=[]}:{account:runtime.AccountConfig|null;courses:Course[];assignments?:Assignment[]}) {
  const scope=JSON.stringify([account?.accountId||'',account?.identityId||'']);
  const [editing,setEditing]=useState(false),[edits,setEdits]=useState(()=>loadScheduleEdits(scope));
  useEffect(()=>{
    let active=true;
    const load=()=>{void readScheduleEdits(scope).then(value=>{if(active)setEdits(value)}).catch(()=>{if(active)setEdits(loadScheduleEdits(scope))});};
    load();window.addEventListener('canvas-schedule-edited',load);
    return()=>{active=false;window.removeEventListener('canvas-schedule-edited',load)};
  },[scope]);
  const [events,setEvents]=useState<ScheduleEvent[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
  const preference=`canvas-calendar-reminder:${account?.accountId}:${account?.identityId}`;
  const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem(preference)==='true';}catch{return false;}});
  const cache=useRef<ResourceCache|null>(null),generation=useRef(0),pending=useRef(false);
  const ids=courses.map(c=>Number(c.id)).filter(n=>Number.isSafeInteger(n)&&n>0).sort((a,b)=>a-b).join(',');
  async function refresh(force=false){
    const store=cache.current,ticket=generation.current;if(!store||!account||pending.current)return;pending.current=true;setBusy(true);setError('');
    const now=Date.now(),startDate=new Date(now).toISOString().slice(0,10),endDate=new Date(now+7*86400_000).toISOString().slice(0,10),key=`${ids}:${startDate}`;
    const cached=store.peek<ScheduleEvent[]>(key);if(cached){setEvents(mapFuture(cached));setLoaded(true);}
    try{const data=await store.get(key,CACHE_TTL.calendar,async()=>{const courseIds=ids.split(',').filter(Boolean).map(Number);const batches=[[] as number[]];for(let i=0;i<courseIds.length;i+=10)batches.push(courseIds.slice(i,i+10));const values:Record<string,any>[]=[];for(const batch of batches)values.push(...await runtime.api<Record<string,any>[]>('calendarEvents',{startDate,endDate,courseIds:batch}));return mapSchedule(values,now);},force);if(generation.current===ticket){setEvents(mapFuture(data));setLoaded(true);}}
    catch(e){if(generation.current===ticket){setError(String(e));setLoaded(true)}}finally{if(generation.current===ticket){setBusy(false);pending.current=false;}}
  }
  const combined=mergeSchedule(events,edits,Date.now());
  const unified=unifiedTodos(assignments,combined,Date.now());
  const mapFuture=(data:ScheduleEvent[])=>data.filter(e=>e.endAt>=Date.now());
  useEffect(()=>{generation.current++;pending.current=false;cache.current=new ResourceCache(`canvas-calendar:${account?.accountId}:${account?.identityId}`);setEvents([]);setLoaded(false);void refresh();const resume=()=>{if(!document.hidden)void refresh();};const timer=setInterval(resume,60_000);document.addEventListener('visibilitychange',resume);return()=>{generation.current++;cache.current?.close();clearInterval(timer);document.removeEventListener('visibilitychange',resume);};},[account?.accountId,account?.identityId,ids]);
  useEffect(()=>{if(!runtime.NATIVE||!account||(!loaded&&enabled))return;void runtime.native('syncCalendar',{accountId:account.accountId,events:combined,enabled}).catch(e=>setError(String(e)));},[enabled,events,edits,loaded,account?.accountId]);
  if(!runtime.NATIVE||!account)return null;
  return <section className="schedule-panel" aria-labelledby="schedule-heading"><div className="section-heading"><h2 id="schedule-heading"><CalendarClock size={17}/>近期安排</h2><button className="text-button" onClick={()=>setEditing(true)}>管理日程</button><button className="text-button" disabled={busy} onClick={()=>void refresh(true)} aria-label="刷新日程"><RefreshCw size={14} className={busy?'spin':''}/></button></div>
    {unified.length?unified.slice(0,4).map(item=><article key={item.id} className={`schedule-event unified-${item.kind} unified-${item.state}`}><div><time>{new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(item.at)}</time><strong>{item.kind==='assignment'?(item.state==='done'?'已完成':item.state==='overdue'?'已逾期':'待完成'):(item.at-Date.now()<0?'进行中':new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(item.at))}</strong></div><div><h3>{item.title}</h3><p>{item.kind==='assignment'?'课程作业':item.course}</p>{item.location&&<small><MapPin size={11}/>{item.location}</small>}</div></article>):<p className="schedule-empty">{busy?'正在读取日程…':'暂无近期安排'}</p>}
    {error&&<p className="schedule-empty" role="status">日程暂未更新，可稍后重试</p>}
    <button className="text-button" aria-pressed={enabled} onClick={async()=>{try{if(!enabled)await runtime.native('requestNotifications');localStorage.setItem(preference,String(!enabled));setEnabled(!enabled);}catch(e){setError(String(e));}}}><Bell size={13}/>{enabled?'日程提醒已开启':'开启日程提醒'}</button>
    {editing&&<ScheduleEditor scope={scope} events={events} edits={edits} onClose={()=>setEditing(false)}/>}
  </section>;
}
