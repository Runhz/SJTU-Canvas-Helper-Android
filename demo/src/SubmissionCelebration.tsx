import {useEffect,useRef} from 'react';
import {Check,Star} from 'lucide-react';
import './submissionCelebration.css';
export function SubmissionCelebration({show,onFinished}:{show:boolean;onFinished?:()=>void}){
  const ref=useRef<HTMLCanvasElement>(null),finish=useRef(onFinished);
  finish.current=onFinished;
  useEffect(()=>{
    if(!show)return;
    // Completion is independent of the graphics context and parent rerenders.
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer=setTimeout(()=>finish.current?.(),reduced?750:2100);
    const canvas=ref.current,ctx=canvas?.getContext('2d');
    let frame=0;
    if(canvas&&ctx&&!reduced){
      const start=performance.now(),colors=['#6284ed','#46bdb7','#dfaa51','#dd7e9c','#9580dd'];
      const draw=(now:number)=>{
        const box=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
        const w=Math.max(1,Math.floor(box.width*dpr)),h=Math.max(1,Math.floor(box.height*dpr));
        if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
        ctx.clearRect(0,0,w,h);ctx.save();ctx.scale(dpr,dpr);
        const t=(now-start)/1000,cw=box.width,ch=box.height,scale=Math.min(cw,ch);
        for(let burst=0;burst<3;burst++){
          const age=t-burst*.19-.08;
          if(age<0||age>1.35)continue;
          const bx=cw*(.5+(burst-1)*.24),by=ch*(burst===1?.32:.4);
          const fade=Math.pow(Math.max(0,1-age/1.35),1.5),spread=scale*.55;
          const glow=ctx.createRadialGradient(bx,by,0,bx,by,scale*.28);
          glow.addColorStop(0,`rgba(122,154,245,${.14*fade})`);glow.addColorStop(1,'rgba(122,154,245,0)');
          ctx.fillStyle=glow;ctx.fillRect(0,0,cw,ch);
          for(let i=0;i<22;i++){
            const a=i*Math.PI*2/22+burst*.27,speed=spread*(.78+(i%5)*.07);
            const position=(s:number)=>({x:bx+Math.cos(a)*speed*(1-Math.exp(-s*2.5))/2.5,y:by+Math.sin(a)*speed*(1-Math.exp(-s*2.5))/2.5+scale*.12*s*s});
            const head=position(age),tail=position(Math.max(0,age-.085));
            ctx.globalAlpha=fade;ctx.strokeStyle=colors[(i+burst)%colors.length];ctx.lineWidth=1.6;ctx.lineCap='round';
            ctx.beginPath();ctx.moveTo(tail.x,tail.y);ctx.lineTo(head.x,head.y);ctx.stroke();
            ctx.globalAlpha=fade*.8;ctx.fillStyle=colors[(i+burst)%colors.length];
            ctx.beginPath();ctx.arc(head.x,head.y,.9,0,Math.PI*2);ctx.fill();
          }
        }
        ctx.restore();
        if(t<2)frame=requestAnimationFrame(draw);
      };
      frame=requestAnimationFrame(draw);
    }
    return()=>{clearTimeout(timer);cancelAnimationFrame(frame);};
  },[show]);
  if(!show)return null;
  return <div className="submission-celebration" role="status" aria-live="polite"><canvas ref={ref} aria-hidden="true"/><div className="submission-celebration-label"><span><Check size={16}/>提交成功</span><small><Star size={12}/>已同步到课程状态</small></div></div>;
}
