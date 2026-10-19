import {useEffect,useRef,useState} from 'react';
import {Check,ArrowRight,Sparkles} from 'lucide-react';
import type {Assignment} from './domain';
import {Modal} from './Modal';

export function completionTransition(before:Assignment[]|undefined,after:Assignment[]){
  if(!before?.length||!after.length||before.length!==after.length)return false;
  const previous=new Map(before.map(a=>[a.id,a]));
  return after.every(a=>previous.has(a.id)&&a.submission!=='unsubmitted')&&before.some(a=>a.submission==='unsubmitted');
}
const displayed=new Set<string>();
export function CompletionSummary({scope,assignments}:{scope:string;assignments:Assignment[]}){
  const before=useRef<{scope:string;rows:Assignment[]}>(),[summary,setSummary]=useState<{total:number;courses:number}|null>(null),canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const previous=before.current;before.current={scope,rows:assignments.map(a=>({...a}))};
    if(previous?.scope!==scope||!completionTransition(previous.rows,assignments))return;
    const key=JSON.stringify([scope,assignments.map(a=>[a.id,a.submittedAt||0]).sort()]);
    if(displayed.has(key))return;displayed.add(key);setSummary({total:assignments.length,courses:new Set(assignments.map(a=>a.courseId)).size});
  },[scope,assignments]);
  useEffect(()=>{if(!summary||!canvas.current||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    let active=true,reset:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    // The engine is loaded only at the milestone; no animation runs in the background.
    void import('canvas-confetti').then(({default:confetti})=>{if(!active||!canvas.current)return;const burst=confetti.create(canvas.current,{resize:true,disableForReducedMotion:true});reset=()=>burst.reset();const colors=['#5b7bee','#81c9ce','#d8b66e','#aab5ef'];void burst({particleCount:75,spread:85,startVelocity:29,gravity:.7,ticks:180,origin:{x:.22,y:.65},angle:65,colors});timer=setTimeout(()=>{if(active)void burst({particleCount:75,spread:85,startVelocity:29,gravity:.7,ticks:180,origin:{x:.78,y:.65},angle:115,colors})},220)}).catch(()=>{});
    return()=>{active=false;clearTimeout(timer);reset?.()};
  },[summary]);
  if(!summary)return null;
  return <Modal title="全部作业已完成" className="completion-dialog" onClose={()=>setSummary(null)}><canvas className="completion-confetti" ref={canvas} aria-hidden="true"/><div className="completion-summary"><div className="completion-seal"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44"/><path d="M30 50L44 64L71 36"/></svg><Sparkles size={18}/></div><span className="completion-eyebrow">这一阶段，收工了</span><h2>每一份努力<br/>都有了回应。</h2><p>这组课程的作业已全部提交。<br/>给认真完成的自己，留一点轻松的时间。</p><div className="completion-stats"><span><strong>{summary.total}</strong>份作业已提交</span><span><strong>{summary.courses}</strong>门课程</span></div><button className="button primary" onClick={()=>setSummary(null)}><Check size={16}/>完成，继续学习<ArrowRight size={16}/></button></div></Modal>;
}
