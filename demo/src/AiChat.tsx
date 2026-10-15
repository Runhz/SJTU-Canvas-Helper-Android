import {useEffect,useRef,useState} from 'react';
import {ArrowUp,Square,Sparkles,RefreshCw,LoaderCircle,Settings2} from 'lucide-react';
import * as runtime from './runtime';
import {RichAnswer} from './RichAnswer';
import {ChoicePicker} from './ChoicePicker';
export function AiChat({context,payload,modelName,onTime,onConfigure}:{context:string;payload:{mode:string;args:Record<string,unknown>};modelName?:string;onTime:(href:string)=>void;onConfigure:()=>void}){
  const [history,setHistory]=useState<runtime.ChatMessage[]>([]),[text,setText]=useState(''),[liveText,setLiveText]=useState(''),[phase,setPhase]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[readMode,setReadMode]=useState('relevant');
  const active=useRef(''),mounted=useRef(true),buffer=useRef(''),received=useRef(''),flush=useRef<ReturnType<typeof setTimeout>>(),lastQuestion=useRef(''),messages=useRef<HTMLDivElement>(null),stick=useRef(true);
  const demoStopped=useRef(false);
  const queue=(chunk:string,id:string)=>{if(active.current!==id||!mounted.current)return;received.current+=chunk;buffer.current+=chunk;if(!flush.current)flush.current=setTimeout(()=>{if(active.current===id){setLiveText(received.current);buffer.current='';}flush.current=undefined;},35);};
  async function ask(question=text){
    if(!question.trim()||active.current)return;
    const id=`chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;active.current=id;demoStopped.current=false;lastQuestion.current=question;received.current='';buffer.current='';stick.current=true;
    const previous=history[history.length-1]?.role==='user'?history.slice(0,-1):history;
    const next=[...previous,{role:'user' as const,content:question}];setHistory(next);setText('');setLiveText('');setError('');setBusy(true);setPhase('正在准备资料…');
    try{
      const answer=runtime.NATIVE?await runtime.ai(payload.mode,{...payload.args,readMode},question,s=>queue(s,id),previous,{requestId:id,onPhase:s=>{if(active.current===id&&mounted.current)setPhase(s);}}):await demoStream(s=>queue(s,id),()=>!demoStopped.current&&active.current===id);
      if(active.current===id&&mounted.current){setHistory([...next,{role:'assistant',content:answer}]);setLiveText('');setPhase('回答完成');}
    }catch(e){if(active.current===id&&mounted.current){if(received.current)setHistory([...next,{role:'assistant',content:received.current}]);setLiveText('');setError(String(e));}}
    finally{if(active.current===id){active.current='';clearTimeout(flush.current);flush.current=undefined;if(mounted.current)setBusy(false);}}
  }
  useEffect(()=>{mounted.current=true;const initial=payload.args.initialQuestion;const timer=typeof initial==='string'&&initial?setTimeout(()=>void ask(initial),0):undefined;return()=>{mounted.current=false;clearTimeout(timer);clearTimeout(flush.current);if(active.current&&runtime.NATIVE)void runtime.cancelAi(active.current).catch(()=>{});active.current='';};},[]);
  useEffect(()=>{if(stick.current&&messages.current)messages.current.scrollTop=messages.current.scrollHeight;},[history,liveText,phase]);
  return <div className="ai-chat">
    <div className="ai-context-bar"><span><Sparkles size={15}/>{modelName||'学习助手'}</span><button className="text-button" onClick={onConfigure}><Settings2 size={14}/>模型设置</button></div>
    {payload.mode==='file'&&<ChoicePicker label="读取方式" disabled={busy} value={readMode} onChange={setReadMode} options={[{value:'relevant',label:'问答'},{value:'full',label:'全文总结'}]}/>}
    {typeof payload.args.screenshot==='string'&&<div className="question-screenshot"><img alt="当前课堂截图" src={payload.args.screenshot}/><small>{String(payload.args.positionLabel||'课堂画面')}</small></div>}
    <div className="ai-messages" ref={messages} onScroll={()=>{const el=messages.current;if(el)stick.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}} aria-label="对话记录">
      {!history.length&&<div className="ai-welcome"><span><Sparkles size={25}/></span><h3>有哪里没弄懂？</h3><p>{context}</p><div className="suggestions">{(payload.mode==='materials'?['总结本堂课的重点','解释本堂课最重要的公式']:['帮我总结这份资料','解释这份资料中的主要公式']).map(q=><button key={q} onClick={()=>void ask(q)}>{q}</button>)}</div></div>}
      {history.map((m,i)=><div className={`chat-message ${m.role}`} key={i}><small>{m.role==='user'?'我':'学习助手'}</small>{m.role==='assistant'?<RichAnswer text={m.content} onTime={onTime}/>:<p style={{whiteSpace:'pre-wrap'}}>{m.content}</p>}</div>)}
      {busy&&<div className="chat-message assistant streaming-message"><small><LoaderCircle size={12} className="spin"/>{phase}</small>{liveText&&<RichAnswer text={liveText} onTime={onTime}/>}</div>}
      {error&&<div className="notice amber" role="alert"><p>{error}</p><button className="text-button" disabled={busy} onClick={()=>void ask(lastQuestion.current)}><RefreshCw size={13}/>重试</button></div>}
    </div>
    <form className="ai-compose" onSubmit={e=>{e.preventDefault();void ask();}}><textarea aria-label="向学习助手提问" placeholder="继续提问，或描述没听懂的地方…" value={text} onChange={e=>setText(e.target.value)} rows={2}/>{busy?<button type="button" aria-label="停止生成" onClick={()=>{if(runtime.NATIVE)void runtime.cancelAi(active.current).catch(e=>setError(String(e)));else demoStopped.current=true;}}><Square size={16}/></button>:<button aria-label="发送问题" disabled={!text.trim()}><ArrowUp size={18}/></button>}</form>
    <p className="ai-footnote">请核对资料中的关键结论。</p>
  </div>;
}
async function demoStream(onText:(s:string)=>void,active:()=>boolean){const text='这是**演示回答**，未读取真实文件或调用模型。\n\n以勾股定理为例：\n\n$$a^2+b^2=c^2$$\n\n公式会直接排版，回答按收到的数据分段显示。';for(const part of text.match(/.{1,12}|\n/g)||[]){await new Promise(r=>setTimeout(r,35));if(!active())throw new Error('已停止生成');onText(part)}return text;}
