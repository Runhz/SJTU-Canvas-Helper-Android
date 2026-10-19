import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Check, ListChecks, LocateFixed, MessageCircle, X } from 'lucide-react';
import { subtitleTime, type SubtitleLine } from './study';
import {ChoicePicker} from './ChoicePicker';
export function selectedLectureText(lines:SubtitleLine[],indices:number[],title:string,resourceId:string) {
  return `课堂：${title}\n`+[...new Set(indices)].filter(i=>Number.isInteger(i)&&!!lines[i]).sort((a,b)=>a-b).map(i=>{const line=lines[i];return `[字幕] [${subtitleTime(line.bg)}—${subtitleTime(line.ed)}](#video=${encodeURIComponent(resourceId)}&t=${Math.floor(line.bg/1000)}) ${line.res}`;}).join('\n');
}
const SubtitleRows=memo(function SubtitleRows({lines,query,current,selecting,selected,onSeek,onSelected}:{lines:SubtitleLine[];query:string;current:number;selecting:boolean;selected:number[];onSeek:(ms:number)=>void;onSelected:(values:number[])=>void}){
  return <>{lines.map((line,i)=>line.res.toLocaleLowerCase().includes(query.toLocaleLowerCase())&&<div key={`${i}:${line.bg}`} className={`subtitle-row ${i===current?'current':''} ${selecting&&selected.includes(i)?'is-selected':''}`} data-active={i===current}>{selecting&&<button className="subtitle-check" aria-label={`选择字幕 ${i+1}`} aria-pressed={selected.includes(i)} onClick={()=>onSelected(selected.includes(i)?selected.filter(n=>n!==i):[...selected,i].sort((a,b)=>a-b))}>{selected.includes(i)&&<Check size={15}/>}</button>}<button className="subtitle-line" aria-label={selecting?`选取第 ${i+1} 段字幕`:`跳到 ${subtitleTime(line.bg)} ${line.res}`} onClick={()=>selecting?onSelected(selected.includes(i)?selected.filter(n=>n!==i):[...selected,i].sort((a,b)=>a-b)):onSeek(line.bg)}><span className="subtitle-timing"><time>{subtitleTime(line.bg)}</time><small>— {subtitleTime(line.ed)}</small></span><p>{line.res}</p></button></div>)}</>;
});
export function LectureSubtitles({lines,query,positionMs,onSeek,selected,onSelected,scope,onScope,onAsk}:{lines:SubtitleLine[];query:string;positionMs:number;onSeek:(ms:number)=>void;selected:number[];onSelected:(values:number[])=>void;scope:'all'|'selected'|'none';onScope:(scope:'all'|'selected'|'none')=>void;onAsk?:()=>void}) {
  const [follow,setFollow]=useState(true),[selecting,setSelecting]=useState(false);
  const region=useRef<HTMLDivElement>(null);
  const callbacks=useRef({onSeek,onSelected});callbacks.current={onSeek,onSelected};
  const seek=useCallback((ms:number)=>callbacks.current.onSeek(ms),[]),select=useCallback((values:number[])=>callbacks.current.onSelected(values),[]);
  let current=-1;for(let i=0;i<lines.length;i++){if(lines[i].bg<=positionMs)current=i;else break;}
  useEffect(()=>{if(!follow||query||selecting||current<0)return;const box=region.current,active=box?.querySelector<HTMLElement>('[data-active="true"]');if(box&&active){const top=active.getBoundingClientRect().top-box.getBoundingClientRect().top+box.scrollTop;box.scrollTo({top:Math.max(0,top-box.clientHeight*.35),behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}},[current,follow,query,selecting]);
  return <section className="lecture-subtitles" aria-label="课堂字幕列表"><ChoicePicker label="提问资料" value={scope} onChange={value=>onScope(value as typeof scope)} options={[{value:'all',label:'当前字幕＋整堂背景'},{value:'selected',label:'仅所选字幕'},{value:'none',label:'不附字幕'}]}/><div className="subtitle-tools"><button className="text-button" onClick={()=>setFollow(!follow)} aria-pressed={follow}><LocateFixed size={14}/>{follow?'跟随播放':'恢复跟随'}</button><button className="text-button" onClick={()=>{setSelecting(!selecting);if(!selecting)onScope('selected');}} aria-pressed={selecting}><ListChecks size={15}/>{selecting?'完成选择':'选择字幕'}</button></div>
    {(selecting||selected.length>0||scope==='selected')&&<div className="subtitle-selection-bar"><span>已选 <strong>{selected.length}</strong> 段</span><button className="text-button" disabled={!selected.length} aria-label="清除所选字幕" onClick={()=>onSelected([])}><X size={14}/></button>{onAsk&&<button className="button primary" disabled={!selected.length} onClick={onAsk}><MessageCircle size={15}/>用所选字幕提问</button>}</div>}
    <div className="subtitle-scroll" ref={region} onTouchStart={()=>setFollow(false)} onWheel={()=>setFollow(false)}>
      <SubtitleRows lines={lines} query={query} current={current} selecting={selecting} selected={selected} onSeek={seek} onSelected={select}/>
    </div><small className="subtitle-context-note">{scope==='selected'?`提问仅使用所选 ${selected.length} 段字幕`:scope==='none'?'不附字幕，截图可单独发送':'优先当前位置字幕，整堂字幕作背景；截图提问同时附上画面'}</small>
  </section>;
}
