import {ChevronDown,Sparkles} from 'lucide-react';
export function ReasoningPreview({text,active=false,elapsedMs}:{text:string;active?:boolean;elapsedMs?:number}){
 if(!text.trim())return null;
 const preview=text.trim().split('\n').filter(line=>line.trim()).slice(-1)[0].replace(/\s+/g,' ').slice(-140);
 return <details className={`reasoning-card ${active?'is-thinking':''}`} aria-label="模型思考"><summary><span className="reasoning-heading"><Sparkles size={14}/><strong>{active?'正在思考':'思考过程'}</strong>{elapsedMs!==undefined&&<small>{Math.max(1,Math.round(elapsedMs/1000))} 秒</small>}<ChevronDown size={14}/></span><span className="reasoning-glimpse">{preview}</span></summary><div className="reasoning-content">{text}</div></details>;
}
