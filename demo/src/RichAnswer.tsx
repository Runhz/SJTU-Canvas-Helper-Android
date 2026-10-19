import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
export function normalizeMath(value:string){
  return value.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part,i)=>i%2?part:part.replace(/\\\[([\s\S]*?)\\\]/g,(_,m)=>`\n$$\n${m}\n$$\n`).replace(/\\\(([\s\S]*?)\\\)/g,(_,m)=>`$${m}$`).replace(/(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g,(_,m)=>`\n\n$$\n${m.trim()}\n$$\n\n`)).join('');
}
export function RichAnswer({text,onTime}:{text:string;onTime?:(href:string)=>void}){
  return <div className="rich-answer"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false,trust:false,strict:'ignore',maxExpand:1000,maxSize:12}]]} components={{
    a:({href,children})=>href?.startsWith('#video=')?(onTime?<button className="time-link" onClick={()=>onTime(href)}>{children}</button>:<span className="time-citation">{children}</span>):<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    img:({alt})=><span className="subtle">{alt||'图片引用'}</span>
  }}>{normalizeMath(text)}</ReactMarkdown></div>;
}
