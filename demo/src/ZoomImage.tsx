import {useEffect,useRef,useState} from 'react';
import {Maximize,Minimize,Minus,Plus,RotateCcw,MessageCircle,LoaderCircle} from 'lucide-react';
import {Modal} from './Modal';
export function clampImagePan(x:number,y:number,width:number,height:number,imageWidth:number,imageHeight:number){
  const dx=Math.max(width*.2,Math.abs(imageWidth-width)/2),dy=Math.max(height*.2,Math.abs(imageHeight-height)/2);
  return{x:Math.max(-dx,Math.min(dx,x)),y:Math.max(-dy,Math.min(dy,y))};
}
export function ZoomImage({src,alt,onZoom,initialZoom=1,contained=false,controls=true,onAsk,asking=false}:{src:string;alt:string;onZoom?:(zoom:number)=>void;initialZoom?:number;contained?:boolean;controls?:boolean;onAsk?:()=>void;asking?:boolean}){
  const viewport=useRef<HTMLDivElement>(null),points=useRef(new Map<number,{x:number;y:number}>());
  const [zoom,setZoom]=useState(initialZoom),[full,setFull]=useState(false),[size,setSize]=useState({w:1,h:1}),[natural,setNatural]=useState({w:16,h:10}),[pan,setPan]=useState({x:0,y:0});
  const actual=useRef(initialZoom),offset=useRef(pan),frame=useRef(0),pending=useRef(pan);
  const gesture=useRef<{distance:number;zoom:number;x:number;y:number;pan:{x:number;y:number}}>();
  const fitted=true,base=fitted?Math.min(size.w,size.h*natural.w/natural.h):size.w,ratio=natural.h/natural.w;
  const move=(x:number,y:number,value=actual.current)=>{const next=clampImagePan(x,y,size.w,size.h,base*value,base*value*ratio);offset.current=next;pending.current=next;cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>setPan(pending.current));};
  const apply=(value:number,reset=false)=>{const next=Math.min(6,Math.max(.25,value));actual.current=next;setZoom(next);onZoom?.(next);move(reset?0:offset.current.x,reset?0:offset.current.y,next);};
  useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
  useEffect(()=>{apply(initialZoom,true);points.current.clear();gesture.current=undefined},[src]);
  useEffect(()=>{if(initialZoom!==actual.current)apply(initialZoom,true)},[initialZoom]);
  useEffect(()=>{const el=viewport.current;if(!el)return;const measure=()=>{const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);setSize({w,h});offset.current={x:0,y:0};setPan({x:0,y:0})};const observer=new ResizeObserver(measure);observer.observe(el);measure();return()=>observer.disconnect()},[full,contained]);
  function toggleFull(){apply(1,true);setFull(v=>!v)}
  function begin(){const list=[...points.current.values()];if(!list.length){gesture.current=undefined;return}const [a,b=a]=list;gesture.current={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:actual.current,x:(a.x+b.x)/2,y:(a.y+b.y)/2,pan:{...offset.current}}}
  const content=<div className={`zoom-reader ${full?'reader-expanded':''} ${contained?'reader-contained':''}`}>
    {controls&&<div className="reader-tools" role="toolbar" aria-label="预览缩放"><button aria-label="缩小预览" disabled={zoom<=.25} onClick={()=>apply(zoom-.25)}><Minus size={17}/></button><button aria-label="适合窗口" onClick={()=>apply(1,true)}><RotateCcw size={16}/><span>{Math.round(zoom*100)}%</span></button><button aria-label="放大预览" disabled={zoom>=6} onClick={()=>apply(zoom+.25)}><Plus size={17}/></button>{onAsk&&<button className="reader-ask" aria-label="课件切片问 AI" disabled={asking} onClick={()=>{if(full)setFull(false);onAsk()}}>{asking?<LoaderCircle size={16} className="spin"/>:<MessageCircle size={16}/>}<span>问 AI</span></button>}<button className="reader-fullscreen" aria-label={full?'退出全屏预览':'全屏预览'} onClick={toggleFull}>{full?<Minimize size={17}/>:<Maximize size={17}/>}</button></div>}
    <div className="reader-viewport" ref={viewport} tabIndex={0} aria-label={alt+'，可双指缩放或拖动'} onDoubleClick={()=>apply(zoom>1?1:2,true)} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});begin()}} onPointerMove={e=>{
      if(!points.current.has(e.pointerId)||!gesture.current)return;e.preventDefault();points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=gesture.current;
      if(points.current.size===2){const [a,b]=[...points.current.values()],next=Math.min(6,Math.max(.25,g.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,g.distance))),rect=e.currentTarget.getBoundingClientRect(),cx=(a.x+b.x)/2-rect.left-size.w/2,cy=(a.y+b.y)/2-rect.top-size.h/2,ox=g.x-rect.left-size.w/2,oy=g.y-rect.top-size.h/2;actual.current=next;setZoom(next);onZoom?.(next);move(cx-(ox-g.pan.x)*next/g.zoom,cy-(oy-g.pan.y)*next/g.zoom,next)}
      else move(g.pan.x+e.clientX-g.x,g.pan.y+e.clientY-g.y);
    }} onPointerUp={e=>{points.current.delete(e.pointerId);begin()}} onPointerCancel={e=>{points.current.delete(e.pointerId);begin()}} onLostPointerCapture={e=>{points.current.delete(e.pointerId);begin()}}>
      <img draggable={false} src={src} alt={alt} style={{position:'absolute',left:'50%',top:fitted?'50%':Math.max(size.h,base*zoom*ratio)/2,width:base*zoom,height:base*zoom*ratio,maxWidth:'none',transform:`translate(calc(-50% + ${pan.x}px),calc(-50% + ${pan.y}px))`}} onLoad={e=>setNatural({w:e.currentTarget.naturalWidth||16,h:e.currentTarget.naturalHeight||10})}/>
    </div>
  </div>;
  return full?<Modal title={alt} fullscreen onClose={()=>setFull(false)}>{content}</Modal>:content;
}
