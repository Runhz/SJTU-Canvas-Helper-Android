import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowLeftRight, Check, Droplets, Moon, RotateCcw, Sun, Waves } from 'lucide-react';
import { createWaterScene, type WaterSceneHandle } from './WaterScene';
import { waterPresets, type WaterQuality } from './waterQuality';
import './waterDemo.css';

type Motion = { angle:number; target:number; shake:number; elapsed:number; duration:number };
function WaterDemo(){
  const host=useRef<HTMLDivElement>(null),scene=useRef<WaterSceneHandle|null>(null);
  const driver=useRef<Motion>({angle:0,target:0,shake:0,elapsed:0,duration:0});
  const fillRef=useRef(.4);
  const [fill,setFill]=useState(40),[quality,setQuality]=useState<WaterQuality>('high');
  const [dark,setDark]=useState(true),[status,setStatus]=useState('静置'),[error,setError]=useState('');
  const [generation,reset]=useState(0);
  const active=useRef(false);
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';},[dark]);
  useEffect(()=>{
    if(!host.current)return;
    setError('');
    try{
      scene.current=createWaterScene(host.current,quality,fillRef.current,{input:dt=>{
        const m=driver.current;
        const delta=Math.atan2(Math.sin(m.target-m.angle),Math.cos(m.target-m.angle));
        m.angle+=delta*(1-Math.exp(-dt*10));
        let ax=0,ay=0;
        if(m.elapsed<m.duration){
          m.elapsed+=dt;
          const envelope=Math.sin(Math.PI*Math.min(1,m.elapsed/m.duration));
          ax=Math.sin(m.elapsed*22)*m.shake*envelope;
          ay=Math.cos(m.elapsed*17)*m.shake*.32*envelope;
        }else if(active.current){active.current=false;setStatus(m.target===0?'回落中':'倒置');}
        return {x:Math.sin(m.angle)*9.81,y:Math.cos(m.angle)*9.81,z:0,ax,ay};
      }});
    }catch{
      host.current.querySelectorAll('canvas').forEach(canvas=>canvas.remove());
      setError('当前浏览器无法显示玻璃效果，请使用支持 WebGL 2 的浏览器。');
    }
    return()=>{scene.current?.dispose();scene.current=null;};
  },[quality,generation]);
  const updateFill=(value:number)=>{setFill(value);fillRef.current=value/100;scene.current?.setFill(value/100);};
  const shake=(strong:boolean)=>{
    Object.assign(driver.current,{shake:strong?34:14,elapsed:0,duration:strong?1.8:1.2});
    active.current=true;setStatus(strong?'用力摇晃':'轻晃');
  };
  const flip=()=>{const m=driver.current;m.target=m.target===0?Math.PI:0;setStatus(m.target===0?'回正':'倒置');};
  const restart=()=>{driver.current={angle:0,target:0,shake:0,elapsed:0,duration:0};active.current=false;setStatus('静置');reset(v=>v+1);};
  return <main className="liquid-demo">
    <header className="demo-header"><a href="/" className="demo-brand"><Droplets size={21}/><span>Canvas 随行<span className="brand-divider">/</span><strong>液体演示</strong></span></a><button className="theme-toggle" onClick={()=>setDark(v=>!v)} aria-label={dark?'切换日间':'切换夜间'}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button></header>
    <div className="demo-layout">
      <section className="liquid-preview" aria-label="液体效果预览">
        <div className="preview-caption"><span><i/>实时流体</span><span>{waterPresets[quality].label}</span></div>
        <div className="preview-vessel" ref={host} role="img" aria-label={`透明圆缸，水量 ${fill}%`} onPointerDown={event=>{
          const r=event.currentTarget.getBoundingClientRect();scene.current?.impulse((event.clientX-r.left)/r.width-.5);setStatus('涌动中');
        }}/>
        {error?<p className="demo-error" role="alert">{error}</p>:<p className="vessel-hint">点击水缸，或用按钮模拟摇晃</p>}
        <div className="preview-footer"><span>{status}</span><strong>{fill}<small>% 水量</small></strong></div>
      </section>
      <section className="demo-controls" aria-label="液体演示控制">
        <div className="controls-intro"><span className="eyebrow">INTERACTIVE PREVIEW</span><h1>试着晃一晃。</h1><p>观察浪头、撞壁与水滴回落。</p></div>
        <div className="motion-controls"><button onClick={()=>shake(false)}><Waves size={20}/><span>轻晃</span></button><button className="primary" onClick={()=>shake(true)}><ArrowLeftRight size={20}/><span>用力摇晃</span></button><button onClick={flip}><ArrowDown size={20}/><span>倒置 / 回正</span></button><button onClick={restart}><RotateCcw size={19}/><span>重置</span></button></div>
        <div className="control-setting"><div className="setting-label"><label htmlFor="water-fill">水量</label><output htmlFor="water-fill">{fill}%</output></div><input id="water-fill" type="range" min="0" max="100" value={fill} onChange={event=>updateFill(Number(event.target.value))}/><div className="range-ends"><span>空缸</span><span>满缸</span></div></div>
        <fieldset className="quality-setting"><legend>画质</legend><div className="demo-quality-options">{(Object.entries(waterPresets) as [WaterQuality,typeof waterPresets[WaterQuality]][]).map(([id,preset])=><button key={id} aria-pressed={quality===id} onClick={()=>setQuality(id)}><span>{preset.label}{quality===id&&<Check size={13}/>}</span><small>{preset.fps} 帧</small></button>)}</div></fieldset>
        <p className="demo-note">与应用使用同一套液体效果。此页用按钮模拟摇晃和重力方向。</p>
        <details className="demo-credits"><summary>开源许可</summary><p>FLIP 求解器：mobile-fluid-sim / Ten Minute Physics。</p><a href="/licenses/mobile-fluid-sim.txt">mobile-fluid-sim · MIT</a><a href="/licenses/ten-minute-physics.txt">Ten Minute Physics · MIT</a></details>
      </section>
    </div>
  </main>;
}
const root=createRoot(document.getElementById('root')!);
root.render(<WaterDemo/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
