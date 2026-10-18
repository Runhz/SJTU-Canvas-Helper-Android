import type {AiPayload} from './chatHistory';
import {useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,MessageCircle,LoaderCircle} from 'lucide-react';
import type {Course} from './domain';
import type {Recording} from './runtime';
import {native,NATIVE} from './runtime';
import {useRememberedState} from './pageMemory';
import {subtitleTime,type SubtitleLine} from './study';
import {lecturePayload} from './studyAssist';
import {ZoomImage} from './ZoomImage';
import './studyReader.css';
import {normalizeSlides,slideAt} from './lectureSlideTimeline';
export {normalizeSlides,slideAt} from './lectureSlideTimeline';
export function LectureSlides({scope,recording,slides,positionMs,lines=[],onSeek,onAi}:{lines?:SubtitleLine[];onAi?:(title:string,payload?:AiPayload)=>void;pane?:'left'|'right';scope:string;accountId?:string;recording:Recording;slides:Record<string,any>[];positionMs:number;course?:Course;loadFiles?:(c:Course,force?:boolean)=>Promise<unknown>;onSeek:(ms:number)=>void}){
  const ordered=useMemo(()=>normalizeSlides(slides),[slides]),active=slideAt(ordered,positionMs);
  const [following,setFollowing]=useRememberedState(`canvas-slide-follow-v1:${scope}:${recording.source}:${recording.id}`,true,value=>value!==false),[manual,setManual]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const capture=useRef(false);
  const index=Math.min(Math.max(0,following?active:manual),Math.max(0,ordered.length-1)),slide=ordered[index];
  async function ask(){
    if(!slide||!onAi||capture.current)return;capture.current=true;setBusy(true);setError('');
    try{
      let image:string|undefined;
      if(slide.image&&NATIVE)image=(await native<{image:string}>('captureSlideImage',{scope,url:slide.image})).image;
      if(slide.image&&!NATIVE){const element=new Image();element.crossOrigin='anonymous';element.referrerPolicy='no-referrer';await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{element.src='';reject(Error('课件图片读取超时，请重试'))},15000);element.onload=()=>{clearTimeout(timer);resolve()};element.onerror=()=>{clearTimeout(timer);reject(Error('课件图片暂时无法读取，请重试'))};element.src=slide.image!});const scale=Math.min(1,1600/Math.max(element.naturalWidth,element.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(element.naturalWidth*scale));canvas.height=Math.max(1,Math.round(element.naturalHeight*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('暂时无法读取课件画面');ctx.drawImage(element,0,0,canvas.width,canvas.height);image=canvas.toDataURL('image/jpeg',.9)}
      const at=following?positionMs:slide.timeMs??positionMs,payload=lecturePayload(recording.title,`${recording.source}:${recording.id}`,recording.courseId,at,lines,image);
      payload.args.recording=recording;payload.args.text=String(payload.args.text||'')+(slide.text?`\n[当前课件切片 ${index+1}] ${slide.text}`:'');payload.args.contextLabel=`课件切片 ${index+1} · ${subtitleTime(at)}`;
      void native('playerControl',{action:'pause',resourceId:`${recording.source}:${recording.id}`}).catch(()=>{});onAi(recording.title+' · 课件提问',payload);
    }catch(e){setError((e instanceof Error?e.message:String(e))+'；可在视频全屏中点“问课件”截图提问。')}finally{capture.current=false;setBusy(false)}
  }
  return <section className="lecture-slides" aria-label="课件跟随"><div className="section-heading"><h2>课件切片</h2><button className="text-button" aria-pressed={following} onClick={()=>{setManual(index);setFollowing(!following)}}>{following?'跟随播放':'恢复跟随'}</button></div>
    {error&&<div className="notice amber" role="alert">{error}</div>}
    {slide?.image&&<ZoomImage key={slide.key} src={slide.image} alt={`课堂切片 ${index+1}`} onAsk={onAi?()=>void ask():undefined} asking={busy}/>}
    {slide&&<><div className="reader-pages"><button aria-label="上一张课件切片" disabled={index===0} onClick={()=>{setFollowing(false);setManual(index-1)}}><ArrowLeft size={17}/></button><span>{index+1} / {ordered.length}</span><button aria-label="下一张课件切片" disabled={index===ordered.length-1} onClick={()=>{setFollowing(false);setManual(index+1)}}><ArrowRight size={17}/></button></div>{active<0&&following&&<p className="paragraph">当前播放位置尚无切片，正在显示第一张预览。</p>}<p className="paragraph">{slide.text||'此切片没有 OCR 文字'}</p>{slide.timeMs!==null&&<button className="text-button" onClick={()=>onSeek(slide.timeMs!)}>跳到 {subtitleTime(slide.timeMs)}</button>}</>}
    {!slide&&<div className="notice">平台未返回可用课件切片</div>}
    {slide&&onAi&&!slide.image&&<button className="button secondary" disabled={busy} onClick={()=>void ask()}>{busy?<LoaderCircle size={16} className="spin"/>:<MessageCircle size={16}/>}问 AI</button>}
  </section>;
}
