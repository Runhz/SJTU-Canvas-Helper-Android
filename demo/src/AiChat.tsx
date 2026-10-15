import {useEffect,useRef,useState} from 'react';
import {ArrowUp,Square,Sparkles,RefreshCw,LoaderCircle,Settings2,History,Plus,ArrowLeft,Trash2,Search} from 'lucide-react';
import * as runtime from './runtime';
import {RichAnswer} from './RichAnswer';
import {ChoicePicker} from './ChoicePicker';
import {Modal} from './Modal';
import {deleteConversation,listConversations,newConversation,saveConversation,savedPayload,sourceKey,type AiPayload,type Conversation} from './chatHistory';
import './chatHistory.css';

export function AiChat({context,payload,modelName,onTime,onConfigure,storageScope,open=true,onClose}:{context:string;payload:AiPayload;modelName?:string;onTime:(href:string,payload?:AiPayload)=>void;onConfigure:()=>void;storageScope?:string;open?:boolean;onClose?:()=>void}){
  const [conversation,setConversation]=useState(()=>newConversation(storageScope||'preview',context,payload));
  const current=useRef(conversation);current.current=conversation;
  const [phase,setPhase]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(!!storageScope);
  const [showHistory,setShowHistory]=useState(payload.args.history===true),[records,setRecords]=useState<Conversation[]>([]),[storageError,setStorageError]=useState(''),[confirmDelete,setConfirmDelete]=useState('');
  const [historyQuery,setHistoryQuery]=useState('');
  const active=useRef(''),mounted=useRef(true),received=useRef(''),flush=useRef<ReturnType<typeof setTimeout>>(),saveTimer=useRef<ReturnType<typeof setTimeout>>(),lastQuestion=useRef(''),messages=useRef<HTMLDivElement>(null),stick=useRef(true),initialized=useRef(false),loadGeneration=useRef(0);
  const demoStopped=useRef(false),pendingMessages=useRef<runtime.ChatMessage[]>([]);
  function persist(immediate=false){
    if(!storageScope)return;
    const save=()=>{saveTimer.current=undefined;const row=current.current;if(!row.messages.length&&!row.draft)return;void saveConversation(row).then(()=>{if(mounted.current)setStorageError('');}).catch(()=>{if(mounted.current)setStorageError('对话暂未保存，请检查设备存储空间。');});};
    if(immediate){clearTimeout(saveTimer.current);save();}else if(!saveTimer.current)saveTimer.current=setTimeout(save,500);
  }
  function update(change:(row:Conversation)=>Conversation,immediate=false){const row=change(current.current);current.current={...row,updatedAt:Date.now()};setConversation(current.current);persist(immediate);}
  function keepPartial(){
    if(active.current&&received.current)update(row=>({...row,messages:[...pendingMessages.current,{role:'assistant',content:received.current}],interrupted:true}),true);
    else persist(true);
  }
  function stopForSwitch(){keepPartial();demoStopped.current=true;if(active.current&&runtime.NATIVE)void runtime.cancelAi(active.current).catch(()=>{});active.current='';clearTimeout(flush.current);flush.current=undefined;setBusy(false);setError('');}
  const queue=(chunk:string,id:string)=>{if(active.current!==id||!mounted.current)return;received.current+=chunk;if(!flush.current)flush.current=setTimeout(()=>{flush.current=undefined;if(active.current===id)update(row=>({...row,messages:[...pendingMessages.current,{role:'assistant',content:received.current}],interrupted:true}));},35);};
  async function ask(question=current.current.draft){
    if(!question.trim()||active.current||(!initialized.current&&storageScope))return;
    const id=`chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;active.current=id;demoStopped.current=false;lastQuestion.current=question;received.current='';stick.current=true;
    const row=current.current;
    const previous=row.messages[row.messages.length-1]?.role==='user'&&row.messages[row.messages.length-1].content===question?row.messages.slice(0,-1):row.messages;
    const next=[...previous,{role:'user' as const,content:question}];pendingMessages.current=next;
    update(value=>({...value,messages:next,draft:'',interrupted:true}),true);setError('');setBusy(true);setPhase('正在准备资料…');
    try{
      const answer=runtime.NATIVE?await runtime.ai(row.payload.mode,{...row.payload.args,readMode:row.readMode},question,s=>queue(s,id),previous,{requestId:id,onPhase:s=>{if(active.current===id&&mounted.current)setPhase(s);}}):await demoStream(s=>queue(s,id),()=>!demoStopped.current&&active.current===id);
      if(active.current===id&&mounted.current){update(value=>({...value,messages:[...next,{role:'assistant',content:answer}],interrupted:false}),true);setPhase('回答完成');}
    }catch(e){if(active.current===id&&mounted.current){update(value=>({...value,messages:received.current?[...next,{role:'assistant',content:received.current}]:next,interrupted:true}),true);setError(String(e));}}
    finally{if(active.current===id){active.current='';clearTimeout(flush.current);flush.current=undefined;if(mounted.current)setBusy(false);}}
  }
  async function history(){keepPartial();setShowHistory(true);try{setRecords(await listConversations(storageScope||'preview'));}catch{setStorageError('无法读取历史对话，请稍后重试。');}}
  function select(row:Conversation){if(row.id===current.current.id){setShowHistory(false);return;}stopForSwitch();current.current=row;setConversation(row);setShowHistory(false);setConfirmDelete('');stick.current=true;lastQuestion.current=[...row.messages].reverse().find(m=>m.role==='user')?.content||'';}
  useEffect(()=>{
    const generation=++loadGeneration.current;
    const initial=payload.args.initialQuestion;
    const load=async()=>{
      if(initialized.current&&current.current.source===sourceKey(payload)){
        if(payload.args.history===true){await history();return;}
        update(row=>({...row,payload:savedPayload(payload),title:context}));
      }else{
        stopForSwitch();setLoading(!!storageScope);
        try{
          const rows=storageScope?await listConversations(storageScope):[];
          if(generation!==loadGeneration.current)return;
          const row=rows.find(item=>item.source===sourceKey(payload))||newConversation(storageScope||'preview',context,payload);
          if(payload.args.history!==true)row.payload=savedPayload(payload);
          current.current=row;setConversation(row);setRecords(rows);setShowHistory(payload.args.history===true);setLoading(false);initialized.current=true;
          lastQuestion.current=[...row.messages].reverse().find(m=>m.role==='user')?.content||'';
        }catch{if(generation===loadGeneration.current){initialized.current=true;setLoading(false);setStorageError('无法读取历史对话，本次对话仍可使用。');}}
      }
      if(typeof initial==='string'&&initial&&generation===loadGeneration.current){setTimeout(()=>{if(generation===loadGeneration.current)void ask(initial);},0);}
    };
    void load();return()=>{loadGeneration.current++;};
  },[payload,context,storageScope]);
  useEffect(()=>{mounted.current=true;const save=()=>keepPartial();window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',save);return()=>{keepPartial();mounted.current=false;loadGeneration.current++;clearTimeout(flush.current);clearTimeout(saveTimer.current);demoStopped.current=true;if(active.current&&runtime.NATIVE)void runtime.cancelAi(active.current).catch(()=>{});active.current='';window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',save);};},[]);
  useEffect(()=>{if(!open)keepPartial();},[open]);
  useEffect(()=>{if(open&&stick.current&&messages.current)messages.current.scrollTop=messages.current.scrollHeight;},[conversation.messages,phase,open,showHistory]);
  if(!open)return null;
  const visibleRecords=records.filter(row=>(payload.args.history!==true||payload.mode!=='materials'||row.source===sourceKey(payload))&&`${row.title}\n${row.draft}\n${row.messages.map(m=>m.content).join('\n')}`.toLocaleLowerCase().includes(historyQuery.toLocaleLowerCase().trim()));
  const body=<div className="ai-chat">
    <div className="ai-context-bar"><span><Sparkles size={15}/>{modelName||'学习助手'}</span><button className="text-button" onClick={onConfigure}><Settings2 size={14}/>模型设置</button></div>
    <div className="chat-history-tools"><button className="text-button" onClick={()=>showHistory?setShowHistory(false):void history()}>{showHistory?<ArrowLeft size={15}/>:<History size={15}/>} {showHistory?'返回对话':'历史对话'}</button><button className="text-button" disabled={loading||busy} onClick={()=>select(newConversation(storageScope||'preview',current.current.title,current.current.payload))}><Plus size={15}/>新对话</button></div>
    {storageError&&<div className="notice amber" role="alert">{storageError}<button className="text-button" onClick={()=>persist(true)}>重试保存</button></div>}
    {showHistory?<div className="chat-history-list" aria-label="历史对话">
      <label className="search-field"><Search size={16}/><input aria-label="搜索历史对话" placeholder="搜索课堂或问题" value={historyQuery} onChange={e=>setHistoryQuery(e.target.value)}/></label>
      {visibleRecords.map(row=><div className="chat-history-item" key={row.id}><button className="chat-history-open" onClick={()=>select(row)}><strong>{row.title}</strong><span>{row.messages.find(m=>m.role==='user')?.content||row.draft||'未发送草稿'}</span><small>{new Date(row.updatedAt).toLocaleString('zh-CN')} · {row.messages.filter(m=>m.role==='user').length} 个问题</small></button><button className="icon-button" aria-label={confirmDelete===row.id?'确认删除对话':`删除对话 ${row.title}`} onClick={async()=>{if(confirmDelete!==row.id){setConfirmDelete(row.id);return;}try{if(row.id===current.current.id){stopForSwitch();const next=newConversation(storageScope||'preview',row.title,row.payload);current.current=next;setConversation(next);}await deleteConversation(storageScope||'preview',row.id);setRecords(await listConversations(storageScope||'preview'));setConfirmDelete('');}catch{setStorageError('删除失败，请稍后重试。');}}}>{confirmDelete===row.id?'确认':<Trash2 size={16}/>}</button></div>)}
      {!visibleRecords.length&&<div className="empty"><History size={26}/><h3>{historyQuery?'没有匹配的对话':'暂无对话记录'}</h3><p>提问和草稿会自动保存在本机。</p></div>}
    </div>:<>
      {loading&&<div className="notice"><LoaderCircle size={15} className="spin"/>正在恢复对话…</div>}
      {conversation.payload.mode==='file'&&<ChoicePicker label="读取方式" disabled={busy} value={conversation.readMode} onChange={readMode=>update(row=>({...row,readMode}))} options={[{value:'relevant',label:'问答'},{value:'full',label:'全文总结'}]}/>}
      {typeof conversation.payload.args.screenshot==='string'&&<div className="question-screenshot"><img alt="当前课堂截图" src={conversation.payload.args.screenshot}/><small>{String(conversation.payload.args.positionLabel||'课堂画面')}</small></div>}
      <div className="ai-messages" ref={messages} onScroll={()=>{const el=messages.current;if(el)stick.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}} aria-label="对话记录">
        {!conversation.messages.length&&!loading&&<div className="ai-welcome"><span><Sparkles size={25}/></span><h3>有哪里没弄懂？</h3><p>{conversation.title}</p><div className="suggestions">{(conversation.payload.mode==='materials'?['总结本堂课的重点','解释本堂课最重要的公式']:['帮我总结这份资料','解释这份资料中的主要公式']).map(q=><button key={q} onClick={()=>void ask(q)}>{q}</button>)}</div></div>}
        {conversation.messages.map((m,i)=><div className={`chat-message ${m.role}`} key={i}><small>{m.role==='user'?'我':'学习助手'}</small>{m.role==='assistant'?<RichAnswer text={m.content} onTime={href=>onTime(href,conversation.payload)}/>:<p style={{whiteSpace:'pre-wrap'}}>{m.content}</p>}</div>)}
        {busy&&<div className="chat-message assistant streaming-message"><small><LoaderCircle size={12} className="spin"/>{phase}</small></div>}
        {!busy&&conversation.interrupted&&!!conversation.messages.length&&!error&&<p className="ai-footnote">上次回答已中断，已保留收到的内容。</p>}
        {error&&<div className="notice amber" role="alert"><p>{error}</p><button className="text-button" disabled={busy} onClick={()=>void ask(lastQuestion.current)}><RefreshCw size={13}/>重试</button></div>}
      </div>
      <form className="ai-compose" onSubmit={e=>{e.preventDefault();void ask();}}><textarea aria-label="向学习助手提问" placeholder="继续提问，或描述没听懂的地方…" disabled={loading} value={conversation.draft} onChange={e=>update(row=>({...row,draft:e.target.value}))} rows={2}/>{busy?<button type="button" aria-label="停止生成" onClick={()=>{if(runtime.NATIVE)void runtime.cancelAi(active.current).catch(e=>setError(String(e)));else demoStopped.current=true;}}><Square size={16}/></button>:<button aria-label="发送问题" disabled={loading||!conversation.draft.trim()}><ArrowUp size={18}/></button>}</form>
      <p className="ai-footnote">{storageScope?'对话自动保存在本机 · ':''}请核对资料中的关键结论。</p>
    </>}
  </div>;
  return onClose?<Modal title="Canvas 学习助手" subtitle={conversation.title} wide onClose={()=>{keepPartial();onClose();}}>{body}</Modal>:body;
}
async function demoStream(onText:(s:string)=>void,active:()=>boolean){const text='这是**演示回答**，未读取真实文件或调用模型。\n\n以勾股定理为例：\n\n$$a^2+b^2=c^2$$\n\n公式会直接排版，回答按收到的数据分段显示。';for(const part of text.match(/.{1,12}|\n/g)||[]){await new Promise(r=>setTimeout(r,35));if(!active())throw new Error('已停止生成');onText(part)}return text;}
