import {useEffect,useRef,useState} from 'react';
import {LoaderCircle,Play,Pause,Maximize,Video,Camera,Columns2,SwitchCamera} from 'lucide-react';
import {normalizeSlides} from './lectureSlideTimeline';
import * as runtime from './runtime';
export interface PlayerStatus {opened:boolean;positionMs:number;durationMs:number;playing:boolean;fullscreen:boolean;dual:boolean;resourceId:string;speed:number;camera:number}
export function InlinePlayer({recording,obscured,resume=false,seekTo,notify,onStatus,onScreenshot,slides=[],subtitles=[]}:{subtitles?:{bg:number;ed:number;res:string}[];slides?:Record<string,unknown>[];recording:runtime.Recording;obscured:boolean;resume?:boolean;seekTo?:{id:string;positionMs:number};notify:(s:string)=>void;onStatus?:(s:PlayerStatus)=>void;onScreenshot?:(image:string,ms:number)=>void}){
  const ref=useRef<HTMLDivElement>(null),opened=useRef(false),generation=useRef(0);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false);
  const [status,setStatus]=useState<PlayerStatus|null>(null),[trackCount,setTrackCount]=useState(1),[capturing,setCapturing]=useState(false);
  const callback=useRef(onStatus);callback.current=onStatus;
  const covered=useRef(obscured);covered.current=obscured;
  const pendingSeek=useRef(seekTo);pendingSeek.current=seekTo;
  const resourceId=`${recording.source}:${recording.id}`;
  const control=(action:string,args:Record<string,unknown>={})=>void runtime.native('playerControl',{action,resourceId,...args}).catch(e=>notify(String(e)));
  const geometry=()=>{
    const box=ref.current?.getBoundingClientRect(),scroll=ref.current?.closest('.app-content')?.getBoundingClientRect();
    return box?{left:box.left,top:box.top,width:box.width,height:box.height,viewportWidth:window.innerWidth,clipTop:Math.max(box.top,scroll?.top||0),clipBottom:Math.min(box.bottom,scroll?.bottom||window.innerHeight)}:{};
  };
  async function start(autoplay=true){
    const active=++generation.current;setBusy(true);
    try{const tracks=await runtime.recordingTracks(recording);if(active!==generation.current)return;setTrackCount(tracks.length);await runtime.native('embedPlayer',{tracks,title:recording.title,resourceId,rect:geometry(),slides:normalizeSlides(slides),subtitles,...(pendingSeek.current?{positionMs:pendingSeek.current.positionMs}:{}),autoplay:autoplay&&!covered.current&&!document.hidden,visible:!covered.current&&!document.hidden});if(active!==generation.current){await runtime.native('playerControl',{action:'close',resourceId});return;}opened.current=true;setReady(true);}
    catch(e){notify(String(e));}finally{if(active===generation.current)setBusy(false);}
  }
  useEffect(()=>{const question=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.resourceId===resourceId&&typeof value.image==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value.image)&&Number.isFinite(value.positionMs))onScreenshot?.(value.image,value.positionMs)};window.addEventListener('canvas-player-question',question);return()=>window.removeEventListener('canvas-player-question',question)},[resourceId,onScreenshot]);
  useEffect(()=>{if(ready)control('slides',{slides:normalizeSlides(slides)})},[slides,ready]);
  useEffect(()=>{if(ready)control('subtitles',{subtitles})},[subtitles,ready]);
  const triedResume=useRef(false);
  useEffect(()=>{if(seekTo&&opened.current)control('seek',{positionMs:seekTo.positionMs});},[seekTo?.id]);
  useEffect(()=>{if(resume&&!obscured&&!opened.current&&!triedResume.current){triedResume.current=true;void start(false);}},[resume,obscured]);
  useEffect(()=>{
    let frame=0;
    const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(opened.current)void runtime.native('playerControl',{action:'layout',resourceId,rect:geometry(),visible:!obscured&&!document.hidden}).catch(()=>{});});};
    const area=ref.current?.closest('.app-content');area?.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);document.addEventListener('visibilitychange',update);
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;if(ref.current)observer?.observe(ref.current);update();
    return()=>{cancelAnimationFrame(frame);observer?.disconnect();area?.removeEventListener('scroll',update);window.removeEventListener('resize',update);document.removeEventListener('visibilitychange',update);};
  },[obscured,ready]);
  useEffect(()=>{if(!ready||obscured)return;let active=true,pending=false;const poll=()=>{if(pending||document.hidden)return;pending=true;runtime.native<PlayerStatus>('playerStatus').then(value=>{if(active&&value.resourceId===resourceId){setStatus(value);callback.current?.(value);}}).catch(()=>{}).finally(()=>{pending=false;});};void poll();const timer=setInterval(poll,400);return()=>{active=false;clearInterval(timer);};},[ready,resourceId,obscured]);
  useEffect(()=>()=>{generation.current++;opened.current=false;void runtime.native('playerControl',{action:'close',resourceId:`${recording.source}:${recording.id}`}).catch(()=>{});},[recording.id]);
  return <div className="player-card"><div ref={ref} className="inline-player" aria-label="内嵌课堂播放器">{!ready&&<div><Video size={32}/><h2>{recording.title}</h2><button disabled={busy} className="button primary" onClick={()=>void start()}>{busy?<LoaderCircle size={17} className="spin"/>:<Play size={17}/>}播放本堂课</button></div>}</div>{ready&&<div className="player-toolbar"><button aria-label={status?.playing?'暂停':'播放'} onClick={()=>control('playPause')}>{status?.playing?<Pause size={18}/>:<Play size={18}/>}</button><button aria-label="播放速度" onClick={()=>{const speeds=[.75,1,1.25,1.5,2];control('speed',{speed:speeds[(speeds.indexOf(status?.speed||1)+1)%speeds.length]});}}>{status?.speed||1}×</button>{trackCount>1&&<><button aria-label="切换机位" onClick={()=>control('camera')}><SwitchCamera size={18}/></button><button aria-label="双机位" aria-pressed={status?.dual||false} onClick={()=>control('dual')}><Columns2 size={18}/></button></>}<button aria-label="截图提问" disabled={capturing} onClick={async()=>{setCapturing(true);try{const result=await runtime.native<{image:string;positionMs:number;resourceId:string}>('capturePlayer');if(result.resourceId===resourceId)onScreenshot?.(result.image,result.positionMs);}catch(e){notify(String(e));}finally{setCapturing(false);}}}>{capturing?<LoaderCircle size={18} className="spin"/>:<Camera size={18}/>}</button><button aria-label="放大全屏" onClick={()=>control('fullscreen')}><Maximize size={18}/></button></div>}</div>;
}
