import {useEffect,useState} from 'react';
import {Moon,Sun,Monitor} from 'lucide-react';
import {NATIVE,native} from './runtime';
export type ThemeMode='light'|'dark'|'system';
export function useTheme(){
  const [mode,setMode]=useState<ThemeMode>(()=>{try{const s=localStorage.getItem('canvas-appearance');return s==='dark'||s==='light'?s:'system';}catch{return 'system'}});
  useEffect(()=>{const media=window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply=()=>{const dark=mode==='dark'||mode==='system'&&media?.matches===true;document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#111113':'#f9f9fb');if(NATIVE)void native('setAppearance',{dark}).catch(()=>{});};
    apply();try{localStorage.setItem('canvas-appearance',mode);}catch{}
    if(media?.addEventListener)media.addEventListener('change',apply);else media?.addListener?.(apply);
    return()=>{if(media?.removeEventListener)media.removeEventListener('change',apply);else media?.removeListener?.(apply);};
  },[mode]);return {mode,setMode};
}
export function ThemePicker({mode,onChange}:{mode:ThemeMode;onChange:(m:ThemeMode)=>void}){return <div className="appearance-picker" aria-label="外观模式">{([{id:'light',label:'日间',Icon:Sun},{id:'dark',label:'夜间',Icon:Moon},{id:'system',label:'跟随系统',Icon:Monitor}] as const).map(({id,label,Icon})=><button key={id} className={mode===id?'selected':''} aria-pressed={mode===id} onClick={()=>onChange(id)}><Icon size={16}/>{label}</button>)}</div>;}
