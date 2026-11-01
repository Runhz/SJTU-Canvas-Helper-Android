import {assignmentFile} from './assignmentFiles';
import { useEffect, useRef, useState } from 'react';
import type { Assignment, Course, CourseFile, DownloadTask, Reminder, ReminderSettings } from './domain';
import { DEFAULT_REMINDERS } from './domain';
import * as runtime from './runtime';
import {defaultStudy,studyPreferences,reminderScope,coursesForTerm,type StudyPreferences} from './study';
import {mergeCourseFiles} from './courseCache';
import {ResourceCache,CACHE_TTL} from './ResourceCache';
import {deleteWorkspaceRecords,deleteWorkspaceRecordsForScopePrefixes,deleteWorkspaceSnapshot,readWorkspaceSnapshot,writeWorkspaceSnapshot} from './workspaceStore';
import {accountScope,clearRememberedAccountState,rememberedAccountPrefixes} from './pageMemory';
import {clearLegacyConversations} from './chatHistory';
import {clearLegacyStudyLibrary} from './studyLibrary';
export interface UiState { version:1;assignments:Assignment[];downloads:DownloadTask[];reminders:Reminder[];settings:ReminderSettings;seen:string[];syncedAt:number;study?:StudyPreferences }
const empty=():UiState=>({version:1,assignments:[],downloads:[],reminders:[],settings:DEFAULT_REMINDERS,seen:[],syncedAt:0,study:defaultStudy()});
export function useLiveCanvas(){
  const [state,setState]=useState<UiState>(empty),[courses,setCourses]=useState<Course[]>([]);
  const [readyScope,setReadyScope]=useState('');
  const [saved,setSaved]=useState<runtime.SavedSettings>({currentId:'',accounts:[]}),[account,setAccount]=useState<runtime.AccountConfig|null>(null);
  const [name,setName]=useState('尚未连接账号'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [progress,setProgress]=useState<{done:number;total:number}|null>(null);
  const [recordings,setRecordings]=useState<runtime.Recording[]>([]),[materials,setMaterials]=useState<Awaited<ReturnType<typeof runtime.materialText>>|null>(null);
  const current=useRef<runtime.AccountConfig|null>(null),syncing=useRef<number|null>(null),initialized=useRef(false),epoch=useRef(0);
  const cache=useRef<ResourceCache|null>(null),previousReminders=useRef(''),reminderQueue=useRef(Promise.resolve());
  const hydrated=useRef(false);
  const confirmed=useRef(new Map<string,number>()),queuedForce=useRef(false);
  const prefsRef=useRef(studyPreferences(state.study));prefsRef.current=studyPreferences(state.study);
  const uiKey=(config:runtime.AccountConfig)=>`canvas-ui-v2:${config.accountId}:${config.identityId}`;
  function activate(config:runtime.AccountConfig,migrateLegacy=false){
    hydrated.current=false;setReadyScope('');
    epoch.current++;confirmed.current.clear();queuedForce.current=false;cache.current?.close();cache.current=new ResourceCache(`canvas-resources-v2:${config.accountId}:${config.identityId}`);
    current.current=config;setAccount(config);setName(config.displayName||config.accountId);setRecordings([]);setMaterials(null);setError('');
    const metadata=cache.current.peek<Course[]>('courses')||[];setCourses(metadata.map(c=>({...c,files:cache.current!.peek(`files:${c.id}`)||[],filesLoaded:cache.current!.peek(`files:${c.id}`)!==undefined})));
    let snapshot=empty();try{const value=JSON.parse(localStorage.getItem(uiKey(config))||(migrateLegacy?localStorage.getItem(`canvas-cache:${config.accountId}`):null)||'null');if(value?.version===1&&Array.isArray(value.assignments)&&value.settings)snapshot={...snapshot,...value,downloads:[]};}catch{/* Fall back to an empty account snapshot. */}
    prefsRef.current=studyPreferences(snapshot.study);setState(snapshot);
    const activation=epoch.current;
    return readWorkspaceSnapshot<UiState>(uiKey(config),uiKey(config)).then(value=>{
      if(activation!==epoch.current||!value||value.version!==1||!Array.isArray(value.assignments)||!value.settings)return;
      const restored={...empty(),...value,downloads:[]};
      setState(currentState=>{
        if(activation!==epoch.current)return currentState;
        const merged={...restored};
        for(const key of Object.keys(snapshot) as (keyof UiState)[]){
          if(currentState[key]!==snapshot[key])Object.assign(merged,{[key]:currentState[key]});
        }
        prefsRef.current=studyPreferences(merged.study);return merged;
      });
    }).finally(()=>{if(activation===epoch.current){hydrated.current=true;setReadyScope(uiKey(config))}});
  }
  async function refresh(force=false){
    const active=current.current,store=cache.current,generation=epoch.current;if(!active||!store||!hydrated.current)return;if(syncing.current===generation){if(force)queuedForce.current=true;return;}
    const requestedAt=Date.now();
    const valid=()=>epoch.current===generation&&current.current?.accountId===active.accountId;
    syncing.current=generation;setProgress({done:0,total:0});setError('');
    try{
      const metadata=await store.get('courses',CACHE_TTL.courses,async()=> (await runtime.api<Record<string,any>[]>('courses')).map(runtime.mapCourse),force);
      if(!valid())return;setCourses(old=>mergeCourseFiles(old,metadata));
      const scope=coursesForTerm(metadata,prefsRef.current.term,Date.now()).filter(c=>!prefsRef.current.hiddenCourses.includes(c.id));
      const results:Assignment[]=[];const successful:string[]=[],failed:string[]=[];
      for(let offset=0;offset<scope.length;offset+=3){
        if(!valid())return;
        const batch=scope.slice(offset,offset+3);
        const response=await runtime.settleAll(batch.map(c=>store.get(`assignments:${c.id}`,CACHE_TTL.assignments,async()=> (await runtime.api<Record<string,any>[]>('assignments',{courseId:Number(c.id)})).map(a=>runtime.mapAssignment(c.id,a)),force)));
        response.forEach((result,i)=>{if(result.status==='fulfilled'){successful.push(batch[i].id);results.push(...result.value);}else failed.push(batch[i].id);});
        if(valid())setProgress({done:Math.min(offset+3,scope.length),total:scope.length});
      }
      if(!valid())return;
      setState(s=>{const assignments=[...s.assignments.filter(a=>!successful.includes(a.courseId)),...results.map(item=>(confirmed.current.get(item.id)||0)>requestedAt?s.assignments.find(a=>a.id===item.id)||item:item)];return {...s,assignments:JSON.stringify(assignments)===JSON.stringify(s.assignments)?s.assignments:assignments,syncedAt:Date.now()};});
      if(failed.length)setError(`${failed.length} 门课程暂未更新，已保留缓存`);
    }catch(e){if(valid())setError(`更新失败，已保留缓存：${String(e)}`);}finally{if(syncing.current===generation){syncing.current=null;setProgress(null);if(queuedForce.current){queuedForce.current=false;void refresh(true);}}}
  }
  async function connect(config:runtime.AccountConfig){
    setBusy(true);setError('');
    try{
      config={...config,accountId:config.accountId.trim(),token:runtime.normalizeCanvasToken(config.token)};
      const previous=current.current,me=await runtime.configure(config);config={...config,identityId:String(me.id),displayName:me.name};
      if(previous&&previous.accountId!==config.accountId){await runtime.native('clearAccount',{accountId:previous.accountId});await runtime.invokeCancelQr();}
      const next={currentId:config.accountId,accounts:[...saved.accounts.filter(a=>a.accountId!==config.accountId),config]};
      const migrateLegacy=saved.accounts.some(a=>a.accountId===config.accountId&&a.token===config.token);
      await runtime.saveSettings(next);setSaved(next);await activate(config,migrateLegacy);void refresh();
    }catch(e){setError(String(e));throw e;}finally{setBusy(false);}
  }
  useEffect(()=>{
    if(!runtime.NATIVE||initialized.current)return;initialized.current=true;
    runtime.savedSettings().then(async data=>{setSaved(data);let config=data.accounts.find(a=>a.accountId===data.currentId);if(!config)return;
      if(!config.identityId){const me=await runtime.configure(config);config={...config,identityId:String(me.id),displayName:me.name};const next={...data,accounts:data.accounts.map(a=>a.accountId===config!.accountId?config!:a)};await runtime.saveSettings(next);setSaved(next);await activate(config,true);}
      else{await Promise.all([activate(config),runtime.restoreSession(config)]);}
      await refresh();
    }).catch(e=>setError(String(e)));
  },[]);
  useEffect(()=>{if(!runtime.NATIVE)return;const interval=setInterval(()=>{if(!document.hidden)void refresh();},60_000);const resume=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',resume);return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',resume);};},[]);
  const term=studyPreferences(state.study).term;
  useEffect(()=>{if(runtime.NATIVE&&account&&readyScope===uiKey(account))void refresh();},[term,readyScope]);
  useEffect(()=>{
    if(!runtime.NATIVE||!account||readyScope!==uiKey(account)||state.syncedAt===0)return;
    void writeWorkspaceSnapshot(uiKey(account),{...state,downloads:[]});
    const prefs=studyPreferences(state.study),scope=reminderScope(state.assignments,courses,prefs,Date.now());
    const courseIds=coursesForTerm(courses,prefs.term,Date.now()).filter(c=>!prefs.hiddenCourses.includes(c.id)).map(c=>c.id);
    const signature=JSON.stringify([account.accountId,scope.map(a=>[a.id,a.dueAt,a.submission]),state.settings,prefs,courseIds]);
    if(signature!==previousReminders.current){previousReminders.current=signature;reminderQueue.current=reminderQueue.current.catch(()=>{}).then(()=>runtime.refreshReminders(account.accountId,scope,state.settings,{courseIds,ignoredIds:[...prefs.ignoredAssignments,...prefs.hiddenAssignments],termSelection:prefs.term})).catch(e=>{previousReminders.current='';setError(String(e));});}
  },[account,state,courses,readyScope]);
  useEffect(()=>{
    if(!runtime.NATIVE||!account)return;
    let stopped=false,running=false,again=false;let timer:ReturnType<typeof setTimeout>|undefined;
    const poll=async()=>{if(stopped||running||document.hidden)return;running=true;clearTimeout(timer);try{
      const {tasks}=await runtime.native<{tasks:runtime.NativeTask[]}>('listDownloads');
      if(stopped||current.current?.accountId!==account.accountId)return;
      setState(s=>JSON.stringify(s.downloads)===JSON.stringify(tasks)?s:{...s,downloads:tasks});
      if(tasks.some(t=>['running','queued','waiting'].includes(t.status)))timer=setTimeout(poll,1500);
    }catch(e){if(!stopped)setError(String(e));}finally{running=false;if(again&&!stopped){again=false;clearTimeout(timer);timer=setTimeout(poll,0);}}};
    void poll();const resume=()=>{if(!document.hidden)void poll();else clearTimeout(timer);};
    const changed=()=>{if(running)again=true;else void poll();};
    window.addEventListener('canvas-download-changed',changed);document.addEventListener('visibilitychange',resume);
    return()=>{stopped=true;clearTimeout(timer);window.removeEventListener('canvas-download-changed',changed);document.removeEventListener('visibilitychange',resume);};
  },[account]);
  async function files(course:Course,force=false){
    const store=cache.current,generation=epoch.current;if(!store)return;
    const key=`files:${course.id}`,cached=store.peek<Course['files']>(key);
    if(cached)setCourses(cs=>cs.map(c=>c.id===course.id?{...c,files:cached,filesLoaded:true}:c));
    if(!force&&store.isFresh(key,CACHE_TTL.files))return cached;
    setCourses(cs=>cs.map(c=>c.id===course.id?{...c,fileLoading:true,fileError:undefined}:c));
    try{const result=await store.get(key,CACHE_TTL.files,()=>runtime.loadFiles(course),force);if(generation===epoch.current){setCourses(cs=>cs.map(c=>c.id===course.id?{...c,files:result,filesLoaded:true,fileLoading:false,fileError:undefined}:c));return result;}}
    catch(e){if(generation===epoch.current)setCourses(cs=>cs.map(c=>c.id===course.id?{...c,fileLoading:false,fileError:String(e)}:c));throw e;}
  }
  async function acceptCookie(cookie:string){if(!account)throw new Error('请先连接 Canvas Token');setBusy(true);try{const result=await runtime.acceptExtraCookie(account,cookie);if(current.current?.accountId!==account.accountId)throw new Error('账号已切换，请重新认证');const next={...saved,accounts:saved.accounts.map(a=>a.accountId===account.accountId?result.account:a)};await runtime.saveSettings(next);setAccount(result.account);current.current=result.account;setSaved(next);return result;}finally{setBusy(false);}}
  async function login(url?:string){if(!account)throw new Error('请先连接 Canvas Token');const result=await runtime.native<{cookie:string}>('openLogin',url?{url}:{});return acceptCookie(result.cookie);}
  async function videos(course:Course,force=false){
    const store=cache.current,generation=epoch.current;if(!store)return[];const key=`videos:${course.id}`;
    const cached=store.peek<runtime.Recording[]>(key);setRecordings(cached||[]);
    setBusy(true);try{const result=await store.get(key,CACHE_TTL.recordings,()=>runtime.loadRecordings(course),force);if(generation===epoch.current)setRecordings(result);return result;}finally{if(generation===epoch.current)setBusy(false);}
  }
  async function loadMaterials(recording:runtime.Recording,force=false){const store=cache.current,generation=epoch.current;if(!store)throw Error('请先连接账号');const key=`materials-v3:${recording.source}:${recording.id}`;setMaterials(store.peek(key)||null);const result=await store.get(key,CACHE_TTL.materials,()=>runtime.materialText(recording),force);if(generation===epoch.current)setMaterials(result);return result;}
  function peekMaterials(recording:runtime.Recording){return cache.current?.peek<Awaited<ReturnType<typeof runtime.materialText>>>(`materials-v3:${recording.source}:${recording.id}`)||null;}
  async function logout(){if(!account)return;const old=account,scope=accountScope(old),prefixes=rememberedAccountPrefixes(scope,old);window.dispatchEvent(new CustomEvent('canvas-account-logout',{detail:{scope}}));hydrated.current=false;setReadyScope('');epoch.current++;cache.current?.close();cache.current=null;await Promise.allSettled([runtime.native('clearAccount',{accountId:old.accountId}),runtime.clearSession(),deleteWorkspaceSnapshot(uiKey(old)),...['documentEvidence','conversation','schedule','studyDocument','studyNote'].map(kind=>deleteWorkspaceRecords(scope,kind)),...['uiState','uiScroll'].map(kind=>deleteWorkspaceRecordsForScopePrefixes(prefixes,kind)),clearLegacyConversations(scope),clearLegacyStudyLibrary(scope)]);clearRememberedAccountState(scope,old);const next={...saved,currentId:'',accounts:saved.accounts.filter(a=>a.accountId!==old.accountId)};await runtime.saveSettings(next);setSaved(next);setAccount(null);current.current=null;setState(empty());setCourses([]);setRecordings([]);setMaterials(null);setName('尚未连接账号');}
  async function model(config:runtime.AccountConfig){await runtime.restoreSession(config);const next={...saved,accounts:saved.accounts.map(a=>a.accountId===config.accountId?config:a)};await runtime.saveSettings(next);setSaved(next);setAccount(config);current.current=config;}
  function markSubmission(id:string,receipt:Record<string,any>){confirmed.current.set(id,Date.now());setState(s=>({...s,assignments:s.assignments.map(a=>a.id===id?{...a,submission:receipt.submitted_at?(receipt.late?'late':'submitted'):receipt.workflow_state==='unsubmitted'?'unsubmitted':'unknown',submittedAt:receipt.submitted_at?Date.parse(receipt.submitted_at):undefined,submittedFiles:(receipt.attachments||[]).map((f:Record<string,any>)=>assignmentFile(f)).filter((f:CourseFile|undefined):f is CourseFile=>!!f),attachments:(receipt.attachments||[]).map((f:Record<string,string>)=>f.display_name||f.filename)}:a)}));}
  return {state,setState,courses,account,saved,name,error,setError,busy:busy||progress!==null,progress,refresh,connect,files,login,acceptCookie,videos,recordings,materials,loadMaterials,peekMaterials,logout,model,markSubmission};
}
