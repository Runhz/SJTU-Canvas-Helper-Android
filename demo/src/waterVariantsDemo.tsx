import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Check,Hand,RotateCcw,Sparkles,Waves} from 'lucide-react';
import './waterVariantsDemo.css';

type Variant='studio'|'ripple'|'prism';
const variants:Record<Variant,{title:string;subtitle:string;detail:string}>={
  studio:{title:'玻璃棚拍',subtitle:'连续水体 + 柔和光影',detail:'水面保持完整连续，波峰撞壁后自然回落，适合首页常驻。'},
  ripple:{title:'涟漪水缸',subtitle:'波纹层次 + 轻微飞溅',detail:'重点表现晃动时的水面起伏与边缘回弹，互动感更明显。'},
  prism:{title:'透光水晶',subtitle:'折射高光 + 深浅渐变',detail:'更强调透明圆缸、底部厚度和高光反射，视觉最精致。'},
};

function drawWater(canvas:HTMLCanvasElement,variant:Variant,time:number,tilt:number,impulse:number){
  const dpr=Math.min(window.devicePixelRatio||1,2),box=canvas.getBoundingClientRect(),size=Math.max(1,Math.floor(Math.min(box.width,box.height)*dpr));
  if(canvas.width!==size||canvas.height!==size){canvas.width=size;canvas.height=size;}
  const ctx=canvas.getContext('2d');if(!ctx)return;const s=size,center=s/2,r=s*.445,phase=time*.0013;
  ctx.clearRect(0,0,s,s);ctx.save();ctx.translate(center,center);
  const glass=ctx.createRadialGradient(-r*.35,-r*.52,r*.1,r*.2,r*.25,r*1.3);glass.addColorStop(0,'rgba(255,255,255,.94)');glass.addColorStop(.54,'rgba(236,249,252,.32)');glass.addColorStop(1,'rgba(130,190,207,.2)');
  ctx.beginPath();ctx.arc(0,0,r*1.02,0,Math.PI*2);ctx.fillStyle=glass;ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();
  const level=r*(.14+tilt*.035),wave=(Math.sin(phase*2.7+tilt*2)*r*.028+impulse*r*.09*Math.sin(phase*8))*Math.min(1,Math.abs(impulse)*1.2+1);
  const waterTop=level+wave;
  const water=ctx.createLinearGradient(0,-r,0,r);water.addColorStop(0,variant==='prism'?'rgba(129,230,238,.86)':'rgba(76,205,218,.82)');water.addColorStop(.38,'rgba(16,161,190,.9)');water.addColorStop(1,variant==='prism'?'rgba(8,74,112,.95)':'rgba(5,107,143,.96)');
  ctx.beginPath();ctx.moveTo(-r,waterTop);for(let x=-r;x<=r;x+=r/20){const y=waterTop+Math.sin(x/r*5+phase*2.4)*r*.018+Math.sin(x/r*10-phase)*r*.009;ctx.lineTo(x,y);}ctx.lineTo(r,r);ctx.lineTo(-r,r);ctx.closePath();ctx.fillStyle=water;ctx.fill();
  const bodyLight=ctx.createLinearGradient(-r*.7,-r*.4,r*.75,r*.65);bodyLight.addColorStop(0,'rgba(255,255,255,.3)');bodyLight.addColorStop(.28,'rgba(132,238,247,.07)');bodyLight.addColorStop(1,'rgba(0,20,60,.1)');ctx.fillStyle=bodyLight;ctx.fillRect(-r,-r,r*2,r*2);
  ctx.beginPath();ctx.moveTo(-r,waterTop);for(let x=-r;x<=r;x+=r/24){const y=waterTop+Math.sin(x/r*5+phase*2.4)*r*.018+Math.sin(x/r*10-phase)*r*.009;ctx.lineTo(x,y);}ctx.strokeStyle='rgba(220,255,255,.88)';ctx.lineWidth=s*.008;ctx.shadowBlur=s*.012;ctx.shadowColor='rgba(255,255,255,.7)';ctx.stroke();ctx.shadowBlur=0;
  if(variant==='ripple'){for(let i=0;i<5;i++){const span=r*(.38+i*.1),y=waterTop+r*(.03+i*.045)+Math.sin(phase*2+i)*r*.012;ctx.beginPath();ctx.ellipse(Math.sin(phase*1.7+i)*r*.15,y,span,r*.025,0,Math.PI,Math.PI*2);ctx.strokeStyle=`rgba(194,250,255,${.22-i*.025})`;ctx.lineWidth=s*.004;ctx.stroke();}for(let i=0;i<4;i++){const x=-r*.7+i*r*.42+Math.sin(phase*3+i)*r*.03;const y=waterTop+r*.03+Math.abs(Math.sin(phase*4+i))*r*.05;ctx.beginPath();ctx.arc(x,y,s*.009+i*s*.002,0,Math.PI*2);ctx.fillStyle='rgba(218,255,255,.72)';ctx.fill();}}
  if(variant==='prism'){const highlight=ctx.createLinearGradient(-r*.9,-r*.2,-r*.45,r*.7);highlight.addColorStop(0,'rgba(255,255,255,.82)');highlight.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=highlight;ctx.beginPath();ctx.ellipse(-r*.58,-r*.1,r*.13,r*.65,-.25,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(r*.62,r*.45,r*.06,r*.22,.35,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.72)';ctx.fill();}
  ctx.restore();
  ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,.76)';ctx.lineWidth=s*.012;ctx.shadowBlur=s*.035;ctx.shadowColor='rgba(74,187,215,.33)';ctx.stroke();ctx.shadowBlur=0;
  ctx.beginPath();ctx.arc(-r*.2,-r*.17,r*.82,Math.PI*1.08,Math.PI*1.55);ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=s*.02;ctx.stroke();ctx.restore();
}

function WaterVariant({variant}:{variant:Variant}){
  const ref=useRef<HTMLCanvasElement>(null);
  const motion=useRef({tilt:0,impulse:0,lastX:0,active:false});
  useEffect(()=>{
    let frame=0,last=performance.now();
    const loop=(now:number)=>{
      const elapsed=Math.min(64,now-last);last=now;
      const state=motion.current;
      state.impulse*=Math.exp(-elapsed/380);
      if(Math.abs(state.impulse)<.001)state.impulse=0;
      if(ref.current)drawWater(ref.current,variant,now,state.tilt,state.impulse);
      frame=requestAnimationFrame(loop);
    };
    frame=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(frame);
  },[variant]);
  function disturb(clientX:number){
    const node=ref.current?.parentElement;if(!node)return;
    const box=node.getBoundingClientRect();
    motion.current.tilt=Math.max(-.5,Math.min(.5,(clientX-box.left)/box.width-.5));
    motion.current.impulse=Math.min(1.4,motion.current.impulse+.72);
    motion.current.lastX=clientX;
  }
  return <div className="water-variant-stage" onPointerDown={e=>{motion.current.active=true;e.currentTarget.setPointerCapture?.(e.pointerId);disturb(e.clientX)}} onPointerMove={e=>{if(motion.current.active)disturb(e.clientX)}} onPointerUp={()=>{motion.current.active=false}} onPointerCancel={()=>{motion.current.active=false}}><canvas ref={ref} aria-label={`${variants[variant].title}水面效果`}/></div>;
}

export default function WaterVariantsDemo(){const [selected,setSelected]=useState<Variant>('studio'),[preview,setPreview]=useState<Variant>('studio');return <main className="water-variants-page"><header><div><p className="eyebrow">CANVAS 随行 · 首页效果选择</p><h1>挑一个你愿意每天看到的水面。</h1><p className="lead">三种方案都使用连续水体渲染，不用颗粒堆积来冒充水。点击水缸可以模拟晃动。</p></div><button className="reset-demo" onClick={()=>setPreview(selected)} aria-label="恢复当前方案"><RotateCcw size={17}/>重置</button></header><section className="water-variant-grid">{(Object.keys(variants) as Variant[]).map(id=><article key={id} className={`water-variant-card ${selected===id?'selected':''}`}><div className="card-top"><div><h2>{variants[id].title}</h2><p>{variants[id].subtitle}</p></div>{selected===id&&<span className="picked"><Check size={14}/>当前选择</span>}</div><WaterVariant key={`${id}-${preview===id?'live':''}`} variant={id}/><p className="variant-detail">{variants[id].detail}</p><button className="pick-variant" onClick={()=>{setSelected(id);setPreview(id)}}>{selected===id?'已选择':'选择此方案'}<Waves size={15}/></button></article>)}</section><footer><span><Hand size={15}/> 拖动或点击水缸测试互动</span><span><Sparkles size={15}/> 选择后我再替换首页主效果</span></footer></main>}

const root=createRoot(document.getElementById('root')!);
root.render(<WaterVariantsDemo/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
