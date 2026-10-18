import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Bookmark,Check,MessageCircle,Pin,X} from 'lucide-react';
import {listConversations,saveConversation,type Conversation,type AiPayload} from './chatHistory';
import {sourceJob,chatJob,subscribeChat,patchChat} from './chatSession';
import {subtitleTime} from './study';
import {RichAnswer} from './RichAnswer';
export function LectureQuestions({scope,resourceId,positionMs,onAsk,onSeek}:{scope:string;resourceId:string;positionMs:number;onAsk:(payload:AiPayload)=>void;onSeek:(ms:number)=>void}){
  const [row,setRow]=useState<Conversation>(),revision=useRef('');
  useEffect(()=>{let active=true;const source=`materials:${resourceId}`;
    const refresh=()=>{const job=sourceJob(scope,source);if(job){const key=job.row.id+':'+job.busy+':'+job.row.pinned+':'+(job.row.turns||[]).map(t=>t.id+t.status).join('|');if(key!==revision.current){revision.current=key;if(active)setRow(job.row)}}};
    void listConversations(scope).then(rows=>{if(active)setRow(sourceJob(scope,source)?.row||rows.find(r=>r.source===source))}).catch(()=>{});refresh();const unsubscribe=subscribeChat(refresh);return()=>{active=false;unsubscribe()};
  },[scope,resourceId]);
  if(!row)return null;const turns=row.turns||[],last=turns[turns.length-1];
  const open=(turn=last)=>onAsk({mode:row.payload.mode,args:{...(turn?.payload||row.payload).args,conversationId:row.id,...(turn?{turnId:turn.id}:{})}});
  return <>
    {last&&<div className="study-continuity"><MessageCircle size={19}/><div><strong>{sourceJob(scope,row.source)?.busy?'AI 正在回答':last.status==='later'?'还有一个问题待回看':'接着上次的问题'}</strong><p>{row.messages[last.messageIndex]?.content?.split('\n')[0]||'课堂提问'} · {String(last.payload.args.positionLabel||subtitleTime(Number(last.payload.args.positionMs)||0))}</p></div><button className="continue-question" onClick={()=>open()}>继续问<ArrowUpRight size={15}/></button></div>}
    {row.pinned&&<details className="study-pinned" open><summary><Pin size={12}/> 固定解释 <button className="text-button" aria-label="取消固定解释" onClick={e=>{e.preventDefault();const next={...(chatJob(row.id)?.row||row),pinned:''};patchChat(next);void saveConversation(next);setRow(next)}}><X size={13}/></button></summary><RichAnswer text={row.pinned}/></details>}
    {!!turns.length&&<><div className="lecture-question-dots" aria-label="提问时间轴">{turns.filter(t=>Number.isFinite(t.payload.args.positionMs)).map(t=><button key={t.id} className={t.status} title={row.messages[t.messageIndex]?.content} onClick={()=>onSeek(Number(t.payload.args.positionMs))}>{t.status==='understood'?<Check size={11}/>:t.status==='later'?<Bookmark size={11}/>:<MessageCircle size={11}/>} {String(t.payload.args.positionLabel||subtitleTime(Number(t.payload.args.positionMs)))}</button>)}</div><details className="lecture-question-tray"><summary>本堂问题 · {turns.length}{turns.some(t=>t.status==='later')?` · ${turns.filter(t=>t.status==='later').length} 个待回看`:''}</summary>{turns.map(t=><div key={t.id} className="question-trail-item"><button onClick={()=>open(t)}>{row.messages[t.messageIndex]?.content?.split('\n')[0]}<small>{String(t.payload.args.positionLabel||'课堂')} · {t.status==='understood'?'已理解':t.status==='later'?'稍后再看':'待理解'}</small></button><button className="text-button" onClick={()=>onSeek(Number(t.payload.args.positionMs)||positionMs)}>回看</button></div>)}</details></>}
  </>;
}
