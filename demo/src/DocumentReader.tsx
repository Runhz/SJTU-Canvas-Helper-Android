import type {AiPayload} from './chatHistory';
import {StudyNotes} from './StudyNotes';
import {BackButton} from './BackButton';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowDownToLine,ExternalLink,LoaderCircle,RefreshCw,FileText,Maximize} from 'lucide-react';
import type {CourseFile} from './domain';
import * as runtime from './runtime';
import {fileSource,prepareSource} from './studyAttachments';
import {fileVersion} from './studyLibrary';
import './studyReader.css';

export const localPreview=(_name:string)=>false;
const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).replace(/^(?:Error|TypeError):\s*/,'');
export default function DocumentReader({scope,accountId,courseId,file,onClose,onAi,pane='left',compact=false,foreground=true,lectureResourceId}:{scope:string;accountId?:string;courseId:string;file:CourseFile;initialPage?:number;onPage?:(page:number)=>void;onClose:()=>void;onAi?:(payload?:AiPayload)=>void;pane?:'left'|'right';compact?:boolean;foreground?:boolean;lectureResourceId?:string}){
  const alive=useRef(true),node=useRef<HTMLDivElement>(null),id=useRef(`document-${Date.now()}-${Math.random().toString(36).slice(2)}`),external=useRef<AbortController>();
  const [state,setState]=useState('loading'),[error,setError]=useState(''),[reload,setReload]=useState(0),[ready,setReady]=useState(false),[capturing,setCapturing]=useState(false),[notesOpen,setNotesOpen]=useState(false);
  const geometry=()=>{const b=node.current?.getBoundingClientRect(),area=node.current?.closest('.app-content')?.getBoundingClientRect();return b?{left:b.left,top:b.top,width:b.width,height:b.height,viewportWidth:innerWidth,foreground,clipTop:Math.max(b.top,area?.top||0),clipBottom:Math.min(b.bottom,area?.bottom||innerHeight)}:{}};
  useEffect(()=>{
    let active=true,opened=false,pending=false;let connectTimer:ReturnType<typeof setTimeout>|undefined;alive.current=true;setState('loading');setError('');setReady(false);
    const current=id.current;
    async function open(){
      if(!runtime.NATIVE){setState('demo');return}
      const result=await Promise.race([runtime.api<{url:string}>('filePreview',{file:{id:Number(file.id)}}),new Promise<never>((_,reject)=>{connectTimer=setTimeout(()=>reject(Error('平台预览连接超时，请重新加载')),30000)})]).finally(()=>clearTimeout(connectTimer));if(!active)return;
      if(!result?.url)throw Error('平台暂未提供预览，可下载后用外部应用打开');
      await runtime.native('embedDocument',{id:current,scope,url:result.url,title:file.name,pane,lectureResourceId,rect:geometry(),visible:!document.hidden});
      if(!active){void runtime.native('documentPreviewControl',{id:current,action:'close'}).catch(()=>{});return}
      opened=true;setReady(true);
    }
    void open().catch(e=>{if(active){setError(message(e));setState('error')}});
    let frame=0;
    const layout=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(opened)void runtime.native('documentPreviewControl',{id:current,action:'layout',rect:geometry(),visible:!document.hidden}).catch(()=>{})})};
    const area=node.current?.closest('.app-content');area?.addEventListener('scroll',layout,{passive:true});window.addEventListener('resize',layout);window.addEventListener('canvas-floating-layout',layout);document.addEventListener('visibilitychange',layout);
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(layout):undefined;if(node.current)observer?.observe(node.current);
    const timer=setInterval(()=>{if(!opened||!active||pending||document.hidden)return;pending=true;void runtime.native<{state:string}>('documentPreviewControl',{id:current,action:'status'}).then(value=>{if(active)setState(value.state)}).catch(()=>{}).finally(()=>{pending=false})},1200);
    return()=>{active=false;alive.current=false;clearTimeout(connectTimer);clearInterval(timer);cancelAnimationFrame(frame);observer?.disconnect();area?.removeEventListener('scroll',layout);window.removeEventListener('resize',layout);window.removeEventListener('canvas-floating-layout',layout);document.removeEventListener('visibilitychange',layout);external.current?.abort();void runtime.native('documentPreviewControl',{id:current,action:'close'}).catch(()=>{})};
  },[scope,file.id,fileVersion(file),reload,pane]);
  const filePayload=(extra:Record<string,unknown>={}):AiPayload=>({mode:'file',args:{file:{id:Number(file.id)},fileName:file.name,title:file.name,courseId,...extra}});
  function askImage(image:string,anchor?:{videoResourceId?:string;videoPositionMs?:number}){onAi?.({mode:'materials',args:{...filePayload().args,text:'',screenshot:image,...(anchor?.videoResourceId&&Number.isFinite(anchor.videoPositionMs)?{videoResourceId:anchor.videoResourceId,videoPositionMs:anchor.videoPositionMs}:{}),contextLabel:'当前预览画面'}})}
  useEffect(()=>{const question=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.id===id.current&&typeof detail.image==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(detail.image))askImage(detail.image,detail)};window.addEventListener('canvas-document-question',question);return()=>window.removeEventListener('canvas-document-question',question)},[onAi,file.id,courseId]);
  async function screenshot(){setCapturing(true);setError('');try{const frame=await runtime.native<{image:string;videoResourceId?:string;videoPositionMs?:number}>('captureDocument',{id:id.current});if(alive.current)askImage(frame.image,frame)}catch(e){if(alive.current)setError(message(e))}finally{if(alive.current)setCapturing(false)}}
  useEffect(()=>{const capture=(event:Event)=>{if((event as CustomEvent).detail?.fileId===file.id&&ready&&!capturing)void screenshot()};window.addEventListener('canvas-capture-document',capture);return()=>window.removeEventListener('canvas-capture-document',capture)},[file.id,ready,capturing,onAi]);
  async function outside(){external.current?.abort();const c=new AbortController();external.current=c;setError('');try{const item=await prepareSource(fileSource(file,courseId),scope,accountId,c.signal,()=>{});if(!c.signal.aborted)await runtime.native('openPreparedDocument',{scope,id:item.id,mime:item.mime})}catch(e){if(!c.signal.aborted)setError(message(e))}}
  return <section className={`document-reader ${compact?'compact-document':''}`} aria-label={`阅读 ${file.name}`}>
    <header className="reader-heading"><BackButton onClick={onClose}>返回资料</BackButton><div><h2>{file.name}</h2><small>平台预览</small></div><button className="icon-button" aria-label="重新读取文件" onClick={()=>setReload(n=>n+1)}><RefreshCw size={18}/></button></header>
    <div className="document-preview-caption"><span>课程资料</span>{compact&&<button className="text-button" aria-label="重新连接平台预览" onClick={()=>setReload(n=>n+1)}><RefreshCw size={15}/></button>}<button className="text-button" disabled={!ready} onClick={()=>void runtime.native('documentPreviewControl',{id:id.current,action:'fullscreen'}).catch(e=>setError(message(e)))}><Maximize size={16}/>{compact?'单页阅读':'放大阅读'}</button></div>
    <div className="document-preview-card platform-preview-card"><div ref={node} className="document-preview-canvas" aria-label="文件预览窗口">
      {!ready&&state==='loading'&&<div className="document-preview-loading" role="status"><LoaderCircle size={20} className="spin"/>正在连接平台预览…</div>}
      {state==='demo'&&<div className="document-preview-placeholder"><FileText size={30}/><strong>平台课件预览</strong><span>在 Android 应用中查看课程文件</span></div>}
      {error&&!ready&&<div className="document-preview-error" role="alert"><p>{error}</p><button className="button secondary" onClick={()=>setReload(n=>n+1)}>重新加载</button></div>}
    </div><div className="platform-preview-footer"><span>{state==='error'?'加载未完成':state==='loading'?'正在加载':'平台阅读器'}</span><button className="text-button" onClick={()=>setReload(n=>n+1)}><RefreshCw size={13}/>重新加载</button></div></div>
    <footer className="reader-actions">{onAi&&<><button className="button primary" onClick={()=>onAi(filePayload())}>询问文件</button><button className="button secondary" onClick={()=>onAi(filePayload({readMode:'full',initialQuestion:'请提炼这份文件的知识框架、重要结论、公式和易错点，保留真实页码。'}))}>AI 总结</button><button className="button secondary" disabled={!ready||capturing} onClick={()=>void screenshot()}>{capturing?<LoaderCircle size={16} className="spin"/>:<Maximize size={16}/>}截图提问</button><button className="text-button" onClick={()=>onAi(filePayload({history:true}))}>对话记录</button></>}<button className="button secondary" disabled={!accountId} onClick={()=>void runtime.enqueueFile(file,courseId,accountId!).catch(e=>setError(message(e)))}><ArrowDownToLine size={16}/>下载</button><button className="button secondary" disabled={!accountId} onClick={()=>void outside()}><ExternalLink size={16}/>外部打开</button></footer>{ready&&error&&<p role="alert" className="notice amber">{error}</p>}<details className="file-notes" onToggle={e=>setNotesOpen(e.currentTarget.open)}><summary>文件笔记</summary>{notesOpen&&<StudyNotes scope={scope} fileId={file.id} onContinue={conversationId=>onAi?.(filePayload({conversationId}))}/>}</details>
  </section>;
}
