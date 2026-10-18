import {useState} from 'react';
import {Modal} from './Modal';
import {ChoicePicker} from './ChoicePicker';
import * as runtime from './runtime';
import {subtitleTime,type SubtitleLine} from './study';
import {parseTime,rangedSource} from './studyAttachments';
export function SubtitleExportDialog({title,lines,positionMs,onClose}:{title:string;lines:SubtitleLine[];positionMs:number;onClose:()=>void}){
  const [start,setStart]=useState(subtitleTime(lines[0]?.bg||0)),[end,setEnd]=useState(subtitleTime((lines[lines.length-1]?.ed||lines[lines.length-1]?.bg||0)+3000)),[format,setFormat]=useState<'txt'|'srt'>('txt'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(){try{const from=parseTime(start),to=parseTime(end);if(from===null||to===null)throw Error('时间格式为 时:分:秒 或 分:秒');const source=rangedSource({key:'export',kind:'subtitle',name:title+'.txt',courseId:'',resourceId:'',mime:'text/plain',lines},from,to,format);setBusy(true);await runtime.native('exportFile',{name:source.name,mime:source.mime,text:source.text});onClose();}catch(e){setError(String(e).replace(/^Error: /,''));}finally{setBusy(false);}}
  return <Modal title="导出字幕片段" subtitle={title} onClose={onClose}><div className="subtitle-range"><button className="button secondary" onClick={()=>{setStart(subtitleTime(Math.max(0,positionMs-120000)));setEnd(subtitleTime(positionMs+120000));}}>当前位置前后 2 分钟</button><label>开始时间<input aria-label="导出开始时间" value={start} onChange={e=>setStart(e.target.value)}/></label><label>结束时间<input aria-label="导出结束时间" value={end} onChange={e=>setEnd(e.target.value)}/></label><ChoicePicker label="导出格式" value={format} onChange={value=>setFormat(value as 'txt'|'srt')} options={[{value:'txt',label:'文字稿 TXT'},{value:'srt',label:'字幕 SRT'}]}/>{error&&<p role="alert" className="notice amber">{error}</p>}<button className="button primary full" disabled={busy} onClick={()=>void save()}>{busy?'正在导出…':'选择保存位置'}</button></div></Modal>;
}
