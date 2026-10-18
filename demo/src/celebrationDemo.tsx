import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Check,PartyPopper,RefreshCcw,Sparkles,Star} from 'lucide-react';
import './celebrationDemo.css';

type Celebration='confetti'|'halo'|'fireworks';
const choices:Record<Celebration,{title:string;subtitle:string;detail:string}>= {
  confetti:{title:'轻快彩带',subtitle:'低干扰、反馈明确',detail:'适合提交成功后短暂出现，不遮挡结果信息。'},
  halo:{title:'光环星点',subtitle:'克制、清爽、有完成感',detail:'用一圈柔和光环和星点表达完成，和浅色界面最协调。'},
  fireworks:{title:'小型烟花',subtitle:'更有仪式感',detail:'中心绽放几束细小烟花，适合重要作业或阶段目标完成。'},
};

function draw(canvas:HTMLCanvasElement,type:Celebration,start:number,now:number){
  const dpr=Math.min(2,window.devicePixelRatio||1),box=canvas.getBoundingClientRect(),w=Math.max(1,Math.floor(box.width*dpr)),h=Math.max(1,Math.floor(box.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');if(!ctx)return;const t=Math.min(1,(now-start)/1500),ease=1-Math.pow(1-t,3);
  ctx.clearRect(0,0,w,h);ctx.save();ctx.scale(dpr,dpr);const cw=box.width,ch=box.height,cx=cw/2,cy=ch*.48;
  const colors=['#6d8ff5','#7bd7d0','#f2bf70','#ef8aa5','#8e7cf2'];
  if(type==='halo'){
    const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.min(cw,ch)*.32);glow.addColorStop(0,'rgba(255,255,255,.9)');glow.addColorStop(.45,`rgba(126,157,255,${.3*(1-t)})`);glow.addColorStop(1,'rgba(126,157,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,cw,ch);
    for(let i=0;i<18;i++){const a=i*Math.PI*2/18,rad=Math.min(cw,ch)*(.12+.18*ease),x=cx+Math.cos(a)*rad,y=cy+Math.sin(a)*rad;ctx.beginPath();ctx.fillStyle=colors[i%colors.length];ctx.globalAlpha=1-t;ctx.arc(x,y,2.5+2*ease,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;ctx.strokeStyle=`rgba(92,125,226,${.75*(1-t)})`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,Math.min(cw,ch)*(.16+.16*ease),0,Math.PI*2);ctx.stroke();
  } else if(type==='fireworks'){
    for(let burst=0;burst<3;burst++){const bx=cx+(burst-1)*cw*.18,by=cy+(burst%2)*ch*.08;for(let i=0;i<14;i++){const a=i*Math.PI*2/14,rad=Math.min(cw,ch)*(.16*ease),x=bx+Math.cos(a)*rad,y=by+Math.sin(a)*rad;ctx.strokeStyle=colors[(i+burst)%colors.length];ctx.globalAlpha=1-t;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(bx+Math.cos(a)*rad*.35,by+Math.sin(a)*rad*.35);ctx.lineTo(x,y);ctx.stroke();}}
    ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.font='600 20px system-ui';ctx.textAlign='center';ctx.fillText('已完成',cx,cy+ch*.25);
  } else {
    for(let i=0;i<34;i++){const p=i/34,a=i*2.399,v=ch*(.08+.24*ease)+(i%5)*3,x=cx+Math.cos(a)*cw*(.12+.4*ease),y=cy+Math.sin(a)*ch*(.12+.45*ease)+v*t;ctx.save();ctx.translate(x,y);ctx.rotate(a+t*3);ctx.globalAlpha=1-t;ctx.fillStyle=colors[i%colors.length];ctx.roundRect(-4,-2,8,4,2);ctx.fill();ctx.restore();}
    ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.font='600 20px system-ui';ctx.textAlign='center';ctx.fillText('提交完成',cx,cy+ch*.05);
  }
  ctx.restore();
}

function CelebrationStage({type}:{type:Celebration}){const ref=useRef<HTMLCanvasElement>(null),[playing,setPlaying]=useState(true),start=useRef(performance.now());useEffect(()=>{start.current=performance.now();setPlaying(true);let f=0;const loop=(n:number)=>{draw(ref.current!,type,start.current,n);if(n-start.current<1600)f=requestAnimationFrame(loop);else setPlaying(false)};f=requestAnimationFrame(loop);return()=>cancelAnimationFrame(f)},[type]);return <div className="celebration-stage"><canvas ref={ref}/>{!playing&&<button className="replay" onClick={()=>{start.current=performance.now();setPlaying(true);let f=0;const loop=(n:number)=>{draw(ref.current!,type,start.current,n);if(n-start.current<1600)f=requestAnimationFrame(loop);else setPlaying(false)};f=requestAnimationFrame(loop)}}><RefreshCcw size={15}/>再次播放</button>}</div>}

export default function CelebrationDemo(){const [selected,setSelected]=useState<Celebration>('halo');return <main className="celebration-page"><header><div><p className="eyebrow">CANVAS 随行 · 提交反馈</p><h1>选一个作业完成时的庆祝方式。</h1><p className="lead">动画只出现很短时间，完成状态和按钮始终清晰可见。点击“重新播放”可以反复比较。</p></div><span className="demo-badge"><Check size={14}/>仅 Demo</span></header><section className="celebration-grid">{(Object.keys(choices) as Celebration[]).map(id=><article key={id} className={`celebration-card ${selected===id?'selected':''}`}><div className="choice-head"><div><h2>{choices[id].title}</h2><p>{choices[id].subtitle}</p></div>{selected===id&&<span className="picked"><Check size={14}/>当前选择</span>}</div><CelebrationStage type={id}/><p className="choice-detail">{choices[id].detail}</p><button className="choose-button" onClick={()=>setSelected(id)}>{selected===id?'已选择':'选择此方案'}<Sparkles size={15}/></button></article>)}</section><footer><span><PartyPopper size={15}/>提交成功后播放一次</span><span><Star size={15}/>不影响后续操作</span></footer></main>}

const root=createRoot(document.getElementById('root')!);
root.render(<CelebrationDemo/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
