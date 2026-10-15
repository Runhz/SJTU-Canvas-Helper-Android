import { useEffect, useRef, useState } from 'react';
import {InlinePlayer} from './InlinePlayer';
import {LectureSubtitles,selectedLectureText} from './LectureSubtitles';
import {RichAnswer} from './RichAnswer';
import {TermFilter} from './StudyControls';
import {ChoicePicker} from './ChoicePicker';
import {subtitleExport,subtitleTime} from './study';
import { RefreshCw, MessageCircle, ArrowDownToLine, CalendarDays, CheckCircle2, ChevronRight, ExternalLink, FileText, LoaderCircle, LogIn, Play, Plus, Search, Share2, ShieldCheck, Sparkles, UploadCloud, Video, X } from 'lucide-react';
import * as runtime from './runtime';
import { formatDate, countdown, statusOf, type Assignment, type DownloadTask, type Course } from './domain';
import type { useLiveCanvas } from './useLiveCanvas';
import {QrLogin} from './QrLogin';
import {ModelCapabilityHint} from './ModelCapabilityHint';
import {accountScope,defaultLecture,decodeLecture,useRememberedState,type LectureMemory} from './pageMemory';
type Live=ReturnType<typeof useLiveCanvas>;
export function NativeSyllabus({course}:{course:Course}){
  const [body,setBody]=useState('正在读取课程大纲…');
  useEffect(()=>{let active=true;runtime.api<{syllabus_body:string}>('syllabus',{courseId:Number(course.id)}).then(c=>{if(active){const doc=new DOMParser().parseFromString(c.syllabus_body||'','text/html');setBody(doc.body.textContent||'本课程未提供文字大纲。');}}).catch(()=>{if(active)setBody('课程大纲加载失败，请检查网络后重试。');});return()=>{active=false};},[course.id]);
  return <article className="syllabus"><h2>课程大纲</h2><p style={{whiteSpace:'pre-wrap'}}>{body}</p></article>;
}
export function AccountPanel({live,onDone,notify}:{live:Live;onDone:()=>void;notify:(s:string)=>void}){
  const [form,setForm]=useState(live.account||runtime.blankAccount());
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [qr,setQr]=useState(false);
  const [diagnosis,setDiagnosis]=useState('');
  const connected=Boolean(live.account&&live.account.accountId===form.accountId.trim());
  const services=connected?live.account?.services:undefined;
  async function save(){setBusy(true);setError('');try{const normalized={...form,token:runtime.normalizeCanvasToken(form.token)};await live.connect(normalized);setForm(normalized);notify('Token 已验证，正在同步课程');}catch(e){setError(String(e));}finally{setBusy(false);}}
  async function login(){setBusy(true);setError('');try{const result=await live.login();setForm(result.account);notify(result.cloud?'jAccount 与云盘验证成功':'jAccount 已验证，部分服务尚未接通');}catch(e){setError(String(e));}finally{setBusy(false);}}
  if(qr&&connected)return <><button className="back-link" onClick={()=>setQr(false)}>返回双认证设置</button><QrLogin acceptCookie={cookie=>live.acceptCookie(cookie)} openOfficial={url=>live.login(url)} notify={notify} onDone={()=>setQr(false)}/></>;
  return <div className="native-form">
    <div className="notice"><ShieldCheck size={18}/><p>仅连接交大本部 oc.sjtu.edu.cn。Token 和登录凭据使用 Android Keystore 加密保存。</p></div>
    <div className="auth-step"><span>1</span><div><strong>Canvas Token 认证</strong><small>{connected?'已连接 · 课程、作业与资料接口':'用于读取课程、作业与资料'}</small></div>{connected&&<CheckCircle2 size={19}/>}</div>
    {live.saved.accounts.length>0&&<label>已有账号<ChoicePicker label="切换已有账号" value={form.accountId} onChange={id=>{const found=live.saved.accounts.find(a=>a.accountId===id);if(found)setForm(found);}} options={[...live.saved.accounts.map(a=>({value:a.accountId,label:a.accountId})),...(!live.saved.accounts.some(a=>a.accountId===form.accountId)?[{value:form.accountId,label:form.accountId}]:[])]}/></label>}
    <label>账号名称<input aria-label="账号名称" value={form.accountId} onChange={e=>setForm({...form,accountId:e.target.value})} autoComplete="off"/></label>
    <label>Canvas Token<input aria-label="Canvas Token" type="password" value={form.token} onChange={e=>setForm({...form,token:e.target.value})} autoComplete="off" placeholder="在本部 Canvas 设置中创建访问令牌"/></label>
    {error&&<div role="alert" className="notice amber">{error}</div>}
    <button className="button primary full" disabled={busy||!form.accountId.trim()||!form.token.trim()} onClick={save}>{busy?<LoaderCircle size={16} className="spin"/>:<CheckCircle2 size={16}/>}验证并连接本部账号</button>
    <button className="text-button" disabled={busy} onClick={async()=>{setBusy(true);setDiagnosis('正在检查本机 HTTPS 连接…');try{const result=await runtime.native<{message:string}>('diagnoseCanvas');setDiagnosis(result.message);}catch{setDiagnosis('网络自检未完成，请重试');}finally{setBusy(false);}}}>网络自检（不发送 Token）</button>
    {diagnosis&&<div className="notice" role="status">{diagnosis}</div>}
    {live.progress&&<p className="form-caption" role="status">Token 认证与课程同步分别进行：已检查 {live.progress.done} / {live.progress.total||'…'} 门课程。可继续完成第二步。</p>}
    <div className="auth-step"><span>2</span><div><strong>jAccount 额外认证</strong><small>Windows 同款扫码认证，或本机官方网页登录</small></div>{services?.jaccount&&<CheckCircle2 size={19}/>}</div>
    <div className="auth-service-list">{[{name:'jAccount',ok:services?.jaccount},{name:'Canvas 网页会话',ok:services?.canvas},{name:'旧录播平台会话',ok:services?.legacy},{name:'交大云盘',ok:services?.cloud}].map(s=><div key={s.name}><span>{s.name}</span><strong className={s.ok?'success':'subtle'}>{s.ok?'已验证':'待验证'}</strong></div>)}</div>
    <div className="button-row"><button className="button primary" onClick={()=>setQr(true)} disabled={busy||!connected}>扫码认证</button><button className="button secondary" onClick={login} disabled={busy||!connected}><LogIn size={15}/>官方网页登录</button></div>
    <p className="form-caption">两项认证独立保存；额外认证失败不会清除已验证的 Token。扫码支持在同一手机保存图片后，用微信从相册识别。</p>
    <div className="button-row"><button className="button secondary" onClick={()=>setForm({...runtime.blankAccount(),accountId:''})} disabled={busy}><Plus size={15}/>新增账号</button><button className="button secondary" onClick={onDone} disabled={busy}>返回学习总览</button></div>
  </div>;
}
export function ModelPanel({live,notify,onDone}:{live:Live;notify:(s:string)=>void;onDone:()=>void}){
  const [form,setForm]=useState(live.account||runtime.blankAccount()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[models,setModels]=useState<string[]>([]),[testText,setTestText]=useState(''),[status,setStatus]=useState('');
  const [loadingModels,setLoadingModels]=useState(false);
  const alive=useRef(true),listVersion=useRef(0);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;listVersion.current++;}},[]);
  if(!live.account)return <div className="notice">请先连接 Canvas 账号，再配置该账号使用的模型服务。</div>;
  async function loadModels(){const version=++listVersion.current;setLoadingModels(true);setError('');try{const ids=await runtime.modelList(form.modelUrl,form.modelKey);if(alive.current&&version===listVersion.current){setModels(ids);setStatus('已获取 '+ids.length+' 个模型');}}catch(e){if(alive.current&&version===listVersion.current)setError(String(e));}finally{if(alive.current&&version===listVersion.current)setLoadingModels(false);}}
  async function test(){setBusy(true);setError('');setTestText('');try{const answer=await runtime.testModel(form,s=>{if(alive.current)setTestText(t=>t+s);},s=>{if(alive.current)setStatus(s);});if(alive.current){setTestText(answer);setStatus('流式连接已验证');}}catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}}
  return <div className="native-form"><p className="paragraph">兼容 Chat Completions 的模型服务。列表直接向你填写的服务获取；不支持列出模型的服务仍可手动输入。</p>
    <label>服务地址<input aria-label="模型服务地址" disabled={busy} value={form.modelUrl} onChange={e=>{listVersion.current++;setLoadingModels(false);setModels([]);setForm({...form,modelUrl:e.target.value});}} placeholder="https://…/v1" inputMode="url"/></label>
    <label>API Key<input aria-label="模型 API Key" disabled={busy} type="password" autoComplete="off" value={form.modelKey} onChange={e=>{listVersion.current++;setLoadingModels(false);setModels([]);setForm({...form,modelKey:e.target.value});}}/></label>
    <div className="model-discovery"><button className="button secondary" disabled={loadingModels||busy||!form.modelKey.trim()||!form.modelUrl.startsWith('https://')} onClick={()=>void loadModels()}>{loadingModels?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}获取模型列表</button><button className="button secondary" disabled={busy||!form.modelKey.trim()||!form.modelName.trim()} onClick={()=>void test()}>{busy?<LoaderCircle size={15} className="spin"/>:<Sparkles size={15}/>}测试流式连接</button></div>
    {!!models.length&&<ChoicePicker label="选择模型" value={form.modelName} onChange={modelName=>setForm({...form,modelName})} options={models.map(value=>({value,label:value}))}/>}
    <label>模型名称<input aria-label="模型名称" disabled={busy} value={form.modelName} onChange={e=>setForm({...form,modelName:e.target.value})}/></label>
    <ModelCapabilityHint config={form}/>
    {status&&<p role="status" className="model-hint">{status}</p>}{testText&&<div className="model-test-result"><RichAnswer text={testText}/></div>}
    {error&&<div role="alert" className="notice amber">{error}</div>}
    <button className="button primary full" disabled={busy||!form.modelKey.trim()||!form.modelName.trim()||!form.modelUrl.startsWith('https://')} onClick={async()=>{setBusy(true);setError('');try{await live.model(form);notify('模型配置已加密保存');onDone();}catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}}}>{busy?<LoaderCircle size={16} className="spin"/>:<ShieldCheck size={16}/>}保存模型配置</button>
  </div>;
}

