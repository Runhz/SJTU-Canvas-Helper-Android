import type { ChatMessage } from './runtime';
import type {StudyTurn,StudySymbol} from './studyAssist';
import {skillId} from './learningSkills';
export interface AiPayload { mode: string; args: Record<string, unknown> }
export interface Conversation {
  id: string; scope: string; source: string; title: string; payload: AiPayload;
  messages: ChatMessage[]; draft: string; readMode: string; createdAt: number; updatedAt: number;
  interrupted: boolean;
  turns?:StudyTurn[];followUps?:string[];symbols?:StudySymbol[];pinned?:string;
}
const prefix = 'canvas-chat-v1:';
let database: Promise<IDBDatabase> | undefined;
let writes: Promise<unknown> = Promise.resolve();
// Block stale views and delayed callbacks from recreating a deleted ID in this app session.
const deleted=new Set<string>();
const deletionKey=(scope:string,id:string)=>JSON.stringify([scope,id]);
export const conversationDeleted=(scope:string,id:string)=>deleted.has(deletionKey(scope,id));
function db() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('canvas-chat-history', 1);
    request.onupgradeneeded = () => { const store = request.result.createObjectStore('conversations', { keyPath: 'id' }); store.createIndex('scope', 'scope'); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('请关闭其他应用窗口后重试保存对话'));
  }).catch(error => { database = undefined; throw error; });
  return database;
}
export function sourceKey(payload: AiPayload) {
  const file = payload.args.file as { id?: number | string } | undefined;
  return file?.id ? `file:${file.id}` : payload.mode === 'materials' ? `materials:${payload.args.resourceId || payload.args.title || ''}` : payload.mode === 'file' ? `file:${file?.id || ''}` : 'agent';
}
/** Store learning content and source IDs, never API keys, cookies or signed URLs. */
export function savedPayload(payload: AiPayload): AiPayload {
  const args: Record<string, unknown> = {};
  for (const name of ['text', 'title', 'resourceId', 'courseId', 'positionLabel','fileName','contextLabel']) if (typeof payload.args[name] === 'string') args[name] = payload.args[name];
  if(payload.args.studyAssist===true)args.studyAssist=true;
  if(payload.args.learningSkill!==undefined)args.learningSkill=skillId(payload.args.learningSkill);
  if(['relevant','full'].includes(String(payload.args.readMode)))args.readMode=payload.args.readMode;
  if(['nearby','selected','none','full'].includes(String(payload.args.subtitleScope)))args.subtitleScope=payload.args.subtitleScope;
  const background=payload.args.lectureBackground as {resourceId?:unknown;title?:unknown;lines?:unknown[];truncated?:unknown}|undefined;
  if(background&&background.resourceId===args.resourceId&&Array.isArray(background.lines)&&args.subtitleScope!=='selected'&&args.subtitleScope!=='none'){
    const lines:{bg:number;ed?:number;res:string}[]=[];let size=0;
    for(const line of background.lines){const l=line as {bg?:unknown;ed?:unknown;res?:unknown}|null;if(!l||typeof l.bg!=='number'||!Number.isFinite(l.bg)||l.bg<0||typeof l.res!=='string')continue;if(lines.length>=15000||size+l.res.length>2_000_000)break;size+=l.res.length;lines.push({bg:l.bg,res:l.res,...(typeof l.ed==='number'&&Number.isFinite(l.ed)&&l.ed>=l.bg?{ed:l.ed}:{})});}
    args.lectureBackground={resourceId:args.resourceId,title:typeof background.title==='string'?background.title.slice(0,300):'',lines,truncated:background.truncated===true||lines.length<background.lines.length};
  }
  if(payload.args.excludePreviousImage===true)args.excludePreviousImage=true;
  const recording=payload.args.recording as Record<string,unknown>|undefined;if(recording&&typeof recording.id==='string'&&typeof recording.courseId==='string'&&['canvas','videoSpace','legacy'].includes(String(recording.source)))args.recording={id:recording.id,courseId:recording.courseId,source:recording.source,title:String(recording.title||''),materialsId:Number(recording.materialsId)||0,raw:{}};
  if(Number.isInteger(payload.args.page)&&Number(payload.args.page)>0)args.page=payload.args.page;
  if(Array.isArray(payload.args.subtitleLines))args.subtitleLines=payload.args.subtitleLines.filter(l=>l&&typeof l.res==='string'&&Number.isFinite(l.bg)).map(l=>({bg:l.bg,res:l.res,...(Number.isFinite(l.ed)&&l.ed>=l.bg?{ed:l.ed}:{})}));
  if (Number.isFinite(payload.args.positionMs)) args.positionMs = payload.args.positionMs;
  if (Array.isArray(payload.args.timePoints)) args.timePoints = payload.args.timePoints.filter(n => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  if(Array.isArray(payload.args.documentPages))args.documentPages=payload.args.documentPages.filter(d=>d&&typeof d.id==='string'&&Array.isArray(d.pages)).slice(0,6).map(d=>({id:d.id,courseId:String(d.courseId||''),pages:d.pages.filter((p:unknown)=>Number.isInteger(p)&&Number(p)>0).slice(0,3)}));
  if (typeof payload.args.screenshot === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(payload.args.screenshot)) args.screenshot = payload.args.screenshot;
  if(typeof payload.args.attachmentId==='string')args.attachmentId=payload.args.attachmentId;
  else if(args.screenshot&&typeof payload.args.intentId==='string')args.attachmentId=payload.args.intentId;
  const file = payload.args.file as { id?: unknown;preparedId?:unknown;updatedAt?:unknown;size?:unknown } | undefined;
  const version=(file:{updatedAt?:unknown;size?:unknown})=>({...((typeof file.updatedAt==='string')?{updatedAt:file.updatedAt}:{}),...((typeof file.size==='number'&&Number.isFinite(file.size)&&file.size>=0)?{size:file.size}:{})});
  if (file && (typeof file.id === 'string' || typeof file.id === 'number')) args.file = { id: file.id,...(typeof file.preparedId==='string'?{preparedId:file.preparedId}:{}),...version(file) };
  if(Array.isArray(payload.args.files))args.files=payload.args.files.filter(file=>file&&typeof file==='object'&&(typeof file.id==='number'||typeof file.id==='string')).map(file=>({id:file.id,...(typeof file.name==='string'?{name:file.name}:{}),...(typeof file.courseId==='string'?{courseId:file.courseId}:{}),...(typeof file.preparedId==='string'?{preparedId:file.preparedId}:{}),...version(file)}));
  if(Array.isArray(payload.args.documents))args.documents=payload.args.documents.filter(d=>d&&typeof d.id==='string'&&typeof d.text==='string'&&typeof d.name==='string').slice(0,6).map(d=>({id:d.id,courseId:String(d.courseId||''),name:d.name.slice(0,300),...(typeof d.preparedId==='string'?{preparedId:d.preparedId}:{}),...(typeof d.version==='string'?{version:d.version}:{}),text:d.text.slice(0,2_000_000),coverage:String(d.coverage||'').slice(0,1000),...(Number.isInteger(d.pages)?{pages:d.pages}:{}),images:Array.isArray(d.images)?d.images.filter((i:{page:number;image:string})=>i&&Number.isInteger(i.page)&&i.page>0&&typeof i.image==='string'&&i.image.length<=2_000_000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(i.image)).slice(0,3).map((i:{page:number;image:string})=>({page:i.page,image:i.image})):[]}));
  return { mode: payload.mode, args };
}
/** Restore only the selected files, within the same account's conversation. Fresh entry metadata wins. */
export function reuseDocumentPayload(payload:AiPayload,...previous:AiPayload[]):AiPayload{
 const next=savedPayload(payload),args=next.args;
 const sameLecture=previous.map(savedPayload).find(p=>typeof args.resourceId==='string'&&p.args.resourceId===args.resourceId);
 if(sameLecture&&payload.args.retainLectureFiles===true&&!args.file&&!Array.isArray(args.files)&&Array.isArray(sameLecture.args.files))args.files=sameLecture.args.files;
 if(!args.lectureBackground&&sameLecture?.args.lectureBackground&&args.subtitleScope==='nearby')args.lectureBackground=sameLecture.args.lectureBackground;
 const refs=[...(args.file?[{...(args.file as Record<string,unknown>),courseId:args.courseId}]:[]),...(Array.isArray(args.files)?args.files:[])];
 const candidates=[next,...previous.map(savedPayload)].flatMap(p=>Array.isArray(p.args.documents)?p.args.documents:[]);
 const version=(ref:Record<string,unknown>)=>typeof ref.updatedAt==='string'&&ref.updatedAt?`file:${ref.id}:${ref.updatedAt}:${ref.size??''}`:undefined;
 const documents=refs.map(ref=>{
  const expected=version(ref);
  return candidates.find(d=>d.id===String(ref.id)&&d.courseId===String(ref.courseId||'')&&
   (expected?d.version===expected||d.preparedId===expected:typeof ref.preparedId!=='string'||ref.preparedId===d.preparedId));
 }).filter((d):d is NonNullable<typeof d>=>!!d);
 if(documents.length)args.documents=documents;else delete args.documents;
 // Keep opaque prepared-file references as well, so old turn anchors can reuse the downloaded source.
 const prepared=(file:Record<string,unknown>,courseId:unknown)=>{
  const doc=documents.find(d=>d.id===String(file.id)&&d.courseId===String(courseId||'')),next={...file},expected=version(file);
  if(!doc&&expected&&next.preparedId!==expected){delete next.preparedId;if(Array.isArray(args.documentPages))args.documentPages=args.documentPages.filter(p=>p.id!==String(file.id)||p.courseId!==String(courseId||''));}
  return{...next,...(doc?.preparedId?{preparedId:doc.preparedId}:{})};
 };
 if(args.file)args.file=prepared(args.file as Record<string,unknown>,args.courseId);
 if(Array.isArray(args.files))args.files=args.files.map(file=>prepared(file,file.courseId));
 return next;
}
/** Keep file bodies once per conversation, rather than copying megabytes into every turn. */
export function storedTurnPayload(payload:AiPayload):AiPayload{
 const next=savedPayload(payload),docs=Array.isArray(next.args.documents)?next.args.documents:[];
 if(docs.length)next.args.documentPages=docs.filter(d=>d.images?.length).map(d=>({id:d.id,courseId:d.courseId,pages:d.images.map((i:{page:number})=>i.page)}));
 if(next.args.file){const file=next.args.file as {id:unknown;preparedId?:string};const doc=docs.find(d=>d.id===String(file.id));if(doc?.preparedId)file.preparedId=doc.preparedId;}
 if(Array.isArray(next.args.files))next.args.files=next.args.files.map(file=>{const doc=docs.find(d=>d.id===String(file.id));return{...file,...(doc?.preparedId?{preparedId:doc.preparedId}:{})}});
 delete next.args.documents;delete next.args.lectureBackground;return next;
}
export function newConversation(scope: string, title: string, payload: AiPayload): Conversation {
  const now = Date.now();
  return { id: `conversation-${now}-${Math.random().toString(36).slice(2)}`, scope, source: sourceKey(payload), title, payload: savedPayload(payload), messages: [], draft: '', readMode: payload.args.readMode==='full'?'full':'relevant', createdAt: now, updatedAt: now, interrupted: false };
}
function valid(value: unknown, scope: string): value is Conversation {
  const row = value as Conversation | null;
  return !!row && row.scope === scope && typeof row.id === 'string' && typeof row.title === 'string' && typeof row.source === 'string' && typeof row.draft === 'string' && !!row.payload && ['agent','file','materials'].includes(row.payload.mode) && !!row.payload.args && typeof row.payload.args === 'object' && Array.isArray(row.messages) && row.messages.every(m => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') && Number.isFinite(row.updatedAt);
}
function restoredConversation(row:Conversation):Conversation{
 const anchors=new Map<number,StudyTurn>();
 if(Array.isArray(row.turns))for(const turn of row.turns){
  if(!turn||typeof turn.id!=='string'||!Number.isInteger(turn.messageIndex)||turn.messageIndex<0||turn.messageIndex>row.messages.length||row.messages[turn.messageIndex]?.role==='assistant'||!turn.payload||!['agent','file','materials'].includes(turn.payload.mode)||!turn.payload.args||typeof turn.payload.args!=='object')continue;
  anchors.set(turn.messageIndex,{id:turn.id,messageIndex:turn.messageIndex,payload:storedTurnPayload(turn.payload),status:['open','understood','later'].includes(turn.status)?turn.status:'open',createdAt:Number.isFinite(turn.createdAt)?turn.createdAt:row.updatedAt});
 }
 return{...row,payload:savedPayload(row.payload),readMode:row.readMode==='full'?'full':'relevant',interrupted:row.interrupted===true,
  messages:row.messages.map(m=>({role:m.role,content:m.content,...(typeof m.reasoning==='string'?{reasoning:m.reasoning.slice(0,64000)}:{}),...(typeof m.reasoningMs==='number'&&Number.isFinite(m.reasoningMs)&&m.reasoningMs>=0?{reasoningMs:m.reasoningMs}:{})})),
  ...(row.turns!==undefined?{turns:[...anchors.values()].sort((a,b)=>a.messageIndex-b.messageIndex)}:{}),
  ...(row.followUps!==undefined?{followUps:Array.isArray(row.followUps)?row.followUps.filter(q=>typeof q==='string'):[]}:{}),
  ...(row.symbols!==undefined?{symbols:Array.isArray(row.symbols)?row.symbols.filter(s=>s&&typeof s.symbol==='string'&&typeof s.meaning==='string'&&typeof s.evidence==='string'):[]}:{}),pinned:typeof row.pinned==='string'?row.pinned:undefined};
}
function enqueue(action: () => Promise<void>) { const result = writes.catch(() => {}).then(action); writes = result; return result; }
export function saveConversation(value: Conversation) {
  if(conversationDeleted(value.scope,value.id))return Promise.resolve();
  // Capture now, rather than retaining an object that a streaming callback may replace.
  const copy = JSON.parse(JSON.stringify({ ...value, payload: savedPayload(value.payload),turns:value.turns?.map(t=>({id:t.id,messageIndex:t.messageIndex,payload:storedTurnPayload(t.payload),status:t.status,createdAt:t.createdAt})) })) as Conversation;
  return enqueue(async () => {
    if(conversationDeleted(copy.scope,copy.id))return;
    if (typeof indexedDB === 'undefined') { localStorage.setItem(prefix + copy.scope + ':' + copy.id, JSON.stringify(copy)); return; }
    const database = await db();
    await new Promise<void>((resolve, reject) => { const tx = database.transaction('conversations', 'readwrite'); tx.objectStore('conversations').put(copy); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('保存被中断')); });
  });
}
export async function listConversations(scope: string) {
  await writes.catch(() => {});
  let values: unknown[];
  if (typeof indexedDB === 'undefined') {
    values = []; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(prefix + scope + ':')) { try { values.push(JSON.parse(localStorage.getItem(key)!)); } catch {} } }
  } else {
    const database = await db();
    values = await new Promise<unknown[]>((resolve, reject) => { const request = database.transaction('conversations').objectStore('conversations').index('scope').getAll(scope); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }
  return values.filter(value => valid(value, scope)).map(restoredConversation).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function deleteConversation(scope: string, id: string) {
  const key=deletionKey(scope,id);deleted.add(key);
  return enqueue(async () => {
    try{
    deleted.add(key);
    if (typeof indexedDB === 'undefined') { localStorage.removeItem(prefix + scope + ':' + id); return; }
    const database = await db();
    await new Promise<void>((resolve, reject) => { const tx = database.transaction('conversations', 'readwrite'), store = tx.objectStore('conversations'), request = store.get(id); request.onsuccess = () => { if (request.result?.scope === scope) store.delete(id); }; tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    }catch(error){deleted.delete(key);throw error;}
  }).then(()=>{window.dispatchEvent(new CustomEvent('canvas-conversation-deleted',{detail:{scope,id}}));});
}
