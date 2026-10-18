import {lecturePayload} from './studyAssist';
import type {SubtitleLine} from './study';
import {useEffect,useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {BookOpen,GripHorizontal,Maximize2,Camera,RefreshCw,Scaling,SwitchCamera,X} from 'lucide-react';
import type {Course,CourseFile} from './domain';
import type {Recording} from './runtime';
import {native} from './runtime';
import type {AiPayload} from './chatHistory';
import {useRememberedState} from './pageMemory';
import {safeFile} from './studyLibrary';
import {clampFloating,type FloatingBox} from './floatingStudy';
import {Modal} from './Modal';
import DocumentReader from './DocumentReader';
export function LectureDocumentWorkspace({scope,pane,accountId,recording,course,loadFiles,onAi,children,obscured=false,lines=[]}:{lines?:SubtitleLine[];obscured?:boolean;scope:string;pane:'left'|'right';accountId?:string;recording:Recording;course?:Course;loadFiles:(course:Course,force?:boolean)=>Promise<unknown>;onAi:(title:string,payload?:AiPayload)=>void;children:ReactNode}){
  const key=`canvas-lecture-desk-v1:${scope}:${recording.source}:${recording.id}`;
  const [chosen,setChosen]=useRememberedState<CourseFile|null>(key,null,v=>{const f=v as CourseFile;return f&&typeof f.id==='string'&&typeof f.name==='string'?safeFile(f):null});
  const [picker,setPicker]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[viewport,setViewport]=useState({width:innerWidth,height:innerHeight});
  const [savedDoc,setSavedDoc]=useRememberedState<FloatingBox>(key+':box',{x:innerWidth-408,y:Math.max(8,innerHeight-348),width:400,height:330},v=>clampFloating(v as FloatingBox||{x:innerWidth-408,y:Math.max(8,innerHeight-348),width:400,height:330},innerWidth,innerHeight));

  const [doc,setDoc]=useState(savedDoc),latestDoc=useRef(doc);latestDoc.current=doc;
  const drag=useRef<{kind:'doc';resize:boolean;x:number;y:number;box:FloatingBox}>();
  useEffect(()=>{const resize=()=>setViewport({width:innerWidth,height:innerHeight});window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
  useEffect(()=>{const frame=requestAnimationFrame(()=>window.dispatchEvent(new Event('canvas-floating-layout')));return()=>cancelAnimationFrame(frame)},[doc,viewport]);
  function gesture(kind:'doc',resize=false){return{onPointerDown:(e:PointerEvent<HTMLElement>)=>{if(!resize&&(e.target as HTMLElement).closest('button'))return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={kind,resize,x:e.clientX,y:e.clientY,box:clampFloating(doc,viewport.width,viewport.height)}},onPointerMove:(e:PointerEvent<HTMLElement>)=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y,next=clampFloating(d.resize?{...d.box,width:d.box.width+dx,height:d.box.height+dy}:{...d.box,x:d.box.x+dx,y:d.box.y+dy},viewport.width,viewport.height);setDoc(next)},onPointerUp:()=>{drag.current=undefined;setSavedDoc(latestDoc.current)},onPointerCancel:()=>{drag.current=undefined;setSavedDoc(latestDoc.current)}}}
  async function choose(){setPicker(true);if(!course)return;setBusy(true);setError('');try{await loadFiles(course)}catch{setError('文件目录暂未更新，可重试')}finally{setBusy(false)}}
  function askDocument(payload?:AiPayload){if(!chosen)return;let next=payload;
    if(payload?.args.screenshot&&payload.args.videoResourceId===`${recording.source}:${recording.id}`&&Number.isFinite(payload.args.videoPositionMs)){
      const nearby=lecturePayload(recording.title,`${recording.source}:${recording.id}`,recording.courseId,Number(payload.args.videoPositionMs),lines);
      next={mode:'materials',args:{...nearby.args,...payload.args,recording,text:nearby.args.text,contextLabel:`课件画面 · ${String(nearby.args.positionLabel)}`}};
    }
    onAi(chosen.name,next?{...next,args:{...next.args,forceModal:true}}:next);
  }
  const docBox=clampFloating(doc,viewport.width,viewport.height);
  return <><div className="lecture-desk-tools">{error&&!picker&&<small role="alert">{error}</small>}<button className="button secondary" onClick={()=>void choose()}><BookOpen size={16}/>{chosen?'更换课件':'打开课件'}</button>{chosen&&<button className="text-button" onClick={()=>void native('playerControl',{action:'documentPrimary',resourceId:`${recording.source}:${recording.id}`}).catch(()=>setError('请先播放本堂课，再互换课件与录播'))}><SwitchCamera size={16}/>课件为主</button>}</div><div className="lecture-video-slot">{children}</div>
    {chosen&&createPortal(<section className="floating-study document-floating" style={{left:docBox.x,top:docBox.y,width:docBox.width,height:docBox.height}} aria-label="课件小窗" hidden={obscured}><header className="floating-study-handle" {...gesture('doc')}><GripHorizontal size={17}/><strong>{chosen.name}</strong><button className="icon-button" aria-label="课件截图提问" title="课件截图提问" onClick={()=>window.dispatchEvent(new CustomEvent('canvas-capture-document',{detail:{fileId:chosen.id}}))}><Camera size={17}/></button><button className="text-button" aria-label="课件为主" onClick={()=>void native('playerControl',{action:'documentPrimary',resourceId:`${recording.source}:${recording.id}`}).catch(()=>setError('请先播放本堂课，再互换课件与录播'))}><SwitchCamera size={16}/><span>课件为主</span></button><button className="icon-button" aria-label="关闭课件小窗" onClick={()=>{setChosen(null)}}><X size={17}/></button></header><DocumentReader lectureResourceId={`${recording.source}:${recording.id}`} compact foreground key={chosen.id} scope={scope} accountId={accountId} pane={pane} courseId={recording.courseId} file={course?.files.find(f=>f.id===chosen.id)||chosen} onClose={()=>{setChosen(null)}} onAi={askDocument}/>{<button className="floating-resize" aria-label="调整课件小窗大小" {...gesture('doc',true)}><Scaling size={17}/></button>}</section>,document.body)}
    {picker&&<Modal title="选择本堂课件" onClose={()=>setPicker(false)}><div className="lecture-file-picker">{busy&&<p role="status">正在读取文件目录…</p>}{error&&<p role="alert">{error}</p>}{course?.files.map(file=><button key={file.id} onClick={()=>{setChosen(safeFile(file));setPicker(false)}}><BookOpen size={18}/><span>{file.name}<small>{file.size}</small></span></button>)}{!busy&&!course?.files.length&&<p className="paragraph">本课程暂无可用文件</p>}<button className="text-button" disabled={busy||!course} onClick={async()=>{if(!course)return;setBusy(true);try{await loadFiles(course,true);setError('')}catch{setError('目录读取失败，请重试')}finally{setBusy(false)}}}><RefreshCw size={15}/>刷新目录</button></div></Modal>}
  </>;
}