export function NativeDownloadList({tasks,notify}:{tasks:DownloadTask[];notify:(s:string)=>void}){
  const labels={running:'下载中',queued:'等待开始',waiting:'等待网络',completed:'已完成',failed:'失败',cancelled:'已取消'};
  const action=(method:string,task:DownloadTask)=>runtime.native(method,{id:task.id,path:task.path,mime:mime(task.name)}).catch(e=>notify(String(e)));
  return <>{tasks.map(task=><div className="download-card" key={task.id}><div className="download-card-main"><span className="download-file"><FileText size={22}/></span><div><strong>{task.name}</strong><span>{labels[task.status]}</span></div><span className={`pill ${task.status==='completed'?'green':'gray'}`}>{task.status==='running'?`${task.progress}%`:labels[task.status]}</span></div>
    {['running','waiting','queued'].includes(task.status)&&<div className="download-progress"><i style={{width:`${task.progress}%`}}/></div>}
    <div className="download-footer"><span>{task.status==='completed'?'文件已保存到本机':task.status==='failed'?`系统下载未完成（${task.reason||'未知原因'}），请返回资料页刷新后重试`:'系统负责后台传输'}</span>
    {task.status==='completed'?<div className="native-download-actions"><button onClick={()=>void action('openFile',task)}><ExternalLink size={14}/>打开</button><button onClick={()=>void action('shareFile',task)} aria-label={`分享 ${task.name}`}><Share2 size={14}/></button><button onClick={()=>void action('exportFile',task)} aria-label={`导出 ${task.name}`}><ArrowDownToLine size={14}/></button></div>:!['failed','cancelled'].includes(task.status)&&<button onClick={()=>void action('cancelDownload',task)}>取消</button>}</div>
  </div>)}</>;
}
function mime(name:string){const ext=name.split('.').pop()?.toLowerCase();return ({pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',zip:'application/zip',mp4:'video/mp4',png:'image/png',jpg:'image/jpeg',txt:'text/plain',srt:'application/x-subrip'} as Record<string,string>)[ext||'']||'application/octet-stream';}

export function NativeAssignmentPanel({assignment,live,notify,onDone,onBusy}:{assignment:Assignment;live:Live;notify:(s:string)=>void;onDone:()=>void;onBusy:(v:boolean)=>void}){
  const [files,setFiles]=useState<runtime.ImportedFile[]>([]),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState(''),[error,setError]=useState('');
  useEffect(()=>{onBusy(busy);},[busy]);
  const completed=assignment.submission==='submitted'||assignment.submission==='late';
  async function pick(){try{const result=await runtime.pickAttachments();setFiles(old=>[...old,...result]);setConfirm(false);}catch(e){setError(String(e));}}
  async function send(){setBusy(true);setError('');try{const response=await runtime.submitAssignment(assignment,files);if(response.status==='submitted'&&response.receipt){const receipt=response.receipt;live.markSubmission(assignment.id,receipt);setResult('服务器已确认提交');notify('作业已提交，已取消后续截止提醒');await live.refresh(true);}else{setResult(response.message||'结果待确认，请先回查，不会自动重复提交');}}catch(e){setError(String(e));}finally{setBusy(false);}}
  async function recheck(){setBusy(true);try{const receipt=await runtime.api<Record<string,any>>('submission',{courseId:Number(assignment.courseId),assignmentId:Number(assignment.id.split(':')[1])});live.markSubmission(assignment.id,receipt);setResult(receipt.submitted_at?'服务器已确认提交':'服务器尚未记录提交，请核对上方状态');}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <>
    <div className="assignment-detail-heading"><span className={`pill ${statusOf(assignment,Date.now()).tone}`}>{statusOf(assignment,Date.now()).text}</span><h2>{assignment.title}</h2><div><CalendarDays size={14}/>{formatDate(assignment.dueAt)}{assignment.dueAt<1e15?' 截止':''}</div>{!completed&&<p className="warning">{countdown(assignment.dueAt,Date.now())}</p>}</div>
    <div className="detail-section"><h3>作业要求</h3><p style={{whiteSpace:'pre-wrap'}}>{assignment.description}</p></div>
    {completed?<div className="detail-section"><h3>已提交附件</h3>{assignment.attachments?.length?assignment.attachments.map((name,i)=><div key={i} className="attachment-row"><FileText size={17}/><span>{name}</span><CheckCircle2 size={17}/></div>):<p>服务器已记录提交，未返回附件列表。</p>}<div className="notice">提交时间：{assignment.submittedAt?formatDate(assignment.submittedAt):'服务器未提供'}</div></div>:<>
      {assignment.uploadAllowed&&!assignment.locked&&assignment.submission!=='unknown'?<div className="detail-section"><h3>上传附件</h3>{assignment.allowedExtensions?.length?<p>允许格式：{assignment.allowedExtensions.join('、')}</p>:null}<button className="upload-zone" onClick={pick} disabled={busy}><UploadCloud size={28}/><strong>从手机选择文件</strong><span>上传与提交期间，请保持应用在前台。</span></button>{files.map((f,i)=><div className="attachment-row" key={f.path}><FileText size={17}/><span>{f.name}<small>{Math.ceil(f.size/1024)} KB</small></span><button aria-label={`移除 ${f.name}`} disabled={busy} onClick={()=>{setFiles(old=>old.filter((_,index)=>index!==i));setConfirm(false);}}><X size={16}/></button></div>)}</div>:<div className="notice amber">{assignment.submission==='unknown'?'尚未取得你的提交状态，请刷新后再提交。':'本作业已锁定或不支持文件上传，请在课程平台核对提交方式。'}</div>}
      {confirm&&<div className="notice amber">确认将 {files.length} 个附件提交至当前课程的「{assignment.title}」。这是一次真实提交。</div>}
      {files.length>0&&!result&&<button className="button primary full" disabled={busy} onClick={()=>confirm?void send():setConfirm(true)}>{busy?<LoaderCircle size={16} className="spin"/>:<UploadCloud size={16}/>} {confirm?'确认提交到 Canvas':'检查并提交'}</button>}
    </>}
    {error&&<div role="alert" className="notice amber">{error}</div>}
    {result&&<div className="notice"><ShieldCheck size={18}/><p>{result}</p></div>}
    <div className="button-row"><button className="button secondary" disabled={busy} onClick={recheck}>回查服务器状态</button><button className="button secondary" disabled={busy} onClick={onDone}>返回总览</button></div>
  </>;
}

export function NativeRecordings({live,courses,allCourses,term,setTerm,notify,onAi,obscured}:{live:Live;courses:Course[];allCourses:Course[];term:string;setTerm:(s:string)=>void;notify:(s:string)=>void;onAi:(context:string,payload?:{mode:string;args:Record<string,unknown>})=>void;obscured:boolean}){
  const [memory,setMemory]=useRememberedState(`canvas-lecture-v1:${accountScope(live.account)}`,defaultLecture,decodeLecture);
  function field<K extends keyof LectureMemory>(key:K):[LectureMemory[K],React.Dispatch<React.SetStateAction<LectureMemory[K]>>]{return [memory[key],next=>setMemory(old=>{const value=typeof next==='function'?(next as (value:LectureMemory[K])=>LectureMemory[K])(old[key]):next;return value===old[key]?old:{...old,[key]:value};})];}
  const [courseId,setCourseId]=field('courseId'),[selected,setSelected]=field('selected'),[subQuery,setSubQuery]=field('subQuery'),[section,setSection]=field('section');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [materials,setMaterials]=useState<Awaited<ReturnType<typeof runtime.materialText>>|null>(null);
  const [positionMs,setPositionMs]=field('positionMs'),[selectedLines,setSelectedLines]=field('selectedLines'),[subtitleScope,setSubtitleScope]=field('subtitleScope');
  const request=useRef(0),restore=useRef(true);
  useEffect(()=>{if(!allCourses.length)return;if(courseId&&!courses.some(c=>c.id===courseId)){request.current++;setCourseId('');setSelected(null);setMaterials(null);setBusy(false);return;}if(restore.current&&courseId){restore.current=false;if(selected){const ticket=++request.current;setMaterials(live.peekMaterials(selected));setBusy(true);void live.loadMaterials(selected).then(value=>{if(request.current===ticket)setMaterials(value);}).catch(e=>{if(request.current===ticket)setError(String(e));}).finally(()=>{if(request.current===ticket)setBusy(false);});}else{void load(courseId);}}},[term,courses.map(c=>c.id).join(',')]);
  useEffect(()=>()=>{request.current++;},[]);
  async function load(id:string,force=false){restore.current=false;const ticket=++request.current;setCourseId(id);setSelected(null);setMaterials(null);const course=courses.find(c=>c.id===id);if(!course)return;setBusy(true);setError('');try{await live.videos(course,force);}catch(e){if(request.current===ticket)setError(String(e));}finally{if(request.current===ticket)setBusy(false);}}
  async function choose(recording:runtime.Recording,force=false){
    restore.current=false;
    const ticket=++request.current,cached=live.peekMaterials(recording);setSelected(decodeLecture({courseId:recording.courseId,selected:recording}).selected);setMaterials(cached);
    if(!force){setSelectedLines([]);setSubtitleScope('all');setPositionMs(0);setSubQuery('');setMemory(old=>({...old,hasPlayed:false}));}
    setError('');setBusy(true);
    try{const result=await live.loadMaterials(recording,force);if(request.current===ticket){
      if(cached)setSelectedLines(indices=>indices.map(i=>result.lines.findIndex(line=>line.bg===cached.lines[i]?.bg&&line.res===cached.lines[i]?.res)).filter(i=>i>=0));
      setMaterials(result);
    }}catch(e){if(request.current===ticket)setError(String(e));}finally{if(request.current===ticket)setBusy(false);}
  }
  const perform=(action:()=>Promise<unknown>)=>{action().catch(e=>notify(String(e)));};
  const seek=(positionMs:number)=>perform(()=>runtime.native('playerControl',{action:'seek',positionMs}));
  function classroomAi(summary=false,screenshot?:string,positionMs=0){
    if(!selected||(!materials?.text.trim()&&!screenshot))return;
    const lines=materials?.lines||[];
    const contextIndices=subtitleScope==='selected'?selectedLines:[];
    if(!screenshot&&subtitleScope!=='all'&&!contextIndices.length){notify('请选择用于提问的字幕');return;}
    const text=subtitleScope==='selected'?(contextIndices.length?selectedLectureText(lines,contextIndices,selected.title,`${selected.source}:${selected.id}`):''):subtitleScope==='none'?'':materials?.text||'';
    const timePoints=subtitleScope==='none'?[]:subtitleScope==='selected'?contextIndices.map(i=>Math.floor(lines[i].bg/1000)):[...lines.map(l=>Math.floor(l.bg/1000)),...(materials?.slides||[]).filter(s=>s.createSec!==null&&s.createSec!==undefined&&Number.isFinite(Number(s.createSec))).map(s=>Math.floor(Number(s.createSec)))];
    onAi(selected.title+' · 课堂问答',{mode:'materials',args:{text,title:selected.title,resourceId:`${selected.source}:${selected.id}`,courseId:selected.courseId,timePoints,...(screenshot?{screenshot,positionMs,positionLabel:subtitleTime(positionMs)}:{}),initialQuestion:summary?'请总结本堂课的知识框架、重点和易错点，引用资料中已有的时间点。':''}});
  }
  function downloadSubtitle(format:'srt'|'txt'){if(!selected||!materials?.lines.length)return;perform(()=>runtime.native('exportFile',{name:selected.title+'.'+format,mime:format==='srt'?'application/x-subrip':'text/plain',text:subtitleExport(materials.lines,format)}));}
  return <>
    <div className="page-heading"><div><p className="eyebrow">课程录播</p><h1>课堂录播<span className="heading-dot">.</span></h1></div><Video size={23} className="subtle"/></div>
    <TermFilter courses={allCourses} value={term} onChange={setTerm}/>
        {!courseId&&<div className="recording-course-grid">{courses.map(c=><button className="recording-course-card" key={c.id} onClick={()=>void load(c.id)}><Video size={24}/><strong>{c.name}</strong><span>查看录播<ChevronRight size={13}/></span></button>)}</div>}
    {courseId&&!selected&&<div className="section-heading"><button className="back-link" onClick={()=>{request.current++;setCourseId('');setBusy(false);}}>全部课程</button><button className="text-button" onClick={()=>void load(courseId,true)}><RefreshCw size={14}/>刷新</button></div>}
    {!live.account&&<div className="notice">先在“我的”中连接本部 Canvas，再完成本机录播登录。</div>}
    {error&&<div className="notice amber" role="alert">{error}<button className="text-button" onClick={()=>perform(async()=>{await live.login();await load(courseId);})}>重新验证录播登录</button></div>}
    {busy&&<div className="notice"><LoaderCircle size={17} className="spin"/>正在读取课程资料…</div>}
    {!selected&&live.recordings.filter(r=>r.courseId===courseId).map(r=><button className="recording-course" key={r.id} onClick={()=>void choose(r)}><span className="course-glyph blue"><Play size={21}/></span><div><strong>{r.title}</strong><span>{r.materialsId?'可检查字幕与课件切片':'平台未提供资料标识'}</span></div><ChevronRight size={17}/></button>)}
    {!selected&&!busy&&courseId&&!error&&live.recordings.filter(r=>r.courseId===courseId).length===0&&<div className="empty"><Video size={28}/><h3>暂未找到可访问的录播</h3><p>可刷新课程或重新验证登录状态。</p></div>}
    {selected&&<>
      <button className="back-link" onClick={()=>{request.current++;setBusy(false);setSelected(null);setMaterials(null);}}>返回录播列表</button>
      <div className="learning-layout"><section className="learning-player" aria-label="课堂播放区">
      <InlinePlayer key={`${selected.source}:${selected.id}`} recording={selected} obscured={obscured} resume={memory.hasPlayed} notify={notify} onStatus={status=>{setPositionMs(status.positionMs);if(status.opened)setMemory(old=>old.hasPlayed?old:{...old,hasPlayed:true});}} onScreenshot={(image,ms)=>classroomAi(false,image,ms)}/>
      <div className="video-title"><h2>{selected.title}</h2><p></p></div>
      <div className="video-actions"><button disabled={!materials?.text.trim()} onClick={()=>classroomAi(true)}><Sparkles size={17}/>AI 总结</button><button disabled={!materials?.text.trim()} onClick={()=>classroomAi()}><MessageCircle size={17}/>课堂提问</button><button onClick={()=>perform(async()=>{if(!live.account)return;await runtime.enqueueRecording(selected,live.account.accountId);notify('录播已加入系统下载');})}><ArrowDownToLine size={17}/>下载视频</button></div>
      <button className="text-button classroom-history" onClick={()=>onAi(selected.title+' · 课堂问答',{mode:'materials',args:{resourceId:`${selected.source}:${selected.id}`,title:selected.title,history:true}})}><MessageCircle size={15}/>本堂课的对话记录</button>
      <button className="classroom-ai-card" disabled={!materials?.text.trim()} onClick={()=>classroomAi()}><Sparkles size={23}/><div><strong>课堂助手</strong><span>{materials?.text.trim()?'结合字幕与课件提问':'暂无课堂资料'}</span></div><ChevronRight size={18}/></button>
      </section><section className="learning-materials" aria-label="课堂学习资料">
      <div className="underlined-tabs"><button className={section==='subtitles'?'selected':''} onClick={()=>setSection('subtitles')}>字幕</button><button className={section==='slides'?'selected':''} onClick={()=>setSection('slides')}>课件切片 / OCR</button><button disabled={busy} aria-label="刷新课堂资料" onClick={()=>void choose(selected,true)}><RefreshCw size={15}/></button></div>
      {section==='subtitles'&&<>
        {!!materials?.lines.length&&<div className="button-row subtitle-downloads"><button className="button secondary" onClick={()=>downloadSubtitle('srt')}><ArrowDownToLine size={16}/>下载 SRT 字幕</button><button className="button secondary" onClick={()=>downloadSubtitle('txt')}>下载文字稿</button></div>}
        <label className="search-field"><Search size={15}/><input aria-label="搜索字幕" placeholder="搜索字幕" value={subQuery} onChange={e=>setSubQuery(e.target.value)}/></label>
        <LectureSubtitles lines={materials?.lines||[]} query={subQuery} positionMs={positionMs} onSeek={seek} selected={selectedLines} onSelected={setSelectedLines} scope={subtitleScope} onScope={setSubtitleScope}/>
        {!busy&&!materials?.lines.length&&<div className="notice">平台未返回可用字幕</div>}
      </>}
      {section==='slides'&&<>{materials?.slides.map((slide:Record<string,any>,i:number)=><div className="slide-snippet" key={i}>{slide.pptImgUrl&&<img alt={'课程切片 '+(i+1)} src={slide.pptImgUrl} style={{width:'100%',borderRadius:10}}/>}<p className="paragraph">{slide.ocrText||(slide.ocr||[]).map((w:Record<string,string>)=>w.word).join(' ')||'此切片没有 OCR 文字'}</p>{slide.createSec!==undefined&&Number.isFinite(Number(slide.createSec))&&<button className="text-button" onClick={()=>seek(Number(slide.createSec)*1000)}>跳转到 {subtitleTime(Number(slide.createSec)*1000)}<ChevronRight size={13}/></button>}</div>)}{!busy&&!materials?.slides.length&&<div className="notice">平台未返回可用课件切片或 OCR。</div>}</>}
      </section></div>
    </>}
  </>;
}
