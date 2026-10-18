import * as runtime from './runtime';
import {saveConversation,savedPayload,type Conversation} from './chatHistory';
import {parseStudyAnswer,visibleAnswer} from './studyAssist';
export interface ChatJob{row:Conversation;busy:boolean;unread:boolean;phase:string;error:string;requestId:string;lastQuestion:string;raw:string;stopped:boolean;flush?:ReturnType<typeof setTimeout>;save?:ReturnType<typeof setTimeout>;storageError:string}
const jobs=new Map<string,ChatJob>(),listeners=new Set<()=>void>();
const visible=new Map<string,number>();
export function viewChat(id:string,open:boolean){if(!open)return()=>{};visible.set(id,(visible.get(id)||0)+1);return()=>{const count=(visible.get(id)||1)-1;if(count)visible.set(id,count);else visible.delete(id)}}
let activeScope='';
export function subscribeChat(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
function announce(){listeners.forEach(fn=>fn());window.dispatchEvent(new Event('canvas-chat-updated'))}
export function chatJob(id:string){return jobs.get(id)}
export function sourceJob(scope:string,source:string){return [...jobs.values()].filter(j=>j.row.scope===scope&&j.row.source===source).sort((a,b)=>b.row.updatedAt-a.row.updatedAt)[0]}
export function chatSummary(scope:string){const rows=[...jobs.values()].filter(j=>j.row.scope===scope);return{busy:rows.some(j=>j.busy),completed:rows.some(j=>j.unread)}}
export function latestChat(scope:string){return [...jobs.values()].filter(j=>j.row.scope===scope&&(j.busy||j.unread)).sort((a,b)=>b.row.updatedAt-a.row.updatedAt)[0]}
export function markChatRead(id:string){const job=jobs.get(id);if(job?.unread){job.unread=false;announce()}}
function persist(job:ChatJob,now=false){
  const write=()=>{job.save=undefined;void saveConversation(job.row).then(()=>{if(job.storageError){job.storageError='';announce()}}).catch(()=>{job.storageError='对话暂未保存，请检查可用空间';announce()})};
  if(now){clearTimeout(job.save);write()}else if(!job.save)job.save=setTimeout(write,650);
}
export function patchChat(row:Conversation){const job=jobs.get(row.id);if(job){job.row={...row,updatedAt:Date.now()};persist(job);announce();return job.row}return row}
function materialize(j:ChatJob){if(j.raw&&j.busy){const turn=j.row.turns?.[j.row.turns.length-1];if(turn)j.row={...j.row,messages:[...j.row.messages.slice(0,turn.messageIndex+1),{role:'assistant',content:visibleAnswer(j.raw)}]}}}
export function stopChat(id:string){const j=jobs.get(id);if(!j?.busy)return;materialize(j);j.stopped=true;j.busy=false;clearTimeout(j.flush);j.flush=undefined;j.row={...j.row,interrupted:true};persist(j,true);if(runtime.NATIVE)void runtime.cancelAi(j.requestId).catch(()=>{});announce()}
export function activateChatScope(scope:string){if(scope===activeScope)return;activeScope=scope;for(const [id,j]of jobs)if(j.row.scope!==scope){stopChat(id);jobs.delete(id)}announce()}
export function forgetChat(id:string){stopChat(id);jobs.delete(id);announce()}
export function flushChats(){for(const j of jobs.values()){materialize(j);persist(j,true)}}
export function startChat(row:Conversation,question:string){
  if(jobs.get(row.id)?.busy||!question.trim())return;
  if([...jobs.values()].filter(j=>j.row.scope===row.scope&&j.busy).length>=2)throw Error('已有两个回答正在生成，请先完成或停止一个');
  const requestId=`chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,snapshot=savedPayload(row.payload);
  const last=row.messages[row.messages.length-1];const previous=last?.role==='user'&&last?.content===question?row.messages.slice(0,-1):row.messages;
  const next=[...previous,{role:'user' as const,content:question}];
  const pendingArgs={...row.payload.args};delete pendingArgs.screenshot;
  const job:ChatJob={row:{...row,payload:{...row.payload,args:pendingArgs},messages:next,draft:'',followUps:[],interrupted:true,updatedAt:Date.now(),turns:[...(row.turns||[]),{id:requestId,messageIndex:previous.length,payload:snapshot,status:'open',createdAt:Date.now()}]},busy:true,unread:false,phase:'正在准备资料…',error:'',requestId,lastQuestion:question,raw:'',stopped:false,storageError:''};
  for(const [id,old]of jobs)if(jobs.size>=12&&!old.busy){persist(old,true);jobs.delete(id)}
  jobs.set(row.id,job);persist(job,true);announce();
  const flush=()=>{job.flush=undefined;if(job.stopped)return;job.row={...job.row,messages:[...next,{role:'assistant',content:visibleAnswer(job.raw)}],updatedAt:Date.now()};persist(job);announce()};
  const chunk=(text:string)=>{if(job.stopped||jobs.get(row.id)!==job)return;job.raw+=text;if(!job.flush)job.flush=setTimeout(flush,40)};
  const finish=(raw:string)=>{if(job.stopped||jobs.get(row.id)!==job)return;clearTimeout(job.flush);job.flush=undefined;const parsed=parseStudyAnswer(raw,snapshot);const symbols=[...(job.row.symbols||[])];for(const s of parsed.symbols){const old=symbols.find(v=>v.symbol===s.symbol);if(!old)symbols.push(s)}job.row={...job.row,messages:[...next,{role:'assistant',content:parsed.answer}],followUps:parsed.questions,symbols:symbols.slice(-60),interrupted:false,updatedAt:Date.now()};job.busy=false;job.unread=true;job.phase='回答完成';persist(job,true);announce();if(document.hidden||!visible.has(row.id))window.dispatchEvent(new CustomEvent('canvas-ai-complete',{detail:{scope:row.scope,id:row.id,title:job.row.title}}))};
  const fail=(e:unknown)=>{if(job.stopped||jobs.get(row.id)!==job)return;clearTimeout(job.flush);job.flush=undefined;job.row={...job.row,messages:job.raw?[...next,{role:'assistant',content:visibleAnswer(job.raw)}]:next,interrupted:true,updatedAt:Date.now()};job.error=String(e).replace(/^Error:\s*/,'');job.busy=false;persist(job,true);announce()};
  // A preceding image remains part of this discussion, while a newly attached image is sent once.
  const reference=[...(row.turns||[])].reverse().find(t=>t.payload.args.screenshot&&t.payload.args.positionMs===snapshot.args.positionMs&&t.payload.args.resourceId===snapshot.args.resourceId&&JSON.stringify(t.payload.args.file)===JSON.stringify(snapshot.args.file));
  const requestArgs={...snapshot.args,...(!snapshot.args.screenshot&&reference?{screenshot:reference.payload.args.screenshot}:{}),readMode:row.readMode,studyAssist:true,knownSymbols:(row.symbols||[]).map(s=>`${s.symbol}：${s.meaning}（原文：${s.evidence}）`).join('\n')};
  const request=runtime.NATIVE?runtime.ai(snapshot.mode,requestArgs,question,chunk,previous,{requestId,onPhase:phase=>{if(!job.stopped){job.phase=phase;announce()}}}):demo(chunk,()=>job.stopped);
  void request.then(finish,fail);
}
async function demo(chunk:(s:string)=>void,stopped:()=>boolean){const text='这是本地交互演示，未调用模型。\n\n可以先区分**结论**和它依赖的条件，再对照当前推导。\n\n$$u_L=L\\frac{di}{dt}$$\n\n你可以选择下面的追问，或引用回答中的某一句继续问。';for(const part of text.match(/.{1,16}|\n/g)||[]){await new Promise(r=>setTimeout(r,35));if(stopped())throw Error('已停止');chunk(part)}return text+'\n<study_meta>{"questions":["这个结论成立需要哪些条件？","能举一个具体例子吗？","能展开中间的推导吗？"],"symbols":[]}</study_meta>'}
if(typeof window!=='undefined'){window.addEventListener('pagehide',flushChats);document.addEventListener('visibilitychange',()=>{if(document.hidden)flushChats()})}
