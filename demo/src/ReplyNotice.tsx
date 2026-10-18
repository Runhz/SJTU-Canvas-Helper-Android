import {useEffect,useState} from 'react';
import {BellRing,Check,X} from 'lucide-react';
import * as runtime from './runtime';
const key=(scope:string)=>'canvas-ai-reply-reminder:'+scope;
export function replyReminder(scope:string){try{return localStorage.getItem(key(scope))!=='off'}catch{return true}}
export function ReplyReminderSetting({scope}:{scope:string}){
  const [enabled,setEnabled]=useState(()=>replyReminder(scope));
  return <label className="toggle-row reply-reminder-setting"><span><strong>AI 回答完成提醒</strong><small>离开对话时提醒；声音与振动跟随系统通知设置</small></span><input aria-label="AI 回答完成提醒" type="checkbox" checked={enabled} onChange={e=>{const value=e.target.checked;setEnabled(value);try{localStorage.setItem(key(scope),value?'on':'off')}catch{}if(value&&runtime.NATIVE)void runtime.native('requestNotifications').catch(()=>{})}}/><i className="toggle"/></label>;
}
export function ReplyNotice({scope,onOpen}:{scope:string;onOpen:(id:string)=>void}){
  const [reply,setReply]=useState<{id:string;title:string}>();
  useEffect(()=>{let timeout:ReturnType<typeof setTimeout>|undefined;const complete=(event:Event)=>{const item=(event as CustomEvent).detail;if(item?.scope!==scope||!replyReminder(scope))return;setReply({id:item.id,title:item.title});clearTimeout(timeout);timeout=setTimeout(()=>setReply(undefined),10000);if(runtime.NATIVE)void runtime.native('notifyAiComplete',{scope,conversationId:item.id}).catch(()=>{})};window.addEventListener('canvas-ai-complete',complete);return()=>{clearTimeout(timeout);window.removeEventListener('canvas-ai-complete',complete)}},[scope]);
  if(!reply)return null;
  return <aside className="reply-notice" role="status"><BellRing size={19}/><button onClick={()=>{onOpen(reply.id);setReply(undefined)}}><strong>AI 回答已完成</strong><span>{reply.title}</span></button><button className="icon-button" aria-label="关闭回答提醒" onClick={()=>setReply(undefined)}><X size={16}/></button></aside>;
}
