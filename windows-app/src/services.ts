import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

export interface Account { accountId:string; token:string; cookie:string; webCookies?:Record<string,string>; modelKey:string; modelUrl:string; modelName:string }
export interface Settings { currentId:string; accounts:Account[] }
export interface Course { id:number; name:string; course_code:string; teachers:{display_name:string}[]; term:{id:number;name:string;start_at?:string;end_at?:string} }
export interface CourseFile { id:number; display_name:string; filename:string; size:number; locked:boolean }
export interface Assignment { id:number; courseId:number; name:string; due_at:string|null; description:string; html_url:string; locked_for_user?:boolean; submission_types?:string[]; allowed_extensions?:string[]; submission?:{workflow_state:string;submitted_at?:string;late?:boolean;attachments?:{id:number;display_name:string;filename:string}[]} }
export interface Recording { videoId:string; videoName:string; source:'canvas'|'videoSpace'|'legacy'; playable:boolean; availabilityLabel:string; courseId:number; courseName:string; courseBeginTime:string }
export interface Subtitle { bg:number; ed:number; res:string }
export interface Slide { createSec:string; pptImgUrl?:string }
export interface Doc { id?:number; name:string; text:string; coverage?:string }
export interface ChatContext { title?:string; text?:string; file?:{id:number;name:string}; files?:{id:number;name:string}[]; documents?:Doc[]; screenshot?:string; resourceId?:string; courseId?:number; positionLabel?:string; positionSeconds?:number; lectureBackground?:{resourceId:string;lines:Subtitle[]}; learningSkill?:string; studyAssist?:boolean }
export interface Message { role:'user'|'assistant';content:string;reasoning?:string;image?:string;failed?:boolean }
export interface Thread { id:string;account:string;title:string;updated:number;messages:Message[];context:ChatContext }
export interface Note { id:string;account:string;title:string;body:string;updated:number;source?:string }
export const blankAccount=():Account=>({accountId:'我的 Canvas',token:'',cookie:'',modelKey:'',modelUrl:'https://api.deepseek.com/v1',modelName:'deepseek-chat'});
export const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
export function call<T>(command:string,args:Record<string,unknown>={}):Promise<T> {
  if(!isTauri())return Promise.reject(new Error('请从 Windows 应用中连接课程，浏览器预览不能访问本机账号。'));
  return invoke<T>(command,args);
}
export const api=<T>(action:string,args:Record<string,unknown>={})=>call<T>('canvas_request',{action,args});
export const loadSettings=()=>call<Settings>('desktop_load_settings');
export const saveSettings=(settings:Settings)=>call<void>('desktop_save_settings',{settings});
export const restore=(config:Account)=>call('restore_session',{config});
export const connect=(config:Account)=>call('configure_session',{config});
export const portal=(kind:string,courseId?:number,assignmentId?:number)=>call('desktop_open_portal',{kind,courseId:courseId??null,assignmentId:assignmentId??null});
export interface WebLoginStatus { loggedIn:boolean; sources:string[]; hasCanvasToken:boolean }
export const webLoginStatus=()=>call<WebLoginStatus>('desktop_login_status');
export const previewWindow=(file:CourseFile)=>call('desktop_open_preview',{fileId:file.id,title:file.display_name});
export async function downloadFile(file:CourseFile) {
  const path=await save({defaultPath:file.display_name});
  if(!path)return false;
  await call('desktop_download_file',{fileId:file.id,path});return true;
}
export async function exportNote(note:Note) {
  const path=await save({defaultPath:`${note.title.replace(/[\\/:*?"<>|]/g,'_')}.md`,filters:[{name:'Markdown',extensions:['md']}]});
  if(path)await call('desktop_export_note',{path,content:`# ${note.title}\n\n${note.body}`});
}
export async function pickFiles(forAi:boolean) {
  const picked=await open({multiple:true,directory:false});
  if(!picked)return [];
  return (await call<{files:{name:string;path:string;size:number}[]}>('desktop_import_files',{paths:Array.isArray(picked)?picked:[picked],forAi})).files;
}
export async function readImport(path:string,name:string,onPhase:(s:string)=>void) {
  const phase=new Channel<string>();phase.onmessage=onPhase;
  return call<Doc>('read_prepared_file',{path,name,requestId:crypto.randomUUID(),onPhase:phase});
}
export async function ask(thread:Thread,question:string,onText:(s:string)=>void,onPhase:(s:string)=>void,onReasoning:(s:string)=>void,requestId:string) {
  const chunk=new Channel<string>();chunk.onmessage=onText;
  const phase=new Channel<string>();phase.onmessage=onPhase;
  const reasoning=new Channel<string>();reasoning.onmessage=onReasoning;
  const ctx=thread.context;
  const docs=ctx.documents||[];
  const imported=docs.filter(d=>!d.id).map(d=>`文件：${d.name}\n${d.text}`).join('\n\n');
  const args={...ctx,text:[ctx.text,imported].filter(Boolean).join('\n\n'),studyAssist:true};
  return call<string>('ai_chat',{mode:ctx.file?'file':ctx.files?.length||args.text||ctx.screenshot||ctx.lectureBackground?'materials':'agent',args,messages:[...thread.messages.filter(m=>!m.failed).map(m=>({role:m.role,content:m.content})),{role:'user',content:question}],requestId,onChunk:chunk,onPhase:phase,onReasoning:reasoning});
}
export function formatTime(sec:number) {const n=Math.max(0,Math.floor(Number.isFinite(sec)?sec:0));return `${Math.floor(n/3600)?Math.floor(n/3600)+':':''}${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
export function fileSize(n:number){return n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.ceil(n/1024)} KB`;}
export function plain(html:string){const doc=new DOMParser().parseFromString(html||'','text/html');return doc.body.textContent||'';}
export function submitted(a:Assignment){return Boolean(a.submission?.submitted_at)&&a.submission?.workflow_state!=='unsubmitted';}
export function matches(text:string,query:string){return text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());}
export async function accountKey(account:Account){const bytes=new TextEncoder().encode(`${account.accountId}:${account.token}`);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');}

let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{
  const req=indexedDB.open('canvas-windows-workspace',1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('threads',{keyPath:'id'});req.result.createObjectStore('notes',{keyPath:'id'});req.result.createObjectStore('state');};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>{database=undefined;reject(new Error('本机学习记录暂时无法访问'));};
});}
export async function listSaved<T extends {account:string}>(store:'threads'|'notes',account:string):Promise<T[]> {const database=await db();return new Promise((resolve,reject)=>{const req=database.transaction(store).objectStore(store).getAll();req.onsuccess=()=>resolve((req.result as T[]).filter(t=>t.account===account));req.onerror=()=>reject(new Error('学习记录读取失败'));});}
export async function putSaved(store:'threads'|'notes',value:Thread|Note){const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('本机存储空间不足，学习记录未保存'));tx.onabort=()=>reject(new Error('学习记录保存被中断'));});}
export async function deleteSaved(store:'threads'|'notes',id:string){const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('删除失败'));});}
export async function stateGet<T>(key:string):Promise<T|undefined>{const database=await db();return new Promise((resolve,reject)=>{const req=database.transaction('state').objectStore('state').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('观看进度读取失败'));});}
export async function statePut(key:string,value:unknown){const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction('state','readwrite');tx.objectStore('state').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('观看进度保存失败'));});}

export async function mapLimited<T,U>(items:T[],limit:number,run:(item:T)=>Promise<U>):Promise<PromiseSettledResult<U>[]> {
  const result:PromiseSettledResult<U>[]=new Array(items.length);let index=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const i=index++;if(i>=items.length)return;try{result[i]={status:'fulfilled',value:await run(items[i])};}catch(reason){result[i]={status:'rejected',reason};}}}));return result;
}
