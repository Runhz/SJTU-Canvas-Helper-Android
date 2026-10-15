import { useEffect, useRef, useState } from 'react';
import { Check, Gauge } from 'lucide-react';
import { readWaterQuality, saveWaterQuality, waterPresets, WATER_QUALITY_EVENT, WATER_QUALITY_KEY, type WaterQuality } from './waterQuality';
import {createCanvasWater} from './CanvasWater';
import type {WaterHandle} from './waterMotion';
let graphicsAvailable:boolean|null=null;
const supportEvent='canvas-water-renderer';
function reportGraphics(supported:boolean){graphicsAvailable=supported;window.dispatchEvent(new Event(supportEvent));}

export function useWaterQuality() {
  const [quality, setQuality] = useState<WaterQuality>(readWaterQuality);
  useEffect(() => {
    const update = () => setQuality(readWaterQuality());
    const change = (event: Event) => setQuality((event as CustomEvent<WaterQuality>).detail || readWaterQuality());
    const storage = (event: StorageEvent) => { if (event.key === WATER_QUALITY_KEY || event.key === null) update(); };
    window.addEventListener(WATER_QUALITY_EVENT, change); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(WATER_QUALITY_EVENT, change); window.removeEventListener('storage', storage); };
  }, []);
  return { quality, setQuality: saveWaterQuality };
}
export function WaterQualityPicker() {
  const { quality, setQuality } = useWaterQuality();
  const [available,setAvailable]=useState(graphicsAvailable);
  useEffect(()=>{const update=()=>setAvailable(graphicsAvailable);window.addEventListener(supportEvent,update);return()=>window.removeEventListener(supportEvent,update);},[]);
  return <section className="water-quality-setting" aria-labelledby="water-quality-title">
    <div className="water-setting-heading"><Gauge size={19}/><div><h3 id="water-quality-title">水缸效果</h3><p>选择流体精细度与帧率。</p></div></div>
    <div className="water-quality-options" role="group" aria-label="水缸画质">
      {(Object.entries(waterPresets) as [WaterQuality, typeof waterPresets[WaterQuality]][]).map(([id, preset]) => <button key={id} aria-pressed={quality === id} className={quality === id ? 'selected' : ''} onClick={() => setQuality(id)}><span>{preset.label}{quality === id && <Check size={14}/>}</span><small>{preset.detail}</small></button>)}
    </div>
    <small className="water-setting-footnote">{available===false?'当前使用兼容渲染':'立即生效 · 离开页面或切到后台时暂停'}</small>
  </section>;
}
export default function WaterTank({ completed, total }: { completed: number; total: number }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<WaterHandle | null>(null);
  const { quality } = useWaterQuality();
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const value = useRef(ratio); value.current = ratio;
  const [fallback, setFallback] = useState(true);
  useEffect(() => {
    let disposed = false;
    setFallback(true);
    const canvas=(mode:'eco'|'balanced')=>{if(!disposed&&host.current){try{scene.current=createCanvasWater(host.current,mode,value.current);setFallback(false);}catch{setFallback(true);} }};
    const soft=()=>{canvas(quality==='eco'?'eco':'balanced');reportGraphics(false);};
    if (typeof WebGL2RenderingContext === 'undefined') { soft(); return()=>{disposed=true;scene.current?.dispose();scene.current=null;}; }
    import('./WaterScene').then(({ createWaterScene }) => {
      if (disposed || !host.current) return;
      try { scene.current = createWaterScene(host.current, quality, value.current); setFallback(false); reportGraphics(true); } catch { host.current?.querySelectorAll('canvas').forEach(canvas=>canvas.remove());soft(); }
    }).catch(soft);
    return () => { disposed = true; scene.current?.dispose(); scene.current = null; };
  }, [quality]);
  useEffect(() => { scene.current?.setFill(ratio); }, [ratio]);
  return <div className="water-tank" role="img" aria-label={`作业已提交 ${completed} 项，共 ${total} 项`}>
    <div className="water-tank-stage" ref={host} aria-hidden="true" onPointerDown={event => {
      const rect = event.currentTarget.getBoundingClientRect(); scene.current?.impulse((event.clientX - rect.left) / rect.width - .5);
    }}>
      {fallback && <div className="water-tank-fallback"><div style={{ height: `${ratio * 100}%` }}/></div>}
    </div>
    <div className="water-tank-count"><strong>{completed}<span> / {total}</span></strong><small>已提交</small></div>
  </div>;
}
