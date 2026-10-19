import {useEffect,useRef,useState} from 'react';
import {Maximize,Minimize,ChevronUp,ChevronDown,MessageCircle,LoaderCircle,RefreshCw} from 'lucide-react';
import {Modal} from './Modal';
import type {TimedSlide} from './lectureSlideTimeline';
import './studyReader.css';

function SlidePage({slide,number,active}:{slide:TimedSlide;number:number;active:boolean}){
  const [state,setState]=useState<'loading'|'ready'|'error'>('loading'),[retry,setRetry]=useState(0);
  useEffect(()=>{setState('loading');if(!active||!slide.image)return;const timer=setTimeout(()=>setState(value=>value==='ready'?value:'error'),18000);return()=>clearTimeout(timer)},[slide.image,active,retry]);
  return <div className="slide-deck-page" aria-label={`课堂切片 ${number}`}>
    {active&&slide.image&&state!=='error'&&<img key={retry} src={slide.image} alt={`课堂切片 ${number}`} draggable={false} referrerPolicy="no-referrer" onLoad={()=>setState('ready')} onError={()=>setState('error')}/>}
    {active&&(!slide.image||state==='error')?<div className="slide-deck-empty"><span>课件画面暂不可用</span>{slide.image&&<button className="button secondary" onClick={()=>{setState('loading');setRetry(n=>n+1)}}><RefreshCw size={15}/>重新加载</button>}</div>:active&&state==='loading'&&<div className="slide-deck-loading" role="status"><LoaderCircle size={15} className="spin"/>正在加载课件…</div>}
  </div>;
}
/** Images stay fitted to the page; the only reading gesture is vertical paging. */
export function SlideDeck({slides,index,onIndex,onAsk,asking=false}:{slides:TimedSlide[];index:number;onIndex:(index:number)=>void;onAsk?:()=>void;asking?:boolean}){
  const [full,setFull]=useState(false);
  const box=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>>(),target=useRef(index),change=useRef(onIndex);target.current=index;change.current=onIndex;
  useEffect(()=>{const el=box.current;if(!el)return;const align=()=>{clearTimeout(timer.current);el.scrollTop=target.current*el.clientHeight;};align();const observer=new ResizeObserver(align);observer.observe(el);return()=>{observer.disconnect();clearTimeout(timer.current)}},[full,slides.length]);
  useEffect(()=>{const el=box.current;if(el&&Math.abs(el.scrollTop-index*el.clientHeight)>2){clearTimeout(timer.current);el.scrollTo({top:index*el.clientHeight,behavior:'auto'});}},[index]);
  const content=<div className={`slide-deck ${full?'slide-deck-full':''}`}>
    <div className="slide-deck-toolbar" role="toolbar" aria-label="课件切片工具"><button aria-label="上一张课件切片" disabled={index<=0} onClick={()=>onIndex(index-1)}><ChevronUp size={17}/></button><span aria-live="polite">{index+1}<small> / {slides.length}</small></span><button aria-label="下一张课件切片" disabled={index>=slides.length-1} onClick={()=>onIndex(index+1)}><ChevronDown size={17}/></button><i/>{onAsk&&<button className="slide-deck-ask" aria-label="课件切片问 AI" disabled={asking} onClick={()=>{if(full)setFull(false);onAsk()}}>{asking?<LoaderCircle size={16} className="spin"/>:<MessageCircle size={16}/>}问 AI</button>}<button aria-label={full?'退出全屏预览':'全屏预览'} onClick={()=>setFull(v=>!v)}>{full?<Minimize size={17}/>:<Maximize size={17}/>}</button></div>
    <div className="slide-deck-pages" ref={box} tabIndex={0} aria-label="课件切片，上下滑动翻页" onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();onIndex(Math.min(slides.length-1,Math.max(0,index+(e.key==='ArrowDown'?1:-1))))}}} onScroll={()=>{clearTimeout(timer.current);timer.current=setTimeout(()=>{const el=box.current;if(!el||!el.clientHeight)return;const next=Math.min(slides.length-1,Math.max(0,Math.round(el.scrollTop/el.clientHeight)));if(next!==target.current)change.current(next)},100)}}>
      {slides.map((slide,i)=><SlidePage key={slide.key} slide={slide} number={i+1} active={Math.abs(i-index)<=1}/>)}
    </div>
  </div>;
  if(!slides.length)return <div className="slide-deck slide-deck-empty" role="status">平台暂无可用课件切片</div>;
  return full?<Modal title="课件切片" fullscreen onClose={()=>setFull(false)}>{content}</Modal>:content;
}
