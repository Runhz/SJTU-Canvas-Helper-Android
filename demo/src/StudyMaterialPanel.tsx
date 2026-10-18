import {useEffect,useRef,useState} from 'react';
import {Check,FileText,Image,Subtitles,Search,RefreshCw,LoaderCircle,Crop,Trash2,ArrowRight} from 'lucide-react';
import type {Course} from './domain';
import type {AiPayload} from './chatHistory';
import * as runtime from './runtime';
import {Modal} from './Modal';
import {ChoicePicker} from './ChoicePicker';
import {ImageCropper} from './ImageCropper';
import {subtitleTime} from './study';
import {apiPayload,fileSource,parseTime,preparedSource,prepareSource,rangedSource,seedSources,type PreparedAttachment,type StudySource} from './studyAttachments';
import './studyMaterials.css';

function identity(source:StudySource){return source.kind==='file'?`file:${source.resourceId}`:source.key;}
export function StudyMaterialPanel({scope,courses,loadFiles,accountId,title,payload,onDone,onClose}:{scope:string;courses:Course[];loadFiles:(course:Course,force?:boolean)=>Promise<unknown>;accountId?:string;title:string;payload:AiPayload;onDone:(result:{ids:string[];payload?:AiPayload})=>Promise<void>|void;onClose:()=>void}){
  const seeds=useRef(seedSources(title,payload));
  const [selected,setSelected]=useState<StudySource[]>(()=>seeds.current),[courseId,setCourseId]=useState(String(payload.args.courseId||courses[0]?.id||''));
  const [prepared,setPrepared]=useState<PreparedAttachment[]>([]),[tab,setTab]=useState('course'),[query,setQuery]=useState(''),[limit,setLimit]=useState(80);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[failures,setFailures]=useState<string[]>([]),[successful,setSuccessful]=useState<string[]>([]);
  const [crop,setCrop]=useState<StudySource|null>(null),[range,setRange]=useState<StudySource|null>(null),[rangeError,setRangeError]=useState(''),[start,setStart]=useState('00:00:00'),[end,setEnd]=useState('00:00:00'),[format,setFormat]=useState<'txt'|'srt'>('txt');
  const abort=useRef<AbortController>(),latest=useRef({courses,loadFiles});latest.current={courses,loadFiles};
  const recentKey=`canvas-study-recent:${scope}`;
  const [recent,setRecent]=useState<StudySource[]>(()=>{try{return JSON.parse(localStorage.getItem(recentKey)||'[]').filter((s:StudySource)=>s.kind==='file'&&s.file?.raw?.id);}catch{return[];}});
  const [loading,setLoading]=useState(false);
  useEffect(()=>{if(!courseId&&courses.length)setCourseId(courses[0].id);},[courseId,courses.length]);
  useEffect(()=>{let active=true;if(runtime.NATIVE)void runtime.native<{items:PreparedAttachment[]}>('studyPrepared',{scope}).then(value=>{if(!active)return;setPrepared(value.items);if(!seeds.current.length){try{const ids=JSON.parse(localStorage.getItem(`canvas-study-basket:${scope}`)||'[]');const items=value.items.filter(item=>ids.includes(item.id)).map(preparedSource);setSelected(items);}catch{}}}).catch(()=>{if(active)setError('无法读取已准备资料，请重试');});return()=>{active=false;abort.current?.abort();};},[scope]);
  useEffect(()=>{if(tab!=='course'||!courseId)return;let active=true;const course=latest.current.courses.find(c=>c.id===courseId);if(course){setLoading(true);void latest.current.loadFiles(course).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});}return()=>{active=false;};},[courseId,tab]);
  const course=courses.find(c=>c.id===courseId);
  const rows=tab==='ready'?prepared.map(preparedSource):tab==='recent'?[...recent,...prepared.map(preparedSource)]:[...seeds.current,...(course?.files||[]).map(file=>fileSource(file,courseId))];
  const uniqueMap=new Map<string,StudySource>();for(const row of rows)if(!uniqueMap.has(identity(row)))uniqueMap.set(identity(row),row);
  const unique=Array.from(uniqueMap.values());
  const visible=unique.filter(row=>row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function toggle(source:StudySource){setSelected(old=>old.some(s=>identity(s)===identity(source))?old.filter(s=>identity(s)!==identity(source)):[...old,source]);setFailures([]);setSuccessful([]);}
  function replace(source:StudySource,next:StudySource){setSelected(old=>[...old.filter(s=>identity(s)!==identity(source)),next]);setFailures([]);}
  function remember(){const next=[...selected.filter(s=>s.kind==='file'&&!s.prepared),...recent].filter((s,i,all)=>all.findIndex(v=>identity(v)===identity(s))===i).slice(0,40).map(s=>({...s,file:s.file?{...s.file,raw:{id:Number(s.resourceId),size:s.size,updatedAt:s.file.raw?.updatedAt,mime:s.mime}}:undefined}));try{localStorage.setItem(recentKey,JSON.stringify(next));}catch{}setRecent(next);}
  async function confirm(){
    if(busy)return;const controller=new AbortController();abort.current=controller;setBusy(true);setError('');
    try{remember();const next=await apiPayload(selected,payload,scope);if(!controller.signal.aborted)await onDone({ids:[],payload:next});}catch(e){setError(String(e).replace(/^Error: /,''));}finally{setBusy(false);}
  }
  async function savePrepared(){
    if(busy)return;const controller=new AbortController();abort.current=controller;setBusy(true);setError('');setFailures([]);setSuccessful([]);
    const ids:string[]=[],failed:string[]=[];
    try{remember();for(const source of selected){if(controller.signal.aborted)break;setProgress(`正在准备 ${source.name}`);try{const item=await prepareSource(source,scope,accountId,controller.signal,setProgress);ids.push(item.id);setPrepared(old=>[item,...old.filter(s=>s.id!==item.id)]);}catch(e){if(controller.signal.aborted)break;failed.push(`${source.name}：${String(e).replace(/^Error: /,'')}`);}}
      setFailures(failed);setSuccessful(ids);try{localStorage.setItem(`canvas-study-basket:${scope}`,JSON.stringify(ids));}catch{}
    }finally{setBusy(false);setProgress('');}
  }
  function openRange(source:StudySource){setRangeError('');setRange(source);setStart(subtitleTime(source.lines?.[0]?.bg||0));const lines=source.lines||[];setEnd(subtitleTime((lines[lines.length-1]?.ed||lines[lines.length-1]?.bg||0)+3000));setFormat('txt');}
  async function forget(source:StudySource){try{if(source.prepared){await runtime.native('studyForget',{scope,id:source.prepared.id});setPrepared(old=>old.filter(v=>v.id!==source.prepared!.id));}else{const next=recent.filter(v=>identity(v)!==identity(source));setRecent(next);localStorage.setItem(recentKey,JSON.stringify(next));}setSelected(old=>old.filter(v=>identity(v)!==identity(source)));setSuccessful([]);setFailures([]);}catch(e){setError(String(e));}}
  return <Modal title="提问资料" subtitle="学习助手 · 资料上下文" wide onClose={()=>{abort.current?.abort();onClose();}}>
    <div className="study-panel"><div className="study-panel-tabs">{[{id:'course',name:'课程资料'},{id:'recent',name:'最近使用'},{id:'ready',name:'已准备'}].map(item=><button key={item.id} className={tab===item.id?'selected':''} onClick={()=>{setTab(item.id);setLimit(80);}}>{item.name}</button>)}</div>
    <div className="study-panel-grid"><div className="study-library">
      {tab==='course'&&<div className="study-course-select"><ChoicePicker label="资料课程" value={courseId} onChange={setCourseId} options={courses.map(c=>({value:c.id,label:c.name}))}/><button className="icon-button" disabled={loading||!course} aria-label="刷新课程资料" onClick={()=>{if(course){setLoading(true);void loadFiles(course,true).catch(e=>setError(String(e))).finally(()=>setLoading(false));}}}><RefreshCw size={17} className={loading?'spin':''}/></button></div>}
      <label className="search-field"><Search size={16}/><input aria-label="搜索提问资料" placeholder="搜索文件或字幕" value={query} onChange={e=>{setQuery(e.target.value);setLimit(80);}}/></label>
      <div className="study-file-list" aria-label="可选资料">{visible.slice(0,limit).map(source=>{
        const checked=selected.some(s=>identity(s)===identity(source));
        const Icon=source.kind==='image'?Image:source.kind==='subtitle'?Subtitles:FileText;
        return <div className={`study-file-row ${checked?'selected':''}`} key={source.key}><button className="study-file-select" disabled={busy} aria-pressed={checked} onClick={()=>toggle(source)}><span className="study-file-glyph"><Icon size={20}/></span><span><strong>{source.name}</strong><small>{source.prepared?'已准备':source.kind==='file'?'选择后按需下载':'课堂资料'}{source.size!==undefined?` · ${source.size>=1048576?(source.size/1048576).toFixed(1)+' MB':Math.ceil(source.size/1024)+' KB'}`:''}</small></span><span className="study-check">{checked&&<Check size={15}/>}</span></button>{tab==='recent'||tab==='ready'?<button className="icon-button" aria-label={`移除最近资料 ${source.name}`} disabled={busy} onClick={()=>void forget(source)}><Trash2 size={14}/></button>:null}</div>;
      })}{!visible.length&&<div className="empty"><FileText size={26}/><h3>{loading?'正在读取目录':'暂无资料'}</h3><p>{accountId?'可切换课程或刷新目录':'连接 Canvas 后可选择课程文件'}</p></div>}{visible.length>limit&&<button className="text-button" onClick={()=>setLimit(n=>n+80)}>显示更多资料</button>}</div>
      {tab==='ready'&&runtime.NATIVE&&<button className="text-button" disabled={busy} onClick={()=>void runtime.native<{removed:number}>('studyClear',{scope}).then(async()=>{const value=await runtime.native<{items:PreparedAttachment[]}>('studyPrepared',{scope});setPrepared(value.items);setError('已清理临时附件，课程下载仍保留');}).catch(e=>setError(String(e)))}>清理临时附件</button>}
    </div><aside className="study-selection"><h3>已选资料 <span>{selected.length}</span></h3>{selected.map(source=><div className="study-selected-item" key={source.key}><div><strong>{source.name}</strong><button className="icon-button" disabled={busy} aria-label={`移除附件 ${source.name}`} onClick={()=>toggle(source)}><Trash2 size={14}/></button></div>{source.image&&<><img src={source.image} alt="课堂截图预览"/><button className="text-button" disabled={busy} onClick={()=>setCrop(source)}><Crop size={14}/>裁剪截图</button></>}{!!source.lines?.length&&<button className="text-button" disabled={busy} onClick={()=>openRange(source)}><Subtitles size={14}/>选择字幕范围</button>}</div>)}{!selected.length&&<p className="ai-footnote">可选择资料，也可以直接聊天。</p>}</aside></div>
    {error&&<p className="notice amber" role="status">{error}</p>}{failures.length>0&&<div className="notice amber" role="alert">{failures.map(text=><p key={text}>{text}</p>)}</div>}{!!successful.length&&<p className="ai-footnote">已保存 {successful.length} 项，可在“已准备”中找到。</p>}
    <footer className="study-panel-footer"><span>{busy?<><LoaderCircle size={15} className="spin"/>{progress||'正在处理资料'}</>:'发送前可继续编辑问题'}</span>{busy?<button className="button secondary" onClick={()=>abort.current?.abort()}>取消准备</button>:<div className="button-row"><button className="button secondary" disabled={!selected.length} onClick={()=>void savePrepared()}>保存资料</button><button className="button primary" onClick={()=>void confirm()}>进入助手<ArrowRight size={16}/></button></div>}</footer></div>
    {crop&&<ImageCropper image={crop.image!} onClose={()=>setCrop(null)} onDone={image=>{replace(crop,{...crop,image,prepared:undefined});setCrop(null);}}/>}
    {range&&<Modal title="字幕范围" subtitle={range.name} onClose={()=>setRange(null)}><div className="subtitle-range"><div className="button-row"><button className="button secondary" onClick={()=>{const position=Number(payload.args.positionMs)||0;setStart(subtitleTime(Math.max(0,position-120000)));setEnd(subtitleTime(position+120000));}}>当前位置前后 2 分钟</button><button className="button secondary" onClick={()=>openRange(range)}>全部字幕</button></div><label>开始时间<input aria-label="字幕开始时间" value={start} onChange={e=>setStart(e.target.value)} inputMode="numeric"/></label><label>结束时间<input aria-label="字幕结束时间" value={end} onChange={e=>setEnd(e.target.value)} inputMode="numeric"/></label><ChoicePicker label="字幕格式" value={format} onChange={value=>setFormat(value as 'txt'|'srt')} options={[{value:'txt',label:'文字稿 TXT'},{value:'srt',label:'字幕 SRT'}]}/>{rangeError&&<p className="notice amber" role="alert">{rangeError}</p>}<button className="button primary full" onClick={()=>{try{const from=parseTime(start),to=parseTime(end);if(from===null||to===null)throw Error('时间格式为 时:分:秒 或 分:秒');replace(range,rangedSource(range,from,to,format));setRange(null);}catch(e){setRangeError(String(e).replace(/^Error: /,''));}}}>使用所选字幕</button></div></Modal>}
  </Modal>;
}
