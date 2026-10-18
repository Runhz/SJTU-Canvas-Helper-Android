import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type CSSProperties,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {Maximize2,Minimize2,X} from 'lucide-react';
import {Modal} from './Modal';
export function clampChatSize(width:number,height:number,docked:boolean){
  const availableW=window.visualViewport?.width||innerWidth,availableH=window.visualViewport?.height||innerHeight;
  const maximum=docked?Math.min(availableW-280,availableW*.72):availableW-16;
  return {width:Math.max(Math.min(300,maximum),Math.min(width,maximum)),height:Math.max(Math.min(220,availableH-16),Math.min(height,availableH-16))};
}
export function ChatWindow({scope,docked,title,onClose,children}:{scope:string;docked:boolean;title:string;onClose:()=>void;children:ReactNode}){
  const storageKey=`canvas-chat-window-v2:${scope}:${docked?'dock':'modal'}`;
  function restore(){try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved&&Number.isFinite(saved.width)&&Number.isFinite(saved.height))return clampChatSize(saved.width,innerHeight-24,docked)}catch{}return clampChatSize(docked?440:Math.min(720,innerWidth-16),innerHeight-24,docked)}
  const [expanded,setExpanded]=useState(false),[size,setSize]=useState(restore);
  const preferred=useRef(size);
  useLayoutEffect(()=>{const next=restore();preferred.current=next;setSize(next)},[storageKey]);
  const latest=useRef(size);latest.current=size;
  const drag=useRef<{x:number;width:number;height:number}>(),frame=useRef(0),pending=useRef<typeof size>();
  useEffect(()=>()=>{cancelAnimationFrame(frame.current);document.documentElement.classList.remove('resizing-chat')},[]);
  useEffect(()=>{const resize=()=>setSize(clampChatSize(preferred.current.width,(window.visualViewport?.height||innerHeight)-24,docked));window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);return()=>{window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize)}},[docked]);
  useEffect(()=>{if(!docked)return;const html=document.documentElement;html.classList.add('has-study-dock');html.style.setProperty('--study-dock-width',`${size.width+16}px`);return()=>{html.classList.remove('has-study-dock');html.style.removeProperty('--study-dock-width')}},[docked,size.width]);
  function commit(){if(!pending.current)return;const next=pending.current;pending.current=undefined;preferred.current=next;latest.current=next;setSize(next)}
  function finish(){cancelAnimationFrame(frame.current);commit();drag.current=undefined;document.documentElement.classList.remove('resizing-chat');try{localStorage.setItem(storageKey,JSON.stringify(latest.current))}catch{}}
  const handle={onPointerDown:(e:PointerEvent<HTMLElement>)=>{if(e.button>0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,...size};document.documentElement.classList.add('resizing-chat')},onPointerMove:(e:PointerEvent<HTMLElement>)=>{const d=drag.current;if(d){pending.current=clampChatSize(d.width+(e.clientX-d.x)*(docked?-1:1),d.height,docked);cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(commit)}},onPointerUp:finish,onPointerCancel:finish};
  const resize=<button className={`chat-window-resize ${docked?'dock-resize':''}`} aria-label="拖动调整对话窗大小" title="左右拖动调整宽度" {...handle} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();pending.current=clampChatSize(size.width+(e.key==='ArrowRight'?24:-24)*(docked?-1:1),size.height,docked);finish()}}}><span/></button>;
  const toggle=<button className="icon-button" aria-label={expanded?'收起阅读':'展开阅读'} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button>;
  if(docked&&!expanded)return createPortal(<aside className="study-chat-dock" style={{width:size.width,height:size.height,bottom:'auto'}} aria-label="随课问答"><header><div><strong>学习助手</strong><small>{title}</small></div>{toggle}<button className="icon-button" aria-label="收起 AI" onClick={onClose}><X size={19}/></button></header>{children}{resize}</aside>,document.body);
  const dimensions:CSSProperties={width:expanded?'calc(100vw - 16px)':size.width,height:expanded?'calc(100dvh - 16px)':size.height,maxHeight:'calc(100dvh - 16px)'};
  return <Modal title="学习助手" subtitle={title} wide className="study-ai-overlay resizable-chat" style={dimensions} onClose={onClose}><div className="chat-window-expand">{toggle}</div>{children}{!expanded&&resize}</Modal>;
}
