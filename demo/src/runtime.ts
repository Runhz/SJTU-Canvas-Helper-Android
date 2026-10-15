import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { courses as demoCourses, HOUR, type Assignment, type Course, type CourseFile, type ReminderSettings } from './domain';
import {subtitleTime,type SubtitleLine} from './study';

export const NATIVE = isTauri();
export const NO_DEADLINE = 8_640_000_000_000_000;
export interface ExtraLoginStatus { jaccount:boolean;canvas:boolean;legacy:boolean;cloud:boolean;checkedAt:number }
export interface AccountConfig { accountId: string; token: string; cookie: string; modelKey: string; modelUrl: string; modelName: string; identityId?:string;displayName?:string;aiFileMaxMb?:number;aiContextChars?:number;services?:ExtraLoginStatus }
export interface SavedSettings { currentId: string; accounts: AccountConfig[] }
export interface ImportedFile { name: string; path: string; size: number; mime: string }
export interface NativeTask { id:string; name:string; courseId:string; resourceId:string; path:string; status:'running'|'queued'|'waiting'|'completed'|'failed'|'cancelled'; progress:number; reason:number }
export interface Recording { id:string; title:string; courseId:string; source:'canvas'|'videoSpace'|'legacy'; materialsId:number; raw:Record<string,unknown> }
export const native = <T=unknown>(method:string,args:Record<string,unknown>={}) => invoke<T>('native_call',{method,args});
export const api = <T=unknown>(action:string,args:Record<string,unknown>={}) => invoke<T>('canvas_request',{action,args});
const text = (html:unknown) => { const doc=new DOMParser().parseFromString(typeof html==='string'?html:'','text/html');return doc.body.textContent||''; };
const asRecord=(v:unknown):Record<string,any> => v&&typeof v==='object'?v as Record<string,any>:{};
// Android 10 can ship Chromium 74, before Promise.allSettled; keep native runtime compatible.
export function settleAll<T>(promises:Promise<T>[]):Promise<PromiseSettledResult<T>[]>{
  return Promise.all(promises.map(p=>p.then(value=>({status:'fulfilled' as const,value}),reason=>({status:'rejected' as const,reason}))));
}
export const blankAccount=():AccountConfig=>({accountId:'我的账号',token:'',cookie:'',modelKey:'',modelUrl:'https://api.deepseek.com/v1',modelName:'deepseek-flash'});
export function normalizeCanvasToken(raw:string){
  const token=raw.trim().replace(/^Bearer\s+/i,'').replace(/[\s\u200b\ufeff]/g,'');
  if(!/^[A-Za-z0-9_~.\-]{1,4096}$/.test(token))throw new Error('Token 格式不正确，请只粘贴访问令牌，不要包含说明文字');
  return token;
}
export async function configure(config:AccountConfig){return invoke<{id:number;name:string}>('configure_session',{config:{...config,token:normalizeCanvasToken(config.token)}});}
export async function restoreSession(config:AccountConfig){return invoke('restore_session',{config:{...config,token:normalizeCanvasToken(config.token)}});}
export async function savedSettings(){return native<SavedSettings>('loadSettings');}
export async function saveSettings(settings:SavedSettings){await native('saveSettings',{settings});}
export async function clearSession(){await invoke('clear_session');}
export async function startQrLogin(){return invoke<{uuid:string;websocketUrl:string}>('start_qr_login');}
export async function finishQrLogin(uuid:string){return invoke<{cookie:string}>('finish_qr_login',{uuid});}
export async function invokeCancelQr(uuid?:string){await invoke('cancel_qr_login',{uuid:uuid||null});}
export async function loadDashboard(onCourses?:(courses:Course[])=>void,onProgress?:(done:number,total:number)=>void){
  const rawCourses=await api<Record<string,any>[]>('courses');
  const courses:Course[]=rawCourses.map(mapCourse);
  const assignments:Assignment[]=[];
  const failedCourseIds:string[]=[];onCourses?.(courses);onProgress?.(0,courses.length);
  // Isolate course failures; the hook preserves previous results for failed courses.
  for(let offset=0;offset<courses.length;offset+=3){
    const batch=courses.slice(offset,offset+3);
    const results=await settleAll(batch.map(async c=>{
      const raw=await api<Record<string,any>[]>('assignments',{courseId:Number(c.id)});
      return raw.map(a=>mapAssignment(c.id,a));
    }));results.forEach((r,i)=>r.status==='fulfilled'?assignments.push(...r.value):failedCourseIds.push(batch[i].id));
    onProgress?.(Math.min(offset+3,courses.length),courses.length);
  }
  return {courses,assignments,failedCourseIds};
}
export function mapCourse(c:Record<string,any>,i=0):Course{
  const term=c.term;
  return {id:String(c.id),name:c.name||c.course_code||'未命名课程',code:c.course_code||'',teacher:c.teachers?.map((t:Record<string,string>)=>t.display_name).join('、')||'',color:demoCourses[i%4].color,glyph:demoCourses[i%4].glyph,files:[],term:term?.id?{id:String(term.id),name:term.name||'学期未标注',startAt:term.start_at?Date.parse(term.start_at):undefined,endAt:term.end_at?Date.parse(term.end_at):undefined}:undefined};
}
export function mapAssignment(courseId:string,a:Record<string,any>):Assignment{
  const sub=asRecord(a.submission);
  const submitted=Boolean(sub.submitted_at)&&sub.workflow_state!=='unsubmitted';
  return {id:`${courseId}:${a.id}`,courseId,title:a.name||'未命名作业',description:text(a.description)||'这项作业没有文字说明，请在课程平台核对完整要求。',dueAt:a.due_at?Date.parse(a.due_at):NO_DEADLINE,submission:submitted?(sub.late?'late':'submitted'):a.submission?'unsubmitted':'unknown',submittedAt:sub.submitted_at?Date.parse(sub.submitted_at):undefined,attachments:sub.attachments?.map((f:Record<string,any>)=>f.display_name||f.filename),allowedExtensions:a.allowed_extensions||[],uploadAllowed:a.submission_types?.includes('online_upload')===true,locked:a.locked_for_user===true,htmlUrl:a.html_url};
}
export async function loadFiles(course:Course):Promise<CourseFile[]>{
  const files=await api<Record<string,any>[]>('files',{courseId:Number(course.id)});
  return files.map(f=>({id:String(f.id),name:f.display_name||f.filename,size:f.size>1048576?`${(f.size/1048576).toFixed(1)} MB`:`${Math.ceil((f.size||0)/1024)} KB`,kind:(f.display_name||f.filename||'').split('.').pop().toUpperCase(),updated:f.updated_at?new Date(f.updated_at).toLocaleDateString('zh-CN'):'',raw:{id:f.id,size:f.size}}));
}
export async function enqueueFile(file:CourseFile,courseId:string,accountId:string){
  const plan=await api<Record<string,unknown>>('downloadPlan',{file:file.raw});
  return native('enqueueDownload',{...plan,resourceId:String(plan.resourceId),accountId,courseId});
}
export async function refreshReminders(accountId:string,assignments:Assignment[],settings:ReminderSettings,scope:Record<string,unknown>={}){
  await native('syncReminders',{accountId,assignments,settings,...scope,syncedAt:Date.now()});
}
export async function pickAttachments(){return (await native<{files:ImportedFile[]}>('pickFiles')).files;}
export async function submitAssignment(item:Assignment,files:ImportedFile[]){
  if(!item.uploadAllowed||item.locked)throw new Error('该作业不支持附件提交或已锁定，请在课程平台核对');
  if(files.some(f=>f.size===0))throw new Error('请选择有内容的附件');
  if(item.allowedExtensions?.length&&files.some(f=>!item.allowedExtensions!.includes(f.name.split('.').pop()?.toLowerCase()||'')))throw new Error(`附件格式要求：${item.allowedExtensions.join('、')}`);
  const id=Number(item.id.split(':')[1]);
  return invoke<{status:'submitted'|'unknown';message?:string;receipt?:Record<string,any>}>('submit_work',{courseId:Number(item.courseId),assignmentId:id,paths:files.map(f=>f.path)});
}
export async function acceptExtraCookie(account:AccountConfig,cookie:string){
  const next={...account,cookie};await configure(next);
  const status=await api<ExtraLoginStatus>('extraLoginStatus');
  if(!status.jaccount)throw new Error('jAccount 凭据未通过官方接口验证，请重新登录');
  next.services={...status,checkedAt:Date.now()};
  return {account:next,video:status.canvas||status.legacy,cloud:status.cloud};
}
export async function verifyServices(account:AccountConfig,url?:string){
  const result=await native<{cookie:string}>('openLogin',url?{url}:{});
  return acceptExtraCookie(account,result.cookie);
}
export async function loadRecordings(course:Course):Promise<Recording[]>{
  const values=await api<Record<string,any>[]>('videos',{courseId:Number(course.id)});
  return values.map(v=>({id:String(v.videoId||v.video_id||v.id),title:v.videoName||v.video_name||v.title||'课堂录播',courseId:course.id,source:v.source||'canvas',materialsId:v.materialCourseId||v.material_course_id||v.courseId||v.course_id||0,raw:{}}));
}
export async function recordingTracks(recording:Recording){
  const info=await api<Record<string,any>>('videoInfo',{source:recording.source,videoId:recording.id});
  const tracks=(info.videoPlayResponseVoList||info.video_play_response_vo_list||[]).map((t:Record<string,any>)=>({url:t.rtmpUrlHdv||t.rtmp_url_hdv,headers:{Referer:recording.source==='canvas'?'https://v.sjtu.edu.cn/':'https://courses.sjtu.edu.cn/'}}));
  if(!tracks.length)throw new Error('这段录播暂无可播放机位');return tracks;
}
export async function playRecording(recording:Recording,positionMs?:number){
  const tracks=await recordingTracks(recording);await native('openPlayer',{tracks,title:recording.title,resourceId:`${recording.source}:${recording.id}`,...(positionMs===undefined?{}:{positionMs})});
}
export async function enqueueRecording(recording:Recording,accountId:string,track=0){
  const plan=await api<Record<string,unknown>>('videoDownloadPlan',{source:recording.source,videoId:recording.id,track,name:`${recording.title} · 机位${track+1}.mp4`});
  return native('enqueueDownload',{...plan,accountId,courseId:recording.courseId,resourceId:`${recording.source}:${recording.id}:${track}`});
}
export interface ChatMessage {role:'user'|'assistant';content:string}
export async function ai(mode:string,args:Record<string,unknown>,question:string,onText:(text:string)=>void,history:ChatMessage[]=[],options:{requestId?:string;onPhase?:(s:string)=>void}={}){
  const channel=new Channel<string>();channel.onmessage=onText;
  const phases=new Channel<string>();phases.onmessage=s=>options.onPhase?.(s);
  return invoke<string>('ai_chat',{mode,args,messages:[...history.slice(-12),{role:'user',content:question}],onChunk:channel,onPhase:phases,requestId:options.requestId||null});
}
export const cancelAi=(requestId:string)=>invoke('cancel_ai',{requestId});
export const modelList=(url:string,key:string)=>invoke<string[]>('list_models',{url,key});
export interface ModelCapabilities { contextTokens:number|null;vision:boolean|null;maxFileBytes:number|null;inputTypes:string[] }
export const modelCapabilities=(config:AccountConfig)=>invoke<ModelCapabilities>('model_capabilities',{url:config.modelUrl,key:config.modelKey,model:config.modelName});
export function testModel(config:AccountConfig,onText:(s:string)=>void,onPhase:(s:string)=>void){const onChunk=new Channel<string>();onChunk.onmessage=onText;const phases=new Channel<string>();phases.onmessage=onPhase;return invoke<string>('test_model',{config,requestId:`test-${Date.now()}`,onChunk,onPhase:phases});}
export async function materialText(recording:Recording){
  const info=await api<Record<string,any>>('videoInfo',{source:recording.source,videoId:recording.id});
  const materialsId=info.courId||info.cour_id||recording.materialsId;
  if(!materialsId)throw new Error('该录播未提供字幕与切片资料标识');
  let subtitle:Record<string,any>={};let slides:Record<string,any>[]=[];
  const results=await settleAll<any>([api<Record<string,any>>('subtitles',{courseId:materialsId}),api<Record<string,any>[]>('slides',{courseId:materialsId})]);
  if(results[0].status==='fulfilled')subtitle=results[0].value;
  if(results[1].status==='fulfilled')slides=results[1].value;
  if(results.every(r=>r.status==='rejected'))throw new Error('字幕与课件切片均未读取成功，请检查登录状态或稍后重试');
  const lines:SubtitleLine[]=(subtitle.beforeAssemblyList||subtitle.before_assembly_list||[]).map((s:Record<string,any>)=>({bg:Number(s.bg)||0,ed:Number(s.ed)||0,res:String(s.res||'')}));
  const citation=(ms:number)=>`[${subtitleTime(ms)}](#video=${encodeURIComponent(recording.source+':'+recording.id)}&t=${Math.floor(ms/1000)})`;
  const text=`课堂：${recording.title}\n`+lines.map(s=>`[字幕] ${citation(s.bg)} ${s.res}`).join('\n')+'\n'+slides.map(s=>`[PPT OCR] ${s.createSec!==null&&s.createSec!==undefined&&Number.isFinite(Number(s.createSec))?citation(Number(s.createSec)*1000):'时间未知'} ${s.ocrText||(s.ocr||[]).map((w:Record<string,string>)=>w.word).join(' ')}`).join('\n');
  const hasText=lines.some(line=>line.res.trim())||slides.some(s=>(s.ocrText||(s.ocr||[]).map((w:Record<string,string>)=>w.word).join(' ')).trim());
  return {lines,slides,text:hasText?text:''};
}
