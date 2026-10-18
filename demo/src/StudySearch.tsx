import {useEffect,useRef,useState} from 'react';
import {FileText,LoaderCircle,Search,Square,X} from 'lucide-react';
import type {Course,CourseFile} from './domain';
import * as runtime from './runtime';
import {fileVersion,getDocument,indexFile,listDocuments,type StudyHit} from './studyLibrary';
import {searchOffThread} from './libraryWorker';
import {subtitleTime} from './study';
import {ChoicePicker} from './ChoicePicker';
import './studyReader.css';
const extractable=(f:CourseFile)=>/\.(pdf|pptx?|docx|xlsx|odt|odp|ods|txt|md|csv|json|log|srt|vtt|py|js|ts|java|c|cpp|h|rs|xml|ya?ml)$/i.test(f.name);
export function StudySearch({scope,courses,query,loadFiles,onOpen,defaultCourseId}:{scope:string;courses:Course[];query:string;loadFiles:(course:Course,force?:boolean)=>Promise<unknown>;onOpen:(hit:StudyHit)=>void;defaultCourseId?:string}){
  const [hits,setHits]=useState<StudyHit[]>([]),[searching,setSearching]=useState(false),[indexing,setIndexing]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[courseId,setCourseId]=useState(defaultCourseId||courses[0]?.id||''),[count,setCount]=useState(0),[revision,setRevision]=useState(0);
  const controller=useRef<AbortController>(),requestId=useRef(''),current=useRef(courses);current.current=courses;
  useEffect(()=>{const update=()=>setRevision(n=>n+1);window.addEventListener('canvas-library-changed',update);return()=>{window.removeEventListener('canvas-library-changed',update);controller.current?.abort();if(requestId.current)void runtime.cancelAi(requestId.current).catch(()=>{});};},[]);
  useEffect(()=>{let active=true;void listDocuments(scope).then(rows=>{if(active)setCount(rows.length)}).catch(()=>{});return()=>{active=false};},[scope,revision]);
  useEffect(()=>{
    if(!query.trim()){setHits([]);setSearching(false);return;}
    const abort=new AbortController();setSearching(!!query.trim());const timer=setTimeout(()=>{void searchOffThread(scope,query,abort.signal).then(rows=>{if(!abort.signal.aborted)setHits(rows)}).catch(()=>{if(!abort.signal.aborted)setError('本地全文搜索暂时不可用')}).finally(()=>{if(!abort.signal.aborted)setSearching(false)});},180);
    return()=>{abort.abort();clearTimeout(timer)};
  },[scope,query,revision]);
  const cancel=()=>{controller.current?.abort();if(requestId.current)void runtime.cancelAi(requestId.current).catch(()=>{});};
  async function build(){
    const course=current.current.find(c=>c.id===courseId);if(!course)return;const abort=new AbortController();controller.current=abort;setIndexing(true);setError('');setProgress('正在读取文件目录…');let done=0,failed=0,total=0;
    try{
      const loaded=await loadFiles(course);if(abort.signal.aborted)return;
      const files=(Array.isArray(loaded)?loaded:current.current.find(c=>c.id===course.id)?.files||[]) as CourseFile[];const selected=files.filter(extractable);total=selected.length;
      for(const file of selected){
        if(abort.signal.aborted)break;
        const existing=await getDocument(scope,file.id);if(existing?.version===fileVersion(file)){done++;continue;}
        const id=`index-${Date.now()}-${Math.random().toString(36).slice(2)}`;requestId.current=id;
        try{const result=await runtime.readCourseFile(file.id,id,message=>{if(!abort.signal.aborted)setProgress(`${done+failed+1}/${total} · ${file.name} · ${message}`)});if(abort.signal.aborted)break;await indexFile(scope,course.id,file,result.text);done++;}catch(e){if(abort.signal.aborted)break;failed++;setError(`${file.name}：${String(e)}`)}
      }
      if(!abort.signal.aborted)setProgress(total?`已索引 ${done} 份资料${failed?`，${failed} 份未完成，可重试`:''}`:'本课程没有可提取文字的资料');
    }catch(e){if(!abort.signal.aborted)setError(String(e))}finally{if(!abort.signal.aborted)setIndexing(false);else{setIndexing(false);setProgress(`已停止，保留已完成的 ${done} 份索引`)}requestId.current='';}
  }
  const metadataHits:StudyHit[]=query.trim()?courses.flatMap(c=>c.files.filter(f=>f.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(f=>({id:`file-name:${f.id}`,kind:'file' as const,title:f.name,courseId:c.id,snippet:'文件名匹配',file:f}))):[];
  return <section aria-label="资料全文搜索"><div className="section-heading"><h2><Search size={15}/>文件、字幕与笔记</h2><small>{count} 份正文已缓存</small></div><p className="library-index-status">文件可按名称查找，已缓存的正文可直接搜索。</p>
    {runtime.NATIVE&&<details className="search-preparation"><summary>准备课程全文搜索</summary><div className="library-index-tools"><ChoicePicker label="建立索引的课程" value={courseId} disabled={indexing} onChange={setCourseId} options={courses.map(c=>({value:c.id,label:c.name}))}/>{indexing?<button className="button secondary" onClick={cancel}><Square size={14}/>停止</button>:<button className="button secondary" disabled={!courseId} onClick={()=>void build()}>准备本课程资料</button>}</div></details>}
    {progress&&<p className="library-index-status" role="status">{indexing&&<LoaderCircle size={13} className="spin"/>}{progress}</p>}{error&&<div role="alert" className="notice amber">{error}<button className="icon-button" aria-label="关闭索引提示" onClick={()=>setError('')}><X size={14}/></button></div>}
    {searching&&<p className="library-index-status">正在搜索本地资料…</p>}
    {[...hits,...metadataHits.filter(h=>!hits.some(v=>v.file?.id===h.file?.id))].map(hit=><button className="library-result" key={hit.id} onClick={()=>onOpen(hit)}><strong><FileText size={14}/> {hit.title}</strong><p>{hit.snippet}</p><small>{courses.find(c=>c.id===hit.courseId)?.name||'课程资料'} · {hit.kind==='note'?'笔记':hit.kind==='lecture'?'录播':'课件'}{hit.page?` · 第 ${hit.page} 页`:''}{hit.timeMs!==undefined?` · ${subtitleTime(hit.timeMs)}`:''}</small></button>)}
    {!!query.trim()&&!searching&&!hits.length&&!metadataHits.length&&<p className="library-index-status">本地资料中没有匹配结果。未索引的正文尚未搜索。</p>}
  </section>;
}
