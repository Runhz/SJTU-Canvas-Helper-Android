import {useEffect,useRef,useState} from 'react';
import {BookOpen,Check,Edit3,FileText,LoaderCircle,MessageCircle,Trash2} from 'lucide-react';
import * as runtime from './runtime';
import {Modal} from './Modal';
import {RichAnswer} from './RichAnswer';
import type {Conversation,AiPayload} from './chatHistory';
import {deleteNote,listNotes,saveNote,safeRecording,type StudyNote} from './studyLibrary';
import {subtitleTime} from './study';

export function noteSource(row:Conversation):Partial<StudyNote>{
  const a=row.payload.args,recording=a.recording as runtime.Recording|undefined;
  const resource=String(a.resourceId||''),at=resource.indexOf(':');
  const source=resource.slice(0,at),id=resource.slice(at+1);
  const lecture=recording||(['canvas','videoSpace','legacy'].includes(source)&&id?{id,source:source as runtime.Recording['source'],courseId:String(a.courseId||''),title:String(a.title||row.title),materialsId:0,raw:{}}:undefined);
  const file=a.file as {id?:string|number}|undefined,name=String(a.fileName||a.title||row.title);
  return{courseId:String(a.courseId||lecture?.courseId||''),conversationId:row.id,
    ...(lecture?{recording:safeRecording(lecture),positionMs:Math.max(0,Number(a.positionMs)||0)}:{}),
    ...(file?.id?{file:{id:String(file.id),name,kind:name.split('.').pop()?.toUpperCase()||'',size:'',updated:'',raw:{id:Number(file.id)}}}:{}),
    ...(Number.isInteger(a.page)&&Number(a.page)>0?{page:Number(a.page)}:{})};
}
export function conversationText(row:Conversation){return row.messages.filter(m=>m.content.trim()).map(m=>`${m.role==='user'?'我的问题':'解释'}：\n${m.content}`).join('\n\n');}

export function NoteEditor({note,onClose,onSaved}:{note:StudyNote;onClose:()=>void;onSaved?:()=>void}){
  const [draft,setDraft]=useState(note),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <Modal title="编辑笔记" onClose={onClose} wide><div className="note-editor"><label>标题<input aria-label="笔记标题" value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>内容<textarea aria-label="笔记内容" value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy||!draft.body.trim()} onClick={async()=>{setBusy(true);try{await saveNote(draft);onSaved?.();onClose()}catch{setError('笔记未保存，请重试')}finally{setBusy(false)}}}><Check size={16}/>保存笔记</button></div></Modal>;
}

