import {useEffect,useRef} from 'react';
import {CalendarDays,SlidersHorizontal} from 'lucide-react';
import type {Course} from './domain';
import {termOptions} from './study';
import {ChoicePicker} from './ChoicePicker';
export function TermFilter({courses,value,onChange}:{courses:Course[];value:string;onChange:(s:string)=>void}){
  return <div className="term-filter"><CalendarDays size={16}/><span>学期</span><ChoicePicker label="学期筛选" value={value} onChange={onChange} options={[{value:'current',label:'本学期'},...termOptions(courses).map(([value,label])=>({value,label})),{value:'all',label:'所有学期'}]}/></div>;
}
export function useLongPress(onLong:()=>void){
  const timer=useRef<ReturnType<typeof setTimeout>>(),fired=useRef(false),start=useRef({x:0,y:0});
  const cancel=()=>clearTimeout(timer.current);
  useEffect(()=>cancel,[]);
  return {
    onPointerDown:(e:React.PointerEvent)=>{if(e.button!==0)return;fired.current=false;start.current={x:e.clientX,y:e.clientY};timer.current=setTimeout(()=>{fired.current=true;onLong();},550);},
    onPointerMove:(e:React.PointerEvent)=>{if(Math.abs(e.clientX-start.current.x)+Math.abs(e.clientY-start.current.y)>12)cancel();},
    onPointerUp:cancel,onPointerCancel:cancel,onPointerLeave:cancel,
    onContextMenu:(e:React.MouseEvent)=>{e.preventDefault();cancel();fired.current=true;onLong();},
    onClickCapture:(e:React.MouseEvent)=>{if(fired.current){e.preventDefault();e.stopPropagation();fired.current=false;}}
  };
}
export function ItemShell({label,onActions,children,className}:{label:string;onActions:()=>void;children:React.ReactNode;className?:string}){
  const press=useLongPress(onActions);
  return <div className={`item-shell ${className||''}`} {...press}>{children}<button className="item-menu" aria-label={`${label}的操作`} onClick={e=>{e.stopPropagation();onActions();}}><SlidersHorizontal size={15}/><span>管理</span></button></div>;
}
