import {ArrowLeft} from 'lucide-react';
import type {ReactNode} from 'react';
export function BackButton({children,onClick,disabled=false}:{children:ReactNode;onClick:()=>void;disabled?:boolean}){
  return <button className="back-link back-button" disabled={disabled} onClick={onClick}><ArrowLeft size={18}/><span>{children}</span></button>;
}