export function ConversationNote({row,onClose}:{row:Conversation;onClose:()=>void}){
  const [title,setTitle]=useState(row.title+' · 笔记'),[body,setBody]=useState(''),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[retry,setRetry]=useState(0);
  const request=useRef(''),currentScope=useRef(row.scope),stopped=useRef(false);
  useEffect(()=>{let active=true,raw='';let flush:ReturnType<typeof setTimeout>|undefined;const requestId=`note-${Date.now()}-${Math.random().toString(36).slice(2)}`;request.current=requestId;stopped.current=false;setBusy(true);setError('');setBody('');
    const prompt='把这段学习对话提炼成一份简洁、可复习的笔记，保留真正讨论清楚的结论、必要条件、关键推导、易错点和尚未解决的疑问。省去寒暄和重复，不补写没有依据的知识。保留原对话中确实存在的页码和视频时间链接。使用 Markdown 和 LaTeX，不要写开场白。';
    const run=runtime.NATIVE?runtime.ai('materials',{title:row.title,text:conversationText(row),readMode:'full'},prompt,part=>{raw+=part;if(active&&!stopped.current&&!flush)flush=setTimeout(()=>{flush=undefined;if(active&&!stopped.current)setBody(raw)},70)},[],{requestId}):Promise.resolve(conversationText(row));
    void run.then(text=>{clearTimeout(flush);if(active&&!stopped.current){setBody(text);setBusy(false)}}).catch(e=>{if(active&&!stopped.current){setError(String(e).replace(/^Error:\s*/,''));setBusy(false)}});
    return()=>{active=false;clearTimeout(flush);if(runtime.NATIVE)void runtime.cancelAi(requestId).catch(()=>{})};
  },[retry]);
  return <Modal title={saved?'笔记已保存':'整理成笔记'} subtitle={row.title} onClose={onClose} wide><div className="conversation-note-editor">
    {saved?<div className="note-saved"><BookOpen size={30}/><strong>已存入笔记</strong><p>{row.payload.args.resourceId?'在本堂课的“笔记”和助手首页都能找到。':'在文件笔记和助手首页都能找到。'}</p><button className="button primary" onClick={onClose}>完成</button></div>:<><label>标题<input aria-label="提炼笔记标题" value={title} onChange={e=>setTitle(e.target.value)}/></label>{busy?<div className="note-stream"><LoaderCircle size={16} className="spin"/>正在提炼…<RichAnswer text={body}/></div>:<label>笔记内容<textarea aria-label="提炼笔记内容" value={body} onChange={e=>setBody(e.target.value)}/></label>}{error&&<div className="notice amber" role="alert">{error}<button className="text-button" onClick={()=>setRetry(n=>n+1)}>重新整理</button></div>}<div className="button-row"><button className="button primary" disabled={busy||saving||!body.trim()} onClick={async()=>{setSaving(true);try{if(currentScope.current!==row.scope)throw Error('账号已切换');await saveNote({id:`note-${Date.now()}-${Math.random().toString(36).slice(2)}`,scope:row.scope,courseId:'',title,body,updatedAt:Date.now(),...noteSource(row)});setSaved(true)}catch{setError('笔记未保存，请保留内容后重试')}finally{setSaving(false)}}}><Check size={16}/>保存到笔记</button>{busy&&<button className="button secondary" onClick={()=>{stopped.current=true;void runtime.cancelAi(request.current).catch(()=>{});setBusy(false)}}>停止整理</button>}</div></>}
  </div></Modal>;
}

export function StudyNotes({scope,fileId,onContinue}:{scope:string;fileId?:string;onContinue?:(id:string)=>void}){
  const [rows,setRows]=useState<StudyNote[]>([]),[editing,setEditing]=useState<StudyNote>(),[error,setError]=useState(''),[remove,setRemove]=useState('');
  useEffect(()=>{let active=true;const load=()=>void listNotes(scope).then(data=>{if(active)setRows(data.filter(n=>!fileId||n.file?.id===fileId).sort((a,b)=>b.updatedAt-a.updatedAt))}).catch(()=>{if(active)setError('笔记暂时无法读取')});load();window.addEventListener('canvas-library-changed',load);return()=>{active=false;window.removeEventListener('canvas-library-changed',load)}},[scope,fileId]);
  return <section className="study-note-list" aria-label={fileId?'文件笔记':'全部笔记'}>{error&&<p role="alert">{error}</p>}{!rows.length&&<div className="empty"><BookOpen size={25}/><h3>暂无笔记</h3><p>对话中的“整理成笔记”会保存在这里。</p></div>}{rows.map(note=><article className="study-note-card" key={note.id}><header><span className="note-source"><FileText size={13}/>{note.file?.name||note.recording?.title||'学习笔记'}{Number.isFinite(note.positionMs)&&` · ${subtitleTime(note.positionMs!)}`}</span><button className="icon-button" aria-label={`编辑笔记 ${note.title}`} onClick={()=>setEditing(note)}><Edit3 size={16}/></button></header><h3>{note.title}</h3><details><summary>展开笔记</summary><RichAnswer text={note.body}/></details><footer><small>{new Date(note.updatedAt).toLocaleDateString('zh-CN')}</small>{note.conversationId&&onContinue&&<button className="text-button" onClick={()=>onContinue(note.conversationId!)}><MessageCircle size={14}/>继续讨论</button>}<button className="text-button danger" aria-label={remove===note.id?'确认删除笔记':`删除笔记 ${note.title}`} onClick={async()=>{if(remove!==note.id){setRemove(note.id);return}try{await deleteNote(scope,note.id);setRemove('')}catch{setError('删除失败，请重试')}}}><Trash2 size={13}/>{remove===note.id?'确认删除':'删除'}</button></footer></article>)}{editing&&<NoteEditor note={editing} onClose={()=>setEditing(undefined)}/>}</section>;
}
