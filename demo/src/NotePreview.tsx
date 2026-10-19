import {useRef,useState} from 'react';
import {Download,FileCode2,FileText,LoaderCircle} from 'lucide-react';
import type {StudyNote} from './studyLibrary';
import {RichAnswer} from './RichAnswer';
import {Modal} from './Modal';
import * as runtime from './runtime';
import './studyReader.css';
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function noteFilename(title:string,format:'md'|'html'){
  const clean=title.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,'_').trim();
  let base='',bytes=0;for(const char of clean){const length=new TextEncoder().encode(char).length;if(bytes+length>180)break;base+=char;bytes+=length}
  return (base.replace(/[. ]+$/g,'')||'学习笔记')+'.'+format;
}
export function noteHtml(note:StudyNote,rendered:HTMLElement){
  const clone=rendered.cloneNode(true) as HTMLElement;clone.querySelectorAll('.katex-html,annotation').forEach(el=>el.remove());clone.querySelectorAll('button.time-link').forEach(el=>{const span=document.createElement('span');span.textContent=el.textContent;el.replaceWith(span)});
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(note.title)}</title><style>body{max-width:780px;margin:32px auto;padding:0 22px;color:#202738;background:#fff;font:16px/1.85 system-ui,sans-serif;overflow-wrap:anywhere}h1{font-size:26px}h2,h3{line-height:1.5}table{display:block;overflow:auto;border-collapse:collapse}td,th{border:1px solid #dce1ea;padding:8px 12px}pre{overflow:auto;padding:16px;background:#f4f6fa;border-radius:12px}img{max-width:100%;border-radius:12px}.katex-mathml{position:static!important;clip:auto!important;width:auto!important;height:auto!important}math[display=block]{display:block;overflow:auto;margin:18px 0}a{color:#365cce}blockquote{border-left:3px solid #bdc9e8;padding-left:16px;color:#58647a}small{color:#768096}</style><h1>${escape(note.title)}</h1><small>${escape(new Date(note.updatedAt).toLocaleString('zh-CN'))}</small>${clone.innerHTML}${note.image?`<img src="${escape(note.image)}" alt="笔记截图">`:''}</html>`;
}
export async function exportNote(note:StudyNote,format:'md'|'html',element:HTMLElement){
  const text=format==='html'?noteHtml(note,element):`# ${note.title}\n\n${note.body}\n${note.image?`\n![笔记截图](${note.image})\n`:''}`,name=noteFilename(note.title,format),mime=format==='html'?'text/html':'text/markdown';
  if(runtime.NATIVE){await runtime.native('exportFile',{name,mime,text});return}
  const url=URL.createObjectURL(new Blob([text],{type:mime+';charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function NotePreview({note,onClose}:{note:StudyNote;onClose:()=>void}){
  const ref=useRef<HTMLDivElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(format:'md'|'html'){if(!ref.current||busy)return;setBusy(true);setError('');try{await exportNote(note,format,ref.current)}catch{setError('导出未完成，请重试')}finally{setBusy(false)}}
  return <Modal title={note.title} subtitle="笔记 · 只读预览" wide onClose={onClose}><div className="note-preview"><div className="note-export-tools"><span>{new Date(note.updatedAt).toLocaleDateString('zh-CN')}</span><button className="button secondary" disabled={busy} onClick={()=>void save('html')}>{busy?<LoaderCircle size={15} className="spin"/>:<Download size={15}/>}下载阅读版</button><button className="button secondary" disabled={busy} onClick={()=>void save('md')}><FileCode2 size={15}/>Markdown</button></div><div ref={ref}><RichAnswer text={note.body}/></div>{note.image&&<img src={note.image} alt="笔记截图"/>}{error&&<p role="alert" className="notice amber">{error}</p>}<p className="note-export-hint"><FileText size={13}/>阅读版保留正文、表格和公式，可用支持 MathML 的浏览器打开。</p></div></Modal>;
}
