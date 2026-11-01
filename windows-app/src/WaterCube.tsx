import {useEffect,useRef,useState} from 'react';
import type {PoolHandle} from './WaterPool';

export function WaterCube({completed,total}:{completed:number;total:number}) {
  const host=useRef<HTMLDivElement>(null),handle=useRef<PoolHandle>(),drag=useRef<{x:number;y:number}>();
  const [error,setError]=useState(false),initial=useRef(total?Math.min(.92,Math.max(.18,completed/total)):.5);
  const fill=total?Math.min(.92,Math.max(.18,completed/total)):.5;
  useEffect(()=>{let disposed=false;void import('./WaterPool').then(({createWaterPool})=>{
    if(disposed||!host.current)return;
    try{handle.current=createWaterPool(host.current,initial.current,()=>setError(true));}catch{setError(true);}
  });return()=>{disposed=true;handle.current?.dispose();handle.current=undefined;};},[]);
  useEffect(()=>handle.current?.setFill(fill),[fill]);
  const disturb=(e:React.PointerEvent,force=.05)=>{const box=host.current!.getBoundingClientRect();handle.current?.disturb((e.clientX-box.left)/box.width,(e.clientY-box.top)/box.height,force);};
  return <div className="water-cube-card"><div className="water-host" ref={host} role="img" aria-label="玻璃水池，点击或按住拖动搅动水面" onPointerDown={e=>{drag.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);disturb(e);}} onPointerMove={e=>{if(!drag.current)return;const distance=Math.hypot(e.clientX-drag.current.x,e.clientY-drag.current.y);drag.current={x:e.clientX,y:e.clientY};if(distance>1)disturb(e,Math.min(.12,distance/200));}} onPointerUp={()=>{drag.current=undefined;}} onPointerCancel={()=>{drag.current=undefined;}}/>
    {error&&<p className="water-fallback">当前显卡环境未启用水面渲染</p>}
    <div className="water-cube-label"><strong>{completed}<span> / {total}</span></strong><small>作业已完成</small></div><button className="water-shake" onClick={()=>handle.current?.impulse(.6)}>晃一下</button>
  </div>;
}
