import {useEffect,useRef,useState} from 'react';
import type {WaterHandle} from './waterMotion';
import type {PoolHandle} from './WaterPool';
import {poolDragStrength} from './waterPool/PoolResponse';
const previews=new Map<string,string>();
export default function WaterTank({ completed, total,cacheKey='preview' }: { completed: number; total: number;cacheKey?:string }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<(WaterHandle&Partial<PoolHandle>) | null>(null);
  const pointer = useRef({active:false,x:0,y:0});
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const value = useRef(ratio); value.current = ratio;
  const previewKey=cacheKey+':'+(document.documentElement.dataset.theme||'light');
  const [preview,setPreview]=useState(()=>previews.get(previewKey));
  const [status,setStatus]=useState<'loading'|'ready'|'failed'>('loading');
  useEffect(() => {
    let active=true,raf=0;setStatus('loading');setPreview(previews.get(previewKey));
    const failed=()=>{if(active){scene.current?.dispose();scene.current=null;setPreview(undefined);setStatus('failed')}};
    void import('./WaterPool').then(({createWaterPool})=>{if(active&&host.current){scene.current=createWaterPool(host.current,value.current,failed);const ready=()=>{if(!active||!scene.current)return;if(host.current?.querySelector('canvas')?.dataset.waterFrames){setStatus('ready');setPreview(undefined)}else raf=requestAnimationFrame(ready)};raf=requestAnimationFrame(ready)}}).catch(failed);
    return()=>{active=false;cancelAnimationFrame(raf);const image=(scene.current as Partial<PoolHandle>|null)?.snapshot?.();if(image){if(previews.size>=4)previews.delete(previews.keys().next().value!);previews.set(previewKey,image)}scene.current?.dispose();scene.current=null;};
  }, [cacheKey]);
  useEffect(() => { scene.current?.setFill(ratio); }, [ratio]);
  return <div className="water-tank water-pool" role="img" aria-label={`透明水池：作业已提交 ${completed} 项，共 ${total} 项`}>
    <div className={`water-tank-stage water-${status}`} ref={host} aria-hidden="true" onPointerDown={event => {
      const rect = event.currentTarget.getBoundingClientRect(); pointer.current={active:true,x:event.clientX,y:event.clientY}; event.currentTarget.setPointerCapture?.(event.pointerId);if(rect.width&&rect.height)scene.current?.disturb?.((event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height,.045);
    }} onPointerMove={event => {
      if(!pointer.current.active)return;const delta=Math.hypot(event.clientX-pointer.current.x,event.clientY-pointer.current.y);pointer.current.x=event.clientX;pointer.current.y=event.clientY;const rect=event.currentTarget.getBoundingClientRect();if(delta>.5&&rect.width&&rect.height)scene.current?.disturb?.((event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height,poolDragStrength(delta,rect.width));
    }} onPointerUp={()=>{pointer.current.active=false}} onPointerCancel={()=>{pointer.current.active=false}}>
      {status==='loading'&&preview&&<img className="water-last-frame" src={preview} alt=""/>}
      {status==='failed' && <div className="water-tank-fallback"><div style={{ height: `${ratio * 100}%` }}/></div>}
    </div>
    <div className="water-tank-count"><strong>{completed}<span> / {total}</span></strong><small>已提交</small></div>
  </div>;
}
