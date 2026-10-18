import * as runtime from './runtime';
import type {CourseFile} from './domain';
import type {AiPayload} from './chatHistory';
import {subtitleExport,subtitleTime,type SubtitleLine} from './study';

export interface PreparedAttachment {id:string;name:string;mime:string;size:number;kind:string;courseId:string;resourceId:string;updatedAt:number}
export interface StudySource {key:string;name:string;kind:'file'|'subtitle'|'image';courseId:string;resourceId:string;mime:string;size?:number;file?:CourseFile;text?:string;image?:string;lines?:SubtitleLine[];prepared?:PreparedAttachment}
export const mimeFor=(name:string)=>({pdf:'application/pdf',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain',srt:'application/x-subrip',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',zip:'application/zip',mp4:'video/mp4'}[name.split('.').pop()?.toLowerCase()||'']||'application/octet-stream');
export function fileSource(file:CourseFile,courseId:string):StudySource{return {key:`file:${file.id}:${file.raw?.updatedAt||''}:${file.raw?.size??''}`,name:file.name,kind:'file',courseId,resourceId:file.id,mime:String(file.raw?.mime||mimeFor(file.name)),size:typeof file.raw?.size==='number'?file.raw.size:undefined,file};}
export function preparedSource(item:PreparedAttachment):StudySource{return {key:`prepared:${item.id}`,name:item.name,kind:item.kind==='file'?'file':item.kind==='image'?'image':'subtitle',courseId:item.courseId,resourceId:item.resourceId,mime:item.mime,size:item.size,prepared:item};}
export function seedSources(title:string,payload:AiPayload):StudySource[]{
  const args=payload.args,courseId=String(args.courseId||''),resourceId=String(args.resourceId||''),items:StudySource[]=[];
  const file=args.file as Record<string,unknown>|undefined;
  if(file?.id)items.push(fileSource({id:String(file.id),name:String(args.fileName||title),kind:'',size:'',updated:'',raw:file},courseId));
  if(Array.isArray(args.files))for(const file of args.files){if(file&&typeof file==='object'&&file.id)items.push(fileSource({id:String(file.id),name:String(file.name||`课程文件 ${file.id}`),kind:'',size:'',updated:'',raw:{id:Number(file.id)}},String(file.courseId||courseId)));}
  if(typeof args.text==='string'&&args.text.trim())items.push({key:`subtitles:${resourceId||title}`,name:String(args.title||title)+'.txt',kind:'subtitle',courseId,resourceId,mime:'text/plain',text:args.text,lines:Array.isArray(args.subtitleLines)?args.subtitleLines as SubtitleLine[]:undefined});
  if(typeof args.screenshot==='string')items.push({key:`image:${resourceId}:${args.positionMs||0}`,name:String(args.title||title)+' · '+String(args.positionLabel||'截图')+'.jpg',kind:'image',courseId,resourceId,mime:'image/jpeg',image:args.screenshot});
  return items;
}
export function parseTime(value:string):number|null{if(!/^\d{1,3}:\d{2}(:\d{2})?$/.test(value.trim()))return null;const p=value.trim().split(':').map(Number);if(p.slice(1).some(v=>v>=60))return null;return p.reduce((n,v)=>n*60+v,0)*1000;}
export function linesInRange(lines:SubtitleLine[],start:number,end:number){if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('请输入有效的起止时间');return lines.filter((line,i)=>line.bg<end&&Math.max(line.bg+1,line.ed||lines[i+1]?.bg||line.bg+3000)>start);}
export function rangedSource(source:StudySource,start:number,end:number,format:'txt'|'srt'):StudySource{
  const lines=linesInRange(source.lines||[],start,end);if(!lines.length)throw Error('所选范围没有字幕');
  const stem=source.name.replace(/\.(txt|srt)$/i,'');const name=`${stem} · ${subtitleTime(start).replace(/:/g,'-')}-${subtitleTime(end).replace(/:/g,'-')}.${format}`;
  return {...source,key:`${source.key}:${start}:${end}:${format}`,name,mime:format==='srt'?'application/x-subrip':'text/plain',lines,text:(format==='txt'?`课堂：${stem}\n`:'')+subtitleExport(lines,format),prepared:undefined};
}
function awaitDownload(id:string,signal:AbortSignal,onProgress:(text:string)=>void):Promise<runtime.NativeTask>{
  return new Promise((resolve,reject)=>{
    let unsubscribe=()=>{};
    const end=(task?:runtime.NativeTask,error?:Error)=>{unsubscribe();signal.removeEventListener('abort',abort);error?reject(error):resolve(task!);};
    const abort=()=>end(undefined,new Error('已取消准备，下载任务可在下载页查看'));
    const inspect=(tasks:runtime.NativeTask[])=>{const task=tasks.find(t=>String(t.id)===id);if(!task)return;if(task.status==='completed')end(task);else if(['failed','cancelled'].includes(task.status))end(undefined,new Error(task.status==='failed'?'下载失败，请刷新资源后重试':'下载已取消'));else onProgress(task.status==='waiting'?'下载正在等待网络…':task.status==='queued'?'正在等待下载…':`正在下载文件 · ${Math.min(100,Math.max(0,Math.floor(task.progress)))}%`);};
    unsubscribe=runtime.subscribeDownloads(inspect);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}inspect(runtime.currentDownloads());
    // Initial reconciliation only. Subsequent updates share the application's active-download feed.
    void runtime.native<{tasks:runtime.NativeTask[]}>('listDownloads').catch(()=>end(undefined,new Error('无法查询下载状态，请重试')));
  });
}
export async function prepareSource(source:StudySource,scope:string,accountId:string|undefined,signal:AbortSignal,onProgress:(text:string)=>void):Promise<PreparedAttachment>{
  if(signal.aborted)throw Error('已取消准备');if(source.prepared)return source.prepared;
  if(!runtime.NATIVE)return {id:source.key,name:source.name,mime:source.mime,size:source.text?.length||100,kind:source.kind,courseId:source.courseId,resourceId:source.resourceId,updatedAt:Date.now()};
  if(source.kind==='file'){
    if(!accountId)throw Error('请先连接 Canvas 账号');
    const available=await runtime.native<{items:PreparedAttachment[]}>('studyPrepared',{scope});
    const local=available.items.find(item=>item.id===source.key);if(local)return local;
    onProgress('正在获取下载地址…');
    const plan=await runtime.api<Record<string,unknown>>('downloadPlan',{file:{id:Number(source.resourceId)}});
    if(signal.aborted)throw Error('已取消准备');
    const key=`file:${source.resourceId}:${plan.updatedAt||''}:${plan.size??''}`;
    const cached=await runtime.native<{items:PreparedAttachment[]}>('studyPrepared',{scope});const match=cached.items.find(i=>i.id===key);if(match)return match;
    const task=await runtime.native<{id:string|number}>('enqueueDownload',{...plan,accountId,courseId:source.courseId,resourceId:source.resourceId,studyVersion:key,requiredAfter:Date.parse(String(plan.updatedAt||''))||0,...(typeof plan.size==='number'?{expectedSize:plan.size}:{})});
    onProgress('正在等待下载…');
    const downloaded=await awaitDownload(String(task.id),signal,onProgress);
    if(signal.aborted)throw Error('已取消准备');
    return runtime.native<PreparedAttachment>('studyRegisterDownload',{scope,key,taskId:downloaded.id,resourceId:source.resourceId,courseId:source.courseId,name:plan.name||source.name,mime:plan.mime||source.mime,...(typeof plan.size==='number'?{size:plan.size}:{})});
  }
  return runtime.native<PreparedAttachment>('studySave',{scope,key:source.key,name:source.name,mime:source.mime,kind:source.kind,courseId:source.courseId,resourceId:source.resourceId,...(source.image?{base64:source.image.replace(/^data:image\/(jpeg|png);base64,/, '')}:{text:source.text||''})});
}
export async function apiPayload(sources:StudySource[],original:AiPayload,scope:string):Promise<AiPayload>{
  const files:Record<string,unknown>[]=[],texts:string[]=[],images:string[]=[];
  for(const source of sources){
    if(source.kind==='file'){files.push({id:Number(source.resourceId),name:source.name,courseId:source.courseId});continue;}
    if(source.prepared){const body=await runtime.native<{text?:string;image?:string}>('studyRead',{scope,id:source.prepared.id});if(body.text)texts.push(body.text);if(body.image)images.push(body.image);}
    else{if(source.text)texts.push(source.lines?.length?`课堂：${source.name}\n`+source.lines.map(line=>`[字幕] [${subtitleTime(line.bg)}](#video=${encodeURIComponent(source.resourceId)}&t=${Math.floor(line.bg/1000)}) ${line.res}`).join('\n'):source.text);if(source.image)images.push(source.image);}
  }
  if(images.length>1)throw Error('每次支持一张截图，请分开提问');
  if(!sources.length)return original.mode==='agent'?original:{mode:'agent',args:{}};
  if(files.length===1&&!texts.length&&!images.length)return{mode:'file',args:{file:files[0],courseId:sources[0].courseId,fileName:sources[0].name}};
  const {screenshot:_image,text:_text,files:_files,file:_file,subtitleLines:_lines,timePoints:_points,...metadata}=original.args;
  return {mode:'materials',args:{...metadata,title:String(original.args.title||'课程资料'),resourceId:String(original.args.resourceId||`bundle:${sources.map(s=>s.resourceId||s.key).sort().join(',')}`),text:texts.join('\n\n'),files,...(images[0]?{screenshot:images[0]}:{}),timePoints:sources.flatMap(source=>source.lines?.map(line=>Math.floor(line.bg/1000))||[])}};
}
