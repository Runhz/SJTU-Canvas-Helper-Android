import type {CourseFile} from './domain';
import type {Recording} from './runtime';
export interface StudyUnit {text:string;page?:number;timeMs?:number}
export interface StudyDocument {id:string;scope:string;courseId:string;title:string;kind:'file'|'lecture';version:string;file?:CourseFile;recording?:Recording;units:StudyUnit[];updatedAt:number}
export interface StudyNote {conversationId?:string;id:string;scope:string;courseId:string;title:string;body:string;recording?:Recording;positionMs?:number;file?:CourseFile;page?:number;image?:string;updatedAt:number}
export interface StudyHit {id:string;title:string;courseId:string;kind:'file'|'lecture'|'note';snippet:string;page?:number;timeMs?:number;file?:CourseFile;recording?:Recording;noteId?:string}
let database:Promise<IDBDatabase>|undefined;
const changed=()=>window.dispatchEvent(new Event('canvas-library-changed'));
function db(){
  if(!database)database=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('canvas-study-library',1);
    request.onupgradeneeded=()=>{for(const name of ['documents','notes']){const store=request.result.createObjectStore(name,{keyPath:'id'});store.createIndex('scope','scope');}};
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=undefined};resolve(request.result)};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('本地资料库暂时不可用，请重新打开应用'));
  }).catch(e=>{database=undefined;throw e;});return database;
}
export const safeFile=(f:CourseFile):CourseFile=>({id:f.id,name:f.name,kind:f.kind,size:f.size,updated:f.updated,raw:{id:Number(f.id),updatedAt:f.raw?.updatedAt,size:f.raw?.size,mime:f.raw?.mime}});
export const safeRecording=(r:Recording):Recording=>({id:r.id,title:r.title,courseId:r.courseId,source:r.source,materialsId:r.materialsId,raw:{}});
export const fileVersion=(file:CourseFile)=>`${file.raw?.updatedAt||file.updated}:${file.raw?.size??file.size}`;
export const fileDocumentId=(scope:string,fileId:string)=>JSON.stringify([scope,'file',fileId]);
export function fileUnits(text:string,sourcePages=true):StudyUnit[]{
  // Only the existing parser's explicit slide markers count as original page numbers.
  const pattern=/^\[幻灯片 (\d+)\]\s*$/gm,matches=sourcePages?[...text.matchAll(pattern)]:[];
  if(matches.length)return matches.map((m,i)=>({page:Number(m[1]),text:text.slice(m.index!+m[0].length,matches[i+1]?.index??text.length).trim()}));
  return Array.from({length:Math.ceil(text.length/32768)},(_,i)=>({text:text.slice(i*32768,(i+1)*32768)}));
}
async function write(storeName:string,value:StudyDocument|StudyNote){const database=await db();await new Promise<void>((resolve,reject)=>{const tx=database.transaction(storeName,'readwrite');tx.objectStore(storeName).put(value);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});changed();}
export async function indexFile(scope:string,courseId:string,file:CourseFile,text:string){
  const value:StudyDocument={id:fileDocumentId(scope,file.id),scope,courseId,title:file.name,kind:'file',version:fileVersion(file),file:safeFile(file),units:fileUnits(text,/\.pptx?$/i.test(file.name)),updatedAt:Date.now()};await write('documents',value);return value;
}
export async function indexLecture(scope:string,recording:Recording,lines:{bg:number;res:string}[],slides:Record<string,any>[]){
  const units:StudyUnit[]=[...lines.filter(l=>l.res.trim()).map(l=>({text:l.res,timeMs:l.bg})),...slides.map(s=>({text:String(s.ocrText||(s.ocr||[]).map((v:{word:string})=>v.word).join(' ')),...(String(s.createSec??'').trim()!==''&&Number.isFinite(Number(s.createSec))?{timeMs:Number(s.createSec)*1000}:{})})).filter(s=>s.text.trim())];
  if(!units.length)return;
  const id=JSON.stringify([scope,'lecture',recording.source,recording.id]);let hash=2166136261;for(const unit of units){const value=`${unit.timeMs}:${unit.text}`;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619)}const version=`${units.length}:${hash>>>0}`;
  const database=await db();const previous=await new Promise<StudyDocument|undefined>((resolve,reject)=>{const q=database.transaction('documents').objectStore('documents').get(id);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});if(previous?.version===version)return;
  await write('documents',{id,scope,courseId:recording.courseId,title:recording.title,kind:'lecture',version,recording:safeRecording(recording),units,updatedAt:Date.now()});
}
export async function getDocument(scope:string,fileId:string):Promise<StudyDocument|undefined>{const database=await db();return new Promise((resolve,reject)=>{const q=database.transaction('documents').objectStore('documents').get(fileDocumentId(scope,fileId));q.onsuccess=()=>resolve(q.result?.scope===scope?q.result:undefined);q.onerror=()=>reject(q.error);});}
export async function listDocuments(scope:string,courseId?:string):Promise<StudyDocument[]>{
  const database=await db();return new Promise((resolve,reject)=>{const q=database.transaction('documents').objectStore('documents').index('scope').openCursor(IDBKeyRange.only(scope)),rows:StudyDocument[]=[];q.onsuccess=()=>{const c=q.result;if(!c){resolve(rows);return;}const value=c.value as StudyDocument;if(!courseId||value.courseId===courseId)rows.push({...value,units:[]});c.continue();};q.onerror=()=>reject(q.error);});
}
export async function saveNote(value:StudyNote){
  if(!value.scope||!value.body.trim())throw Error('请输入笔记内容');
  const note:StudyNote={id:value.id,scope:value.scope,courseId:value.courseId,title:value.title.trim()||'课堂笔记',body:value.body,updatedAt:Date.now(),...(typeof value.conversationId==='string'?{conversationId:value.conversationId}:{}),...(value.recording?{recording:safeRecording(value.recording)}:{}),...(Number.isFinite(value.positionMs)&&value.positionMs!>=0?{positionMs:value.positionMs}:{}),...(value.file?{file:safeFile(value.file)}:{}),...(Number.isInteger(value.page)&&value.page!>0?{page:value.page}:{}),...(typeof value.image==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value.image)?{image:value.image}:{})};
  await write('notes',note);
}
export async function listNotes(scope:string,recording?:Recording):Promise<StudyNote[]>{const database=await db();return new Promise((resolve,reject)=>{const q=database.transaction('notes').objectStore('notes').index('scope').getAll(scope);q.onsuccess=()=>resolve((q.result as StudyNote[]).filter(n=>!recording||n.recording?.source===recording.source&&n.recording.id===recording.id).sort((a,b)=>(a.positionMs||0)-(b.positionMs||0)||b.updatedAt-a.updatedAt));q.onerror=()=>reject(q.error);});}
export async function deleteNote(scope:string,id:string){const database=await db();await new Promise<void>((resolve,reject)=>{const tx=database.transaction('notes','readwrite'),s=tx.objectStore('notes'),q=s.get(id);q.onsuccess=()=>{if(q.result?.scope===scope)s.delete(id)};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});changed();}
export function matchSnippet(text:string,query:string){const normalized=text.normalize('NFKC').toLocaleLowerCase(),terms=query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);if(!terms.length||!terms.every(t=>normalized.includes(t)))return null;const at=Math.max(0,normalized.indexOf(terms[0])-35);return (at?'…':'')+text.slice(at,at+180)+(text.length>at+180?'…':'');}
export async function searchLibrary(scope:string,query:string,signal:AbortSignal):Promise<StudyHit[]>{
  if(!query.trim())return[];const database=await db();const hits:StudyHit[]=[];
  for(const name of ['notes','documents'])await new Promise<void>((resolve,reject)=>{
    const tx=database.transaction(name),q=tx.objectStore(name).index('scope').openCursor(IDBKeyRange.only(scope));
    const abort=()=>{try{tx.abort()}catch{};reject(Error('已取消搜索'))};signal.addEventListener('abort',abort,{once:true});
    tx.oncomplete=()=>{signal.removeEventListener('abort',abort);resolve()};tx.onabort=()=>{signal.removeEventListener('abort',abort);reject(Error('已取消搜索'))};tx.onerror=()=>reject(tx.error);
    q.onsuccess=()=>{if(signal.aborted){abort();return;}const cursor=q.result;if(!cursor||hits.length>=80)return;
      if(name==='notes'){const n=cursor.value as StudyNote;const snippet=matchSnippet(n.title+'\n'+n.body,query);if(snippet)hits.push({id:n.id,title:n.title,courseId:n.courseId,kind:'note',snippet,timeMs:n.positionMs,page:n.page,file:n.file,recording:n.recording,noteId:n.id});}
      else{const d=cursor.value as StudyDocument;let count=0;for(const unit of d.units){const snippet=matchSnippet(unit.text,query);if(snippet){hits.push({id:d.id+':'+count,title:d.title,courseId:d.courseId,kind:d.kind,snippet,page:unit.page,timeMs:unit.timeMs,file:d.file,recording:d.recording});if(++count>=3||hits.length>=80)break;}}}
      cursor.continue();
    };
  });return hits;
}

export interface SlideLink {fileId:string;fileName:string;version:string;fromMs:number;page?:number;slideTimeMs?:number}
function linkKey(scope:string,recording:Recording){return `canvas-slide-links-v1:${scope}:${recording.source}:${recording.id}`;}
export function loadLinks(scope:string,recording:Recording):SlideLink[]{try{const rows=JSON.parse(localStorage.getItem(linkKey(scope,recording))||'[]');return Array.isArray(rows)?rows.filter(v=>typeof v.fileId==='string'&&typeof v.fileName==='string'&&Number.isFinite(v.fromMs)&&v.fromMs>=0&&typeof v.version==='string').sort((a,b)=>a.fromMs-b.fromMs):[];}catch{return[]}}
export function saveLinks(scope:string,recording:Recording,links:SlideLink[]){localStorage.setItem(linkKey(scope,recording),JSON.stringify(links.map(l=>({fileId:l.fileId,fileName:l.fileName,version:l.version,fromMs:l.fromMs,...(Number.isInteger(l.page)&&l.page!>0?{page:l.page}:{}),...(Number.isFinite(l.slideTimeMs)?{slideTimeMs:l.slideTimeMs}:{})}))));changed();}
