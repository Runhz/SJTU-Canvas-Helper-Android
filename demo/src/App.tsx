import {listConversations} from './chatHistory';
import {ReplyNotice,ReplyReminderSetting} from './ReplyNotice';
import {BackButton} from './BackButton';
import {AssistantHome} from './AssistantHome';
import {lazy,Suspense,useEffect, useRef, useState } from 'react';
import {safeFile,type StudyHit} from './studyLibrary';
import type {LectureTarget} from './NativePanels';
import DocumentReader from './DocumentReader';
const StudySearch=lazy(()=>import('./StudySearch').then(module=>({default:module.StudySearch})));
import type { ReactNode } from 'react';
import {version as APP_VERSION} from '../package.json';
import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, Bell, BellRing, BookOpen, CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, CloudUpload, Cpu, Download, ExternalLink, FileArchive, FileText, FolderOpen, GraduationCap, createLucideIcon, ListFilter, LoaderCircle, MoreHorizontal, Network, Pause, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sigma, Sparkles, Trash2, UploadCloud, UserRound, Video, Volume2, X } from 'lucide-react';
import { courses as demoCourses, createAssignments, sortAssignments, statusOf, countdown, formatDate, submitDemo, reminderCandidates, downloadProgress, DEFAULT_REMINDERS, HOUR } from './domain';
import type { Assignment, Course, CourseFile, DownloadTask, Reminder, ReminderSettings } from './domain';
import * as runtime from './runtime';
import { useLiveCanvas } from './useLiveCanvas';
import { AccountPanel, ModelPanel, NativeDownloadList, NativeAssignmentPanel, NativeRecordings, NativeSyllabus } from './NativePanels';
import {academicTerm,coursesForTerm,defaultStudy,studyPreferences,updateStudy,reminderScope,type StudyPreferences} from './study';
import {TermFilter,ItemShell} from './StudyControls';
import {ChoicePicker} from './ChoicePicker';
import {AiChat} from './AiChat';
import {useTheme,ThemePicker} from './Theme';
import WaterTank from './WaterTank';
import {ProfileAvatar} from './ProfileAvatar';
import {CompletionSummary} from './CompletionSummary';
import './water.css';
import {UpcomingSchedule} from './UpcomingSchedule';
import {Columns2,PanelLeft} from 'lucide-react';
import {StudyAiHub,useStudyAi} from './StudyAiHub';
import {decodeWorkspace,initialWorkspace,shouldSplit,workspacePages,toggleWorkspace,navigateWorkspace,workspaceDisplay,phoneRotation,type WorkspaceDevice,type WorkspaceSide} from './workspace';
import './workspace.css';
import {activateChatScope,subscribeChat,chatSummary,latestChat} from './chatSession';
import {BrandIcon} from './BrandIcon';
import {SubmissionCelebration} from './SubmissionCelebration';
import {Modal} from './Modal';
import {ConnectionBanner, DeadlineTools} from './Experience';
import {assignmentCalendar, matchesAssignment, matchesDeadline, orderCourses, type DeadlineWindow} from './productivity';
import {Pin, Undo2} from 'lucide-react';
import {accountScope,defaultPage,decodePage,pageField,useRememberedState,usePageScroll,type Tab} from './pageMemory';

// Explicit paths avoid missing SVG rect strokes in the Android 10 tablet WebView.
const OverviewIcon = createLucideIcon('Overview', [['path', {d:'M4 3H9Q10 3 10 4V11Q10 12 9 12H4Q3 12 3 11V4Q3 3 4 3Z M15 3H20Q21 3 21 4V7Q21 8 20 8H15Q14 8 14 7V4Q14 3 15 3Z M15 12H20Q21 12 21 13V20Q21 21 20 21H15Q14 21 14 20V13Q14 12 15 12Z M4 16H9Q10 16 10 17V20Q10 21 9 21H4Q3 21 3 20V17Q3 16 4 16Z',key:'overview'}]]);
const NATIVE = runtime.NATIVE;

type Dialog = 'reminders' | 'notifications' | 'search' | 'about' | 'models' | 'login' | null;
interface DemoState { version: 1; assignments: Assignment[]; downloads: DownloadTask[]; reminders: Reminder[]; settings: ReminderSettings; seen: string[]; syncedAt: number;study?:StudyPreferences }
const KEY = 'sjtu-canvas-demo-v1';
function initialState(): DemoState {
  const now = Date.now();
  return { version: 1, assignments: createAssignments(now), downloads: [{ id: 'sample-download', courseId: 'net', name: '第 4 讲 · 数据链路层.pdf', progress: 100, status: 'completed' }], reminders: [], settings: DEFAULT_REMINDERS, seen: [], syncedAt: now };
}
function loadState(): DemoState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s?.version === 1 && Array.isArray(s.assignments) && s.assignments.length === 6 && s.assignments.every((a: Assignment) => typeof a.id === 'string' && Number.isFinite(a.dueAt) && ['unsubmitted','submitted','late'].includes(a.submission)) && Array.isArray(s.downloads) && Array.isArray(s.reminders) && Array.isArray(s.seen) && Array.isArray(s.settings?.offsets)) return s;
  } catch { /* Browser storage is optional; the demo remains usable without it. */ }
  return initialState();
}
function Glyph({course, size = 24}: {course: Course; size?: number}) {
  const Icon = { network: Network, sigma: Sigma, cpu: Cpu, spark: Sparkles }[course.glyph] || BookOpen;
  return <span className={`course-glyph ${course.color}`}><Icon size={size} strokeWidth={1.6}/></span>;
}
function IconButton({label, children, onClick, badge}: {label: string; children: ReactNode; onClick: () => void; badge?: boolean}) {
  return <button className="icon-button" aria-label={label} title={label} onClick={onClick}>{children}{badge && <i className="notification-dot"/>}</button>;
}
function Empty({icon = <CheckCheck size={28}/>, title, text}: {icon?: ReactNode; title: string; text: string}) {
  return <div className="empty">{icon}<h3>{title}</h3><p>{text}</p></div>;
}
export default function App({layoutPreview=false}:{layoutPreview?:boolean}) {
  const live = useLiveCanvas();
  const scope = NATIVE ? accountScope(live.account) : 'demo';
  return <CanvasWorkspace key={scope} live={live} scope={scope} layoutPreview={layoutPreview}/>;
}
function CanvasWorkspace({live,scope,layoutPreview}:{live:ReturnType<typeof useLiveCanvas>;scope:string;layoutPreview:boolean}){
  const appearance=useTheme();
  useEffect(()=>activateChatScope(scope),[scope]);
  const startingLayout=()=>layoutPreview?{...initialWorkspace(scope),enabled:true,left:'recordings' as const,right:'assistant' as const}:initialWorkspace(scope);
  const [layout,setLayout]=useRememberedState(`${layoutPreview?'canvas-layout-preview-v2':'canvas-workspace-v1'}:${scope}`,startingLayout(),value=>value?decodeWorkspace(value):startingLayout());
  const [viewport,setViewport]=useState({width:innerWidth,height:innerHeight}),[device,setDevice]=useState<WorkspaceDevice>();
  useEffect(()=>{let active=true,ticket=0;let timer:ReturnType<typeof setTimeout>|undefined;
    const readDevice=()=>{if(!NATIVE)return;const current=++ticket;void runtime.native<WorkspaceDevice>('deviceInfo').then(value=>{if(active&&ticket===current)setDevice(value);}).catch(()=>{});};
    let frame=0;const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>setViewport({width:innerWidth,height:innerHeight}));clearTimeout(timer);timer=setTimeout(readDevice,100);};
    readDevice();window.addEventListener('resize',resize);screen.orientation?.addEventListener?.('change',resize);return()=>{active=false;ticket++;cancelAnimationFrame(frame);clearTimeout(timer);window.removeEventListener('resize',resize);screen.orientation?.removeEventListener?.('change',resize);};
  },[]);
  const screenLandscape=screen.orientation?.type?screen.orientation.type.startsWith('landscape'):device?.landscape;
  const currentDevice=device?{...device,landscape:screenLandscape??device.landscape}:device;
  useEffect(()=>{if(currentDevice)setLayout(old=>phoneRotation(old,currentDevice));},[currentDevice?.smallestWidthDp,currentDevice?.landscape]);
  useEffect(()=>{const nativeFocus=(e:Event)=>{const side=(e as CustomEvent).detail;if(side==='left'||side==='right')setLayout(old=>({...old,active:side}));};window.addEventListener('canvas-native-focus',nativeFocus);return()=>window.removeEventListener('canvas-native-focus',nativeFocus)},[]);
  const display=workspaceDisplay(viewport.width,viewport.height,currentDevice),pad=display.tablet,split=shouldSplit(viewport.width,layout,viewport.height,currentDevice);
  const change=(side:WorkspaceSide,tab:Tab)=>setLayout(old=>({...old,[side]:tab}));
  const focus=(side:WorkspaceSide)=>setLayout(old=>old.active===side?old:{...old,active:side});
  const icons={dashboard:OverviewIcon,courses:BookOpen,recordings:Video,assistant:Sparkles,downloads:Download,profile:UserRound};
  return <StudyAiHub scope={scope} accountId={live.account?.accountId} courses={NATIVE?live.courses:demoCourses} loadFiles={NATIVE?live.files:async()=>{}}><div className={`study-workspace ${split?'workspace-pad':'workspace-phone'} ${split?'split':'single'}`}>
    {split&&<aside className="workspace-rail"><BrandIcon/><nav aria-label="左侧导航">{workspacePages.map(([tab,label])=>{const Icon=icons[tab];return <button key={tab} aria-label={label} aria-current={layout[layout.active]===tab?'page':undefined} onClick={()=>setLayout(old=>navigateWorkspace(old,tab))}><Icon size={21}/><span>{label}</span></button>;})}</nav><div className="workspace-utilities"><button className={split?'selected':''} aria-label={split?'切换为单栏':'切换为双栏'} title={split?'切换为单栏':'切换为双栏'} onClick={()=>setLayout(toggleWorkspace)}>{split?<PanelLeft size={21}/>:<Columns2 size={21}/>}</button></div></aside>}
    <div className="workspace-pages">{(['left','right'] as WorkspaceSide[]).filter(side=>split||layout.active===side).map(side=><section key={side} className={`workspace-pane ${layout.active===side?'active':''}`} aria-label={`${side==='left'?'左':'右'}栏 ${workspacePages.find(([tab])=>tab===layout[side])?.[1]}`} onPointerDownCapture={()=>focus(side)} onFocusCapture={()=>focus(side)}>
      {split&&<button className="workspace-pane-label" aria-label={`选中${side==='left'?'左':'右'}栏`} aria-pressed={layout.active===side} onClick={()=>focus(side)}>{(()=>{const Icon=icons[layout[side]];return <Icon size={15}/>})()}{workspacePages.find(([tab])=>tab===layout[side])?.[1]}</button>}
      <LearningApp live={live} scope={scope} appearance={appearance} pane={side==='left'?'primary':'secondary'} workspacePad={split} embedded={split} tabletDevice={NATIVE||layoutPreview?pad:undefined} fullPreview={layoutPreview} workspaceToggle={!split&&display.canSplit?<button className="icon-button" aria-label="切换为双栏" title="切换为双栏" onClick={()=>setLayout(toggleWorkspace)}><Columns2 size={21}/></button>:undefined} controlledTab={layout[side]} onTabChange={tab=>change(side,tab)} playbackActive={!split||layout.left!==layout.right||layout.active===side}/>
    </section>)}</div>
    <ReplyNotice scope={scope} onOpen={id=>window.dispatchEvent(new CustomEvent('canvas-open-ai-'+layout.active,{detail:id}))}/>
  </div></StudyAiHub>;
}
function LearningApp({live,scope,appearance,pane,embedded=false,controlledTab,onTabChange,workspacePad=false,playbackActive=true,workspaceToggle,tabletDevice,fullPreview=false}:{live:ReturnType<typeof useLiveCanvas>;scope:string;appearance:ReturnType<typeof useTheme>;pane:'primary'|'secondary';embedded?:boolean;controlledTab:Tab;onTabChange:(tab:Tab)=>void;workspacePad?:boolean;playbackActive?:boolean;workspaceToggle?:ReactNode;tabletDevice?:boolean;fullPreview?:boolean}) {
  const hub=useStudyAi();
  const pageScope=scope+(pane==='secondary'?':secondary':'');
  const [page,setPage]=useRememberedState(`canvas-page-v1:${pageScope}`,defaultPage,decodePage);
  const field=<K extends keyof typeof page>(key:K)=>pageField(page,setPage,key);
  const [demoState, setDemoState] = useState<DemoState>(loadState);
  const state = NATIVE ? live.state : demoState;
  const setState = NATIVE ? live.setState : setDemoState;
  const demoTerm = academicTerm(Date.now());
  const allCourses = NATIVE ? live.courses : demoCourses.map(c=>({...c,term:{id:'demo-'+demoTerm.season+'-'+demoTerm.year,name:demoTerm.year+'-'+(demoTerm.year+1)+' '+demoTerm.season}}));
  const [now, setNow] = useState(Date.now());
  const [savedTab, setSavedTab] = field('tab');
  const tab=controlledTab;
  const setTab=(next:Tab|((old:Tab)=>Tab))=>{const value=typeof next==='function'?next(tab):next;setSavedTab(value);onTabChange(value);};
  useEffect(()=>{if(savedTab!==controlledTab)setSavedTab(controlledTab);},[controlledTab]);
  const [visitedRecordings,setVisitedRecordings]=useState(tab==='recordings');
  useEffect(()=>{if(tab==='recordings')setVisitedRecordings(true);},[tab]);
  const [previewSize,setPreviewSize] = useState<'phone'|'tablet'>('phone');
  const [screenWidth,setScreenWidth] = useState(window.innerWidth);
  useEffect(()=>{const changed=()=>setScreenWidth(window.innerWidth);window.addEventListener('resize',changed);return()=>window.removeEventListener('resize',changed);},[]);
  const tablet = !embedded&&(tabletDevice??(NATIVE ? screenWidth>=600 : previewSize==='tablet'&&screenWidth>=600));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [courseId, setCourseId] = field('courseId');
  const [courseSection, setCourseSection] = field('courseSection');
  const [filter, setFilter] = field('filter');
  const [itemActions,setItemActions]=useState<{kind:'assignment'|'course';id:string}|null>(null);
  const [showHiddenCourses,setShowHiddenCourses]=field('showHiddenCourses');
  const [courseFilter, setCourseFilter] = field('courseFilter');
  const [courseQuery,setCourseQuery]=field('courseQuery');
  const [query, setQuery] = useState('');
  const [assignmentQuery, setAssignmentQuery] = field('assignmentQuery');
  const [deadlineWindow, setDeadlineWindow] = field('deadlineWindow');
  const [fileQuery, setFileQuery] = field('fileQuery');
  const [reading,setReading]=useRememberedState<{courseId:string;file:CourseFile;page?:number}|null>(`canvas-open-file-v1:${pageScope}`,null,value=>{const row=value as {courseId:string;file:CourseFile;page?:number}|null;return row&&typeof row.courseId==='string'&&typeof row.file?.id==='string'&&typeof row.file?.name==='string'?{courseId:row.courseId,file:safeFile(row.file),...(Number.isInteger(row.page)&&row.page!>0?{page:row.page}:{})}:null});
  const [assignmentReturn,setAssignmentReturn]=useState<string>();
  const [lectureTarget,setLectureTarget]=useState<LectureTarget>();
  const [undo, setUndo] = useState<null | { run: () => void }>(null);
  const [toast, setToast] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [video, setVideo] = field('video');
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoTime, setVideoTime] = field('videoTime');
  const [speed, setSpeed] = field('speed');
  const [angle, setAngle] = field('angle');
  const [videoSection, setVideoSection] = field('videoSection');
  const [subtitleQuery, setSubtitleQuery] = field('subtitleQuery');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiVisited,setAiVisited]=useState(false);
  const [chatProgress,setChatProgress]=useState(()=>chatSummary(scope));
  useEffect(()=>subscribeChat(()=>setChatProgress(old=>{const next=chatSummary(scope);return old.busy===next.busy&&old.completed===next.completed?old:next})),[scope]);
  useEffect(()=>{const show=()=>setDialog('notifications');const event=`canvas-notifications-${pane==='primary'?'left':'right'}`;window.addEventListener(event,show);return()=>window.removeEventListener(event,show);},[pane]);
  const [aiContext, setAiContext] = useState('');
  const [aiPayload,setAiPayload] = useState<{mode:string;args:Record<string,unknown>}>({mode:'agent',args:{}});
  const aiDocked=tablet&&!workspacePad&&screenWidth>=1100&&aiPayload.args.forceModal!==true;
  const [showCalendar, setShowCalendar] = field('showCalendar');
  const [selectedDay, setSelectedDay] = field('selectedDay');
  const mainRef=usePageScroll(pageScope,`${tab}:${tab==='courses'?(courseId||'list')+(reading?':file:'+reading.file.id:''):tab==='recordings'?video||'native':'root'}`);
  const [storageOk, setStorageOk] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const syncTimer = useRef<ReturnType<typeof setTimeout>>();
  const submitTimer = useRef<ReturnType<typeof setTimeout>>();
  const uploadInput = useRef<HTMLInputElement>(null);
  const notified = useRef(new Set(state.reminders.map(r => r.id)));
  const prefs=studyPreferences(state.study);
  const termCourses=coursesForTerm(allCourses,prefs.term,now);
  const courses=orderCourses(termCourses.filter(c=>!prefs.hiddenCourses.includes(c.id)),prefs.pinnedCourses);
  const scopedIds=new Set(courses.map(c=>c.id));
  const scopedAssignments=state.assignments.filter(a=>scopedIds.has(a.courseId));
  function setTerm(term:string){setState(s=>({...s,study:{...studyPreferences(s.study),term}}));setCourseFilter('all');setCourseId(null);setSelectedDay(null);setAssignmentQuery('');setDeadlineWindow('all');}
  function changeItem(kind:'assignment'|'course',id:string,action:'ignore'|'hide'|'restore'){
    const before = studyPreferences(state.study);
    if (action !== 'restore') setUndo({run: () => {
      setState(s => {
        const current = studyPreferences(s.study);
        const keys = kind === 'course' ? ['hiddenCourses'] as const : ['hiddenAssignments','ignoredAssignments'] as const;
        for (const key of keys) current[key] = before[key].includes(id) ? Array.from(new Set([...current[key],id])) : current[key].filter(v=>v!==id);
        return {...s,study:current};
      });
      notify('已撤销，原有显示与提醒设置已恢复');
    }});
    setState(s=>({...s,study:updateStudy(studyPreferences(s.study),kind,id,action),reminders:s.reminders.map(r=>kind==='assignment'&&r.assignmentId===id?{...r,read:true}:r)}));
    setItemActions(null);notify(action==='restore'?'已恢复显示与正常提醒':action==='ignore'?'已忽略这项作业，停止后续提醒':'已从本机列表移除，可在已移除中恢复', action !== 'restore');
  }
  function notify(message: string, preserveUndo = false) { if (!preserveUndo) setUndo(null); setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 7000); }
  useEffect(() => { if (!undo) return; const id = setTimeout(() => setUndo(null), 6500); return () => clearTimeout(id); }, [undo]);
  useEffect(() => {
    const id = setInterval(() => { setNow(Date.now()); if (!document.hidden) setVideoTime(t => videoPlaying ? Math.min(3012, t + Number(speed)) : t); }, 1000);
    return () => clearInterval(id);
  }, [videoPlaying, speed]);
  useEffect(() => { const onVisibility = () => { setNow(Date.now()); if (document.hidden) setVideoPlaying(false); }; document.addEventListener('visibilitychange', onVisibility); return () => document.removeEventListener('visibilitychange', onVisibility); }, []);
  useEffect(() => { if(NATIVE)return;const id = setInterval(() => setState(s => s.downloads.some(t => t.status === 'running') ? { ...s, downloads: downloadProgress(s.downloads) } : s), 700); return () => clearInterval(id); }, []);
  useEffect(() => { if(NATIVE)return;try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { setStorageOk(false); } }, [state]);
  useEffect(() => {
    setState(s => {
      const candidates = reminderCandidates(reminderScope(s.assignments,allCourses,studyPreferences(s.study),now), s.settings, now, new Set(s.seen));
      if (!candidates.length) return s;
      return { ...s, reminders: [...candidates, ...s.reminders].slice(0, 40), seen: [...s.seen, ...candidates.map(r => r.id)] };
    });
  }, [now, state.study, courses.map(c=>c.id).join(',')]);
  useEffect(() => {
    for (const reminder of state.reminders) {
      if (notified.current.has(reminder.id)) continue;
      notified.current.add(reminder.id);
      if (!reminder.read && !reminder.demo && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification(`演示提醒 · ${reminder.title}`, { body: reminder.body, tag: reminder.id }); } catch { /* In-app reminders remain available. */ }
      }
    }
  }, [state.reminders]);
  useEffect(() => () => { clearTimeout(toastTimer.current); clearTimeout(syncTimer.current); clearTimeout(submitTimer.current);  }, []);
  const assignments = scopedAssignments.filter(a=>!prefs.ignoredAssignments.includes(a.id)&&!prefs.hiddenAssignments.includes(a.id));
  const pending = assignments.filter(a => a.submission === 'unsubmitted');
  const submitted = assignments.filter(a=>a.submission==='submitted'||a.submission==='late').length;
  const overdue = pending.filter(a => a.dueAt <= now);
  const urgent = pending.filter(a => a.dueAt > now && a.dueAt - now <= 24 * HOUR);
  const reminderAssignmentIds=new Set(assignments.map(a=>a.id));
  const visibleReminders=state.reminders.filter(r=>reminderAssignmentIds.has(r.assignmentId));
  const unread = visibleReminders.filter(r => !r.read).length;
  const activeCourse = courses.find(c => c.id === courseId);
  const assignment = state.assignments.find(a => a.id === detail);
  const selectedCourse = assignment && allCourses.find(c => c.id === assignment.courseId)!;
  const courseById = (id: string) => allCourses.find(c => c.id === id) || {...demoCourses[0],id,name:'已归档课程',files:[]};
  useEffect(()=>{if(NATIVE&&activeCourse){void live.files(activeCourse).catch(e=>notify(String(e)));}},[courseId,!!activeCourse]);
  const stateFilteredAssignments = sortAssignments((filter==='ignored'?scopedAssignments.filter(a=>prefs.ignoredAssignments.includes(a.id)&&!prefs.hiddenAssignments.includes(a.id)):filter==='hidden'?scopedAssignments.filter(a=>prefs.hiddenAssignments.includes(a.id)):assignments).filter(a => (['all','ignored','hidden'].includes(filter) || (filter === 'pending' ? a.submission === 'unsubmitted' : a.submission === 'submitted'||a.submission === 'late')) && (courseFilter === 'all' || a.courseId === courseFilter) && (!showCalendar || !selectedDay || formatDate(a.dueAt, false) === selectedDay)));
  const visibleAssignments = stateFilteredAssignments.filter(a => matchesDeadline(a, deadlineWindow, now) && matchesAssignment(a, allCourses, assignmentQuery));
  const exportable = assignmentCalendar(visibleAssignments, allCourses, now, !NATIVE);
  function exportCalendar() {
    if (!exportable.count) return;
    exportText('Canvas随行_作业截止.ics', exportable.text, 'text/calendar');
    notify('已准备日历快照；提交或改期后请重新导出，无自动同步');
  }
  function togglePin(id: string) {
    setState(s => {const p=studyPreferences(s.study);return {...s,study:{...p,pinnedCourses:p.pinnedCourses.includes(id)?p.pinnedCourses.filter(v=>v!==id):[...p.pinnedCourses,id]}};});
    setItemActions(null); notify(prefs.pinnedCourses.includes(id)?'已取消课程置顶':'课程已置顶，下次打开仍会保留');
  }
  const today = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'long' }).format(now);
  const dayOptions = Array.from({ length: 7 }, (_, i) => now + i * 86400_000);
  const navItems: { id: Tab; name: string; icon: typeof BookOpen }[] = [{ id: 'dashboard', name: '总览', icon: OverviewIcon }, { id: 'courses', name: '课程', icon: BookOpen }, { id: 'recordings', name: '录播', icon: Video }, { id: 'assistant', name: '助手', icon: Sparkles }, { id: 'downloads', name: '下载', icon: Download }, { id: 'profile', name: '我的', icon: UserRound }];
  function navigate(target: Tab) { if(target==='recordings')setVisitedRecordings(true);setTab(target);setVideoPlaying(false); }
  function openAssignment(id: string) { setDetail(id); setFiles([]); setSubmitResult(false); setCelebration(false); setConfirmSubmit(false); }
  function sync() { if(NATIVE){if(!live.account){setDialog('login');return;}void live.refresh(true);return;}if (syncing) return; setSyncing(true); syncTimer.current = setTimeout(() => { setState(s => ({...s, syncedAt: Date.now()})); setSyncing(false); notify('示例数据已刷新 · 未连接真实 Canvas'); }, 650); }
  function enqueue(file: Pick<CourseFile, 'id' | 'name'>, cid: string) {
    if(NATIVE){const resource=courses.find(c=>c.id===cid)?.files.find(f=>f.id===file.id);if(!resource||!live.account){notify('请先连接账号并刷新课程文件');return;}void runtime.enqueueFile(resource,cid,live.account.accountId).then(()=>notify('已加入系统后台下载')).catch(e=>notify(String(e)));return;}
    const id = `${cid}:${file.id}`;
    if (state.downloads.some(d => d.id === id && d.status !== 'cancelled')) { notify('已在下载列表中，无需重复添加'); return; }
    setState(s => ({ ...s, downloads: [...s.downloads.filter(d => d.id !== id), { id, courseId: cid, name: file.name, status: 'running', progress: 0 }] })); notify('已加入演示下载队列');
  }
  function exportText(name: string, content: string, mime = 'text/plain') { if(NATIVE){void runtime.native('exportFile',{name,text:content,mime}).catch(e=>notify(String(e)));return;}const url = URL.createObjectURL(new Blob([content], {type: `${mime};charset=utf-8`})); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function demonstrateReminder() {
    const next = sortAssignments(pending.filter(a => a.dueAt > now))[0] || pending[0];
    if (!next) { notify('作业已全部提交，无需截止提醒'); return; }
    const reminder: Reminder = { id: `preview:${Date.now()}`, assignmentId: next.id, title: '演示提醒 · 作业即将截止', body: `${next.title} 尚未提交，请在 ${formatDate(next.dueAt)} 前完成。`, createdAt: Date.now(), read: false, demo: true };
    setState(s => ({ ...s, reminders: [reminder, ...s.reminders] }));
    if ('Notification' in window && Notification.permission === 'granted') new Notification(reminder.title, { body: reminder.body });
    notify(reminder.body);
  }
  async function requestNotifications() {
    if(NATIVE){await runtime.native('requestNotifications');notify('请在系统权限弹窗中允许通知；提醒时间可能受系统省电策略影响');return;}
    if (!('Notification' in window)) { notify('当前浏览器不支持系统通知，站内提醒仍可用'); return; }
    const result = await Notification.requestPermission();
    notify(result === 'granted' ? '浏览器通知已开启，可点击预览提醒' : '通知未开启，站内提醒仍可用');
  }
  function submit() {
    if (files.length === 0 || !assignment || submitting) return;
    const id = assignment.id, names = files.map(f => f.name);
    setSubmitting(true); submitTimer.current = setTimeout(() => {
      setState(s => ({ ...s, assignments: submitDemo(s.assignments, id, names, Date.now()), reminders: s.reminders.map(r => r.assignmentId === id ? {...r, read: true} : r), syncedAt: Date.now() }));
      setSubmitting(false); setSubmitResult(true); setCelebration(true); setConfirmSubmit(false); notify('演示提交完成，控制面板已同步更新');
    }, 1100);
  }
  useEffect(()=>{let active=true;const resume=(event:Event)=>{const id=(event as CustomEvent).detail;if(typeof id!=='string')return;void listConversations(scope).then(rows=>{const row=rows.find(r=>r.id===id);if(active&&row){setAiPayload({...row.payload,args:{...row.payload.args,conversationId:row.id}});setAiContext(row.title);setAiVisited(true);setAiOpen(true)}}).catch(()=>{if(active)notify('对话暂时无法读取，请到助手中重试')})};const name='canvas-open-ai-'+(pane==='primary'?'left':'right');window.addEventListener(name,resume);return()=>{active=false;window.removeEventListener(name,resume)}},[scope,pane]);
  function openAi(context:string,payload?:{mode:string;args:Record<string,unknown>}){const file=activeCourse?.files.find(f=>f.name===context);const next=payload||(file?.raw?{mode:'file',args:{file:file.raw,courseId:activeCourse?.id,fileName:file.name}}:{mode:'agent',args:{}});if(next.mode==='file'&&!next.args.courseId)next.args={...next.args,courseId:activeCourse?.id,fileName:context};hub.open(context,{...next,args:{...next.args,intentId:`intent-${Date.now()}-${Math.random().toString(36).slice(2)}`}},value=>{setAiPayload(value);setAiContext(context);setAiVisited(true);setAiOpen(true);});}
  function resumeAiVideo(currentPayload:import('./chatHistory').AiPayload,positionMs:number,play:boolean){
    const resource=String(currentPayload.args.resourceId||'');
    void runtime.native<{opened:boolean;resourceId:string}>('playerStatus').then(status=>{
      if(!status.opened||status.resourceId!==resource){notify('请先打开对应课堂');return;}
      setAiOpen(false);navigate('recordings');requestAnimationFrame(()=>{void(async()=>{if(positionMs>=0)await runtime.native('playerControl',{action:'seek',resourceId:resource,positionMs});await runtime.native('playerControl',{action:play?'play':'pause',resourceId:resource})})().catch(e=>notify(String(e)))});
    }).catch(e=>notify(String(e)));
  }
  function seekAiReference(href:string,currentPayload=aiPayload){
    const params=new URLSearchParams(href.slice(1));const seconds=Number(params.get('t'));const resource=params.get('video');const points=currentPayload.args.timePoints;
    if(!Number.isFinite(seconds)||seconds<0||resource!==currentPayload.args.resourceId||!Array.isArray(points)||!points.includes(seconds)){notify('该引用没有可核对的课堂时间点');return;}
    void runtime.native<{opened:boolean;resourceId:string}>('playerStatus').then(async status=>{if(!status.opened||status.resourceId!==resource){notify('请先打开对应课堂，再跳转时间点');return;}setAiOpen(false);navigate('recordings');await runtime.native('playerControl',{action:'seek',positionMs:seconds*1000,resourceId:resource});}).catch(e=>notify(String(e)));
  }
  function openStudyHit(hit:StudyHit){
    setDialog(null);if(!courses.some(c=>c.id===hit.courseId))setTerm('all');
    if(hit.recording){setLectureTarget({id:`search-${Date.now()}`,recording:hit.recording,positionMs:hit.timeMs||0,notes:hit.kind==='note'});navigate('recordings');}
    else if(hit.file){setCourseId(hit.courseId);setCourseSection('files');setReading({courseId:hit.courseId,file:safeFile(hit.file),page:hit.page});navigate('courses');}
  }
  function assignmentCard(a: Assignment) {
    const course = courseById(a.courseId), status = statusOf(a, now);
    return <ItemShell key={a.id} label={a.title} onActions={()=>setItemActions({kind:'assignment',id:a.id})}><button className={`assignment-card ${status.tone === 'red' ? 'overdue-card' : ''}`} onClick={() => openAssignment(a.id)}>
      <div className="assignment-top"><span className={`course-label ${course.color}`}>{course.name}</span><span className={`pill ${status.tone}`}>{(a.submission === 'submitted'||a.submission==='late') && <Check size={11}/>} {status.text}</span></div>
      <h3>{a.title}</h3>
      <div className="assignment-bottom"><span><CalendarDays size={13}/>{formatDate(a.dueAt)} 截止</span>{a.submission === 'unsubmitted' ? <span className={a.dueAt <= now ? 'danger' : a.dueAt - now <= 24*HOUR ? 'warning' : ''}>{countdown(a.dueAt, now)}</span> : <span className={a.submission==='unknown'?'subtle':'success'}>{a.submission==='unknown'?'需要刷新核对':'附件已提交'}</span>}</div>
      {a.submission === 'unsubmitted' && <span className="card-arrow"><ChevronRight size={18}/></span>}
    </button></ItemShell>;
  }
  function fileRows(course: Course) {
    return <div className="file-list">{course.files.filter(file=>file.name.toLocaleLowerCase().includes(fileQuery.toLocaleLowerCase().trim())).map(file => <div className="file-row" key={file.id}>
      <span className={`file-icon ${file.kind.toLowerCase()}`}>{file.kind === 'ZIP' ? <FileArchive size={22}/> : <FileText size={22}/>}<small>{file.kind}</small></span>
      <div className="file-info"><button className="file-name-button" aria-label={`预览 ${file.name}`} onClick={()=>setReading({courseId:course.id,file:safeFile(file)})}>{file.name}</button><span>{file.size}<i/> {file.updated}更新</span><button className="text-button tiny" onClick={() => openAi(file.name,file.raw?{mode:'file',args:{file:file.raw,courseId:activeCourse?.id,fileName:file.name}}:undefined)}><Sparkles size={11}/> 询问 AI</button></div>
      <IconButton label={`下载 ${file.name}`} onClick={() => enqueue(file, course.id)}><ArrowDownToLine size={19}/></IconButton>
    </div>)}</div>;
  }
  const subtitleLines = [{time: 754, label:'12:34', text:'我们来看网络层的两个核心功能：转发与路由。'}, {time: 815, label:'13:35', text:'转发是将分组从输入接口移动到合适的输出接口。'}, {time: 1390, label:'23:10', text:'这里展示的是 IPv4 数据报的基本结构。'}, {time: 2168, label:'36:08', text:'最长前缀匹配，会选择与目标地址匹配最多的路由项。'}];
  const timeString = (t: number) => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

  return <div className={`demo-stage ${NATIVE||fullPreview?'native-runtime':''} ${tablet?'tablet-preview':''}`}>
    {!NATIVE&&!fullPreview&&<div className="preview-controls" aria-label="预览设备"><span>预览设备</span><button className={!tablet?'selected':''} aria-pressed={!tablet} onClick={()=>setPreviewSize('phone')}>手机</button><button className={tablet?'selected':''} aria-pressed={tablet} onClick={()=>{if(screenWidth<600)notify('请在较宽的窗口中预览平板布局');else setPreviewSize('tablet');}}>平板</button></div>}
    <aside className="preview-intro">
      <div className="intro-brand"><BrandIcon/><span>CANVAS <b>随行</b></span></div>
      <div className="intro-kicker"><span/> ANDROID EXPERIENCE · 01</div>
      <h1>课程随身，<br/>待办有序。</h1>
      <p className="intro-description">把课程资料、作业截止日期和课堂录播，<br/>放进一个随手可用的学习空间。</p>
      <div className="intro-features"><span><CheckCircle2 size={17}/> 作业状态，一眼看清</span><span><Clock3 size={17}/> 截止提醒，提前一步</span><span><BookOpen size={17}/> 课程资料与录播</span></div>
      <div className="demo-guide"><span className="small-label">试着点一点</span><p>打开一项作业 → 选择附件 → 演示提交<br/>回到总览，查看状态与完成进度的变化。</p><button onClick={() => { navigate('dashboard'); openAssignment('a1'); }}>体验提交流程 <ArrowRight size={15}/></button></div>
      <div className="intro-footer"><span className="version-dot"/> 可交互前端 Demo <span>Android · 中文版</span></div>
    </aside>

    <div className="device-wrap"><div className="device-caption"><span><span className="version-dot"/> LIVE PREVIEW</span><span>Android 10+</span></div>
      <div className={`app-shell ${tablet?'tablet-layout':''} ${tab==='dashboard'?'has-overview-header':'content-first'}`}>
        <div className="status-bar"><span>{new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Taipei', hour:'2-digit',minute:'2-digit',hour12:false}).format(now)}</span><span className="status-indicators"><i/><i/><span className="battery"/></span></div>
        <a className="skip-link" href={pane==='primary'?'#main-content':'#main-content-secondary'}>跳到主要内容</a>{tab==='dashboard'&&<header className="app-header"><button className="header-search" aria-label="搜索" onClick={() => { setQuery(''); setDialog('search'); }}><Search size={19}/><span>搜索课程、作业和资料</span></button><IconButton label="提醒消息" badge={unread > 0} onClick={() => setDialog('notifications')}><Bell size={21}/></IconButton></header>}
        {!NATIVE&&<div className="demo-ribbon"><span/> 示例数据体验 <span className="ribbon-right">未连接真实 Canvas</span></div>}
        {NATIVE&&live.error&&<div className="notice amber" role="alert">{live.error}<button className="text-button" onClick={()=>setDialog('login')}>检查账号</button></div>}
        {!storageOk && <div role="alert" className="notice amber">浏览器无法保存数据，本次体验仅保留在当前页面。</div>}
        <ConnectionBanner/><main className={`app-content ${tab==='profile'?'settings-page':''}`} id={pane==='primary'?'main-content':'main-content-secondary'} tabIndex={-1} ref={mainRef}>
          {tab === 'dashboard' && <div className="dashboard-layout"><div className="dashboard-summary">
            <div className="page-heading"><div><p className="eyebrow">{today} · {new Date(now).getHours()<6?'凌晨':new Date(now).getHours()<12?'上午':new Date(now).getHours()<18?'下午':'晚间'}</p><h1>学习总览<span className="heading-dot">.</span></h1></div><button className={`refresh-button ${syncing ? 'syncing' : ''}`} onClick={sync} aria-label="刷新作业状态"><RefreshCw size={16}/></button></div>
            <TermFilter courses={allCourses} value={prefs.term} onChange={setTerm}/><div className="overview-card"><div className="overview-top"><span><span className="live-dot"/> 作业控制面板</span><button onClick={() => setDialog('reminders')} aria-label="设置截止提醒"><Settings2 size={17}/></button></div><div className="overview-main"><div><span className="overview-number">{pending.length}</span><span className="overview-number-label">份作业待完成</span><p>{NATIVE&&!live.account?'连接账号后显示真实作业状态':overdue.length ? `${overdue.length} 份已逾期，记得优先处理` : '暂无逾期作业'}</p></div><WaterTank completed={submitted} total={assignments.length} cacheKey={scope}/></div><div className="overview-divider"/><div className="overview-footer"><span><Clock3 size={14}/><b>{urgent.length}</b> 份将在 24 小时内截止</span><button onClick={() => setDialog('reminders')}>提醒已{state.settings.enabled ? '开启' : '关闭'}<ChevronRight size={13}/></button></div></div>
            {overdue.length > 0 && <button className="overdue-notice" onClick={() => openAssignment(overdue[0].id)}><span className="notice-icon">!</span><span><strong>有 {overdue.length} 份作业逾期未提交</strong><small>{overdue[0].title}</small></span><ChevronRight size={16}/></button>}
            <UpcomingSchedule key={scope} account={live.account} courses={courses}/>

            </div><div className="dashboard-timeline"><div className="section-heading"><h2>作业时间线 <span>{visibleAssignments.length}</span></h2><button className={`text-button ${showCalendar ? 'active-text' : ''}`} onClick={() => { setShowCalendar(!showCalendar); setSelectedDay(null); }}><CalendarDays size={15}/>{showCalendar ? '收起日历' : '日历'}</button></div>
            {showCalendar && <div className="calendar-strip" aria-label="作业日历">{dayOptions.map(t => { const key = formatDate(t, false); const count = pending.filter(a => formatDate(a.dueAt, false) === key).length; return <button key={key} className={selectedDay === key ? 'selected' : ''} onClick={() => setSelectedDay(selectedDay === key ? null : key)}><small>{new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Taipei',weekday:'narrow'}).format(t)}</small><strong>{new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Taipei',day:'numeric'}).format(t).replace('日','')}</strong><i className={count ? 'has-events' : ''}/></button>; })}</div>}
            <div className="filter-row"><div className="segmented" aria-label="作业状态筛选">{[{id:'pending',label:`待完成 ${pending.length}`},{id:'submitted',label:`已提交 ${submitted}`},{id:'all',label:'全部'}].map(f => <button key={f.id} aria-pressed={filter===f.id} className={filter === f.id ? 'selected' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div><label className="course-filter"><ListFilter size={13}/><ChoicePicker label="筛选课程" value={courseFilter} onChange={setCourseFilter} options={[{value:"all",label:"全部课程"},...courses.map(c=>({value:c.id,label:c.name}))]}/></label></div>
            <div className="local-filters"><button className={filter==='ignored'?'selected':''} onClick={()=>setFilter(filter==='ignored'?'pending':'ignored')}>已忽略 {prefs.ignoredAssignments.filter(id=>scopedAssignments.some(a=>a.id===id)).length}</button><button className={filter==='hidden'?'selected':''} onClick={()=>setFilter(filter==='hidden'?'pending':'hidden')}>已移除 {prefs.hiddenAssignments.filter(id=>scopedAssignments.some(a=>a.id===id)).length}</button><small>长按卡片或点管理</small></div><div className="timeline-sort"><ArrowDown size={12}/>按截止时间从早到晚排列 <span><span className="tiny-live"/> 实时倒计时</span></div>
            <DeadlineTools window={deadlineWindow} onWindow={setDeadlineWindow} query={assignmentQuery} onQuery={setAssignmentQuery} count={exportable.count} onExport={exportCalendar}/><div className="assignment-list">{visibleAssignments.length ? visibleAssignments.map(assignmentCard) : NATIVE&&!live.account?<div className="empty"><BookOpen size={27}/><h3>连接 Canvas</h3><p>连接后展示你的真实作业、提交状态和截止日期。</p><button className="button primary" style={{marginTop:15}} onClick={()=>setDialog('login')}>连接账号</button></div>:<Empty title={NATIVE&&live.busy?'正在同步作业':'这里暂时没有作业'} text={filter === 'pending' ? '当前筛选下没有待完成作业。' : '换一个日期或课程看看。'}/>}</div>
            <div className="sync-caption"><ShieldCheck size={12}/>{NATIVE&&state.syncedAt===0?'等待首次同步':'最近刷新'} {state.syncedAt>0&&new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(state.syncedAt)} · {NATIVE?'自动检查更新':'演示状态保存在本机'}</div>
          </div></div>}
          {tab === 'courses' && !activeCourse && <>
            <div className="page-heading"><div><p className="eyebrow">{NATIVE?'当前学期':'示例课程'}</p><h1>我的课程<span className="heading-dot">.</span></h1></div><span className="count-label">{courses.length} 门</span></div><TermFilter courses={allCourses} value={prefs.term} onChange={setTerm}/><div className="local-filters"><button className={showHiddenCourses?'selected':''} onClick={()=>setShowHiddenCourses(!showHiddenCourses)}>{showHiddenCourses?'返回课程':'已移除课程'} {termCourses.filter(c=>prefs.hiddenCourses.includes(c.id)).length}</button></div>
            <label className="search-field"><Search size={17}/><input placeholder="搜索课程名称或课程代码" aria-label="搜索课程" value={courseQuery} onChange={e=>setCourseQuery(e.target.value)}/>{courseQuery && <button aria-label="清除搜索" onClick={()=>setCourseQuery('')}><X size={16}/></button>}</label>
            {!NATIVE&&<button className="continue-card" onClick={()=>{navigate('recordings');setVideo('net');}}><div className="play-round"><Play size={16} fill="currentColor"/></div><div><small>继续上次学习</small><strong>计算机网络 · 第 5 讲</strong><span>已看到 12:34 / 50:12</span></div><ChevronRight size={18}/></button>}
            <div className="course-grid">{(showHiddenCourses?termCourses.filter(c=>prefs.hiddenCourses.includes(c.id)):courses).filter(c=>`${c.name}${c.code}`.toLowerCase().includes(courseQuery.toLowerCase())).map(c=><ItemShell key={c.id} label={c.name} onActions={()=>setItemActions({kind:'course',id:c.id})}><button className={`course-card ${c.color}`} onClick={()=>{setCourseId(c.id);setCourseSection('files');}}><div className="course-card-top"><Glyph course={c} size={28}/><span className="course-code">{prefs.pinnedCourses.includes(c.id)&&<Pin size={12} aria-label="已置顶"/>}{c.code}</span></div><h2>{c.name}</h2><p>{c.teacher}</p><div className="course-card-bottom"><span><FolderOpen size={12}/>{NATIVE&&!c.filesLoaded?"课程资料":`${c.files.length} 份资料`}</span><span>{pending.filter(a=>a.courseId===c.id).length} 项待办 <ArrowRight size={13}/></span></div></button></ItemShell>)}</div>
            {!(showHiddenCourses?termCourses.filter(c=>prefs.hiddenCourses.includes(c.id)):courses).some(c=>`${c.name}${c.code}`.toLowerCase().includes(courseQuery.toLowerCase())) && <Empty icon={<Search size={28}/>} title="没有找到课程" text="试试课程名称或课程代码。"/>}

          </>}
          {tab === 'courses' && activeCourse && <>
            <BackButton onClick={()=>setCourseId(null)}>返回我的课程</BackButton>
            <div className={`course-detail-hero ${activeCourse.color}`}><Glyph course={activeCourse} size={30}/><p>{activeCourse.code}{!NATIVE?' · 秋季学期':''}</p><h1>{activeCourse.name}</h1><span>{activeCourse.teacher}</span></div>
            <div className="underlined-tabs">{[{id:'files',label:'课程资料'},{id:'assignments',label:'课程作业'},{id:'syllabus',label:'课程大纲'}].map(s=><button key={s.id} className={courseSection===s.id?'selected':''} onClick={()=>setCourseSection(s.id)}>{s.label}</button>)}</div>
            {courseSection === 'files' && reading?.courseId===activeCourse.id&&<DocumentReader key={reading.file.id} pane={pane==='primary'?'left':'right'} scope={scope} accountId={live.account?.accountId} courseId={activeCourse.id} file={activeCourse.files.find(f=>f.id===reading.file.id)||reading.file} initialPage={reading.page} onPage={page=>setReading(old=>old?{...old,page}:null)} onClose={()=>{setReading(null);if(assignmentReturn){setDetail(assignmentReturn);setAssignmentReturn(undefined)}}} onAi={payload=>openAi(reading.file.name,payload||{mode:'file',args:{file:reading.file.raw,courseId:activeCourse.id,fileName:reading.file.name}})}/>}{courseSection === 'files' && reading?.courseId!==activeCourse.id&&<><div className="section-heading"><h2>全部资料 <span>{activeCourse.files.length}</span></h2><div className="file-refresh-tools">{NATIVE&&<button className="text-button" disabled={activeCourse.fileLoading} onClick={()=>void live.files(activeCourse,true).catch(e=>notify(String(e)))}><RefreshCw size={13}/>刷新列表</button>}<button className="text-button" onClick={()=>{activeCourse.files.forEach(f=>enqueue(f,activeCourse.id));notify(NATIVE?'正在加入系统下载队列':'课程资料已加入演示下载队列');}}><RefreshCw size={13}/>同步资料</button></div></div>{activeCourse.fileLoading&&<div className="file-loading"><LoaderCircle size={16} className="spin"/>正在更新资料…</div>}{activeCourse.fileError&&<div role="alert" className="notice amber">{activeCourse.fileError}</div>}<label className="search-field compact-search"><Search size={16}/><input aria-label="搜索课程资料" placeholder="搜索资料名称或扩展名" value={fileQuery} onChange={e=>setFileQuery(e.target.value)}/>{fileQuery&&<button aria-label="清除资料搜索" onClick={()=>setFileQuery('')}><X size={16}/></button>}</label>{fileRows(activeCourse)}{!activeCourse.fileLoading&&!activeCourse.files.some(f=>f.name.toLocaleLowerCase().includes(fileQuery.toLocaleLowerCase().trim()))&&<Empty title={fileQuery?'没有匹配的资料':'暂无课程资料'} text={fileQuery?'换个名称或扩展名试试。':'平台尚未提供资料，可稍后刷新列表。'}/>}<div className="notice"><ExternalLink size={16}/><p>{NATIVE?'点击文件名预览，也可下载、分享或用外部应用打开。':'下载后交给手机已有应用打开。Demo 不下载真实课件，可在下载页导出演示说明。'}</p></div>{NATIVE?<button className="button secondary full" onClick={()=>{void live.login().then(r=>notify(r.cloud?'交大云盘验证成功':'云盘尚未通过验证')).catch(e=>notify(String(e)));}}>验证录播与云盘登录 <CloudUpload size={16}/></button>:<button className="button secondary full" onClick={()=>{setDialog('login');}}>上传资料到交大云盘 <CloudUpload size={16}/></button>}</>}
            {courseSection === 'assignments' && <div className="assignment-list padded-top">{sortAssignments(assignments.filter(a=>a.courseId===activeCourse.id)).map(assignmentCard)}</div>}
            {NATIVE&&courseSection==='syllabus'&&<NativeSyllabus course={activeCourse}/>}
            {!NATIVE&&courseSection === 'syllabus' && <article className="syllabus"><span className="pill gray">示例大纲</span><h2>课程介绍</h2><p>本课程通过理论学习与实验实践，帮助理解核心概念、建立知识体系，并培养独立分析与解决问题的能力。</p><h2>课程安排</h2>{['基础概念与问题导论','核心原理与案例分析','实验实践与课程总结'].map((s,i)=><div className="syllabus-row" key={s}><span>0{i+1}</span><div><strong>{s}</strong><p>第 {i*5+1} — {i*5+5} 周</p></div></div>)}<div className="notice">所有大纲内容均为演示示例。</div></article>}
          </>}
          {NATIVE&&!playbackActive&&tab==='recordings'&&<div className="empty"><Video size={26}/><p>点击此栏继续查看录播</p></div>}{NATIVE&&playbackActive&&visitedRecordings&&(!embedded||tab==='recordings')&&<div hidden={tab!=='recordings'}><NativeRecordings pane={pane==='primary'?'left':'right'} live={live} courses={courses} allCourses={allCourses} term={prefs.term} setTerm={setTerm} notify={notify} onAi={openAi} target={lectureTarget} onTargetHandled={()=>setLectureTarget(undefined)} obscured={tab!=='recordings'||(aiOpen&&!aiDocked)||dialog!==null||itemActions!==null}/></div>}
          {!NATIVE && tab === 'recordings' && !video && <>
            <div className="page-heading"><div><p className="eyebrow">课程录播</p><h1>课堂录播<span className="heading-dot">.</span></h1></div><span className="count-label">资料库</span></div>
            <TermFilter courses={allCourses} value={prefs.term} onChange={setTerm}/>
            <div className="recording-course-grid">{courses.map(c=><button className="recording-course-card" key={c.id} onClick={()=>{setVideo(c.id);setVideoTime(c.id==='net'?754:0);}}><Video size={20}/><strong>{c.name}</strong><span>查看录播<ChevronRight size={13}/></span></button>)}</div>
          </>}
          {!NATIVE && tab === 'recordings' && video && <>
            <BackButton onClick={()=>{setVideo(null);setVideoPlaying(false);}}>返回课堂录播</BackButton>
            <div className="learning-layout"><section className="learning-player" aria-label="课堂播放区">
            <div className="player"><div className={`player-art ${angle==='teacher'?'teacher-view':''}`}><span className="player-demo">交互演示 · 非真实视频</span>{angle==='teacher'?<div className="teacher-placeholder"><UserRound size={50}/><span>教师机位示意</span></div>:<><span className="slide-topline">CS3310 · CHAPTER 05</span><h2>{video==='net'?'网络层：转发与路由':courseById(video).name}</h2><div className="slide-bullet"><span>01</span> 转发 · 从输入到输出</div><div className="slide-bullet"><span>02</span> 路由 · 选择端到端路径</div><div className="slide-formula">Network layer = Forwarding + Routing</div></>}{angle==='dual'&&<div className="mini-teacher"><UserRound size={24}/><small>教师机位</small></div>}</div><div className="player-controls"><input aria-label="播放进度" type="range" min="0" max="3012" value={videoTime} onChange={e=>setVideoTime(Number(e.target.value))}/><div><button aria-label={videoPlaying?'暂停演示播放':'开始演示播放'} onClick={()=>setVideoPlaying(!videoPlaying)}>{videoPlaying?<Pause size={18}/>:<Play size={18}/>}</button><span>{timeString(videoTime)} <i>/ 50:12</i></span><Volume2 size={15}/><ChoicePicker label="播放倍速" value={speed} onChange={setSpeed} options={['0.75','1.0','1.25','1.5','2.0'].map(value=>({value,label:`${value}×`}))}/></div></div></div>
            <div className="video-title"><span className={`course-label ${courseById(video).color}`}>{courseById(video).name}</span><h2>{video==='net'?'第 5 讲 · 网络层与路由算法':'第 4 讲 · 核心概念与实践'}</h2><p>示例课堂 · 50 分钟 · 已有字幕</p></div>
            <div className="angle-switch">{[{id:'slide',label:'课件机位'},{id:'teacher',label:'教师机位'},{id:'dual',label:'双机位'}].map(a=><button className={angle===a.id?'selected':''} key={a.id} onClick={()=>setAngle(a.id)}>{a.label}</button>)}</div>
            <div className="video-actions"><button onClick={()=>openAi('录播 · 网络层与路由算法')}><Sparkles size={17}/>总结本堂课</button><button onClick={()=>enqueue({id:`video-${video}`,name:`${courseById(video).name} 第5讲.mp4`},video)}><ArrowDownToLine size={17}/>下载录播</button></div>
            </section><section className="learning-materials" aria-label="课堂学习资料">
            <div className="underlined-tabs">{[{id:'chapters',label:'章节'},{id:'subtitles',label:'字幕'},{id:'slides',label:'课件切片'}].map(s=><button className={videoSection===s.id?'selected':''} key={s.id} onClick={()=>setVideoSection(s.id)}>{s.label}</button>)}</div>
            {videoSection==='chapters'&&<div className="chapter-list">{[{time:0,title:'课程回顾与本讲导入'},{time:754,title:'转发与路由的区别'},{time:1390,title:'IPv4 数据报结构'},{time:2168,title:'最长前缀匹配'}].map((c,i)=><button key={c.time} className={videoTime>=c.time&&(i===3||videoTime<[754,1390,2168,3013][i])?'current':''} onClick={()=>setVideoTime(c.time)}><span>0{i+1}</span><strong>{c.title}</strong><small>{timeString(c.time)}</small></button>)}</div>}
            {videoSection==='subtitles'&&<><label className="search-field"><Search size={15}/><input placeholder="搜索字幕" aria-label="搜索字幕" value={subtitleQuery} onChange={e=>setSubtitleQuery(e.target.value)}/></label>{subtitleLines.filter(s=>s.text.includes(subtitleQuery)).map(s=><button className="subtitle-line" key={s.time} onClick={()=>setVideoTime(s.time)}><span>{s.label}</span><p>{s.text}</p></button>)}<button className="button secondary full" onClick={()=>exportText('示例字幕.txt','【演示字幕，非真实课程资料】\n'+subtitleLines.map(s=>`${s.label} ${s.text}`).join('\n'))}><Download size={16}/>导出演示字幕</button></>}
            {videoSection==='slides'&&<div className="slide-snippet"><div><span className="small-label">示例切片 · 12:34</span><h3>转发与路由</h3><p>Forwarding / Routing</p></div><p className="subtle">OCR 示例：网络层负责将数据从源主机传输到目标主机。切片与时间点为演示内容。</p><button className="text-button" onClick={()=>setVideoTime(754)}>跳转至 12:34 <ArrowRight size={14}/></button></div>}
            </section></div>
          </>}
          {tab === 'downloads' && <>
            <div className="page-heading"><div><p className="eyebrow">资料准备好，学习随时开始</p><h1>下载中心<span className="heading-dot">.</span></h1></div><Download size={23} className="subtle"/></div>
            <div className="download-stats"><div><strong>{state.downloads.filter(d=>d.status==='running').length}</strong><span>进行中</span></div><div><strong>{state.downloads.filter(d=>d.status==='completed').length}</strong><span>已完成</span></div><div><strong>{state.downloads.length}</strong><span>全部任务</span></div></div>
            <div className="notice"><CircleHelp size={17}/><p>{NATIVE?'下载由安卓系统在后台执行，完成后可打开、分享或导出。':'这里模拟下载进度与任务恢复，不下载真实资料。完成后可导出一份演示说明文件。'}</p></div>
            <div className="section-heading"><h2>下载任务</h2>{!NATIVE&&<button className="text-button" onClick={()=>setState(s=>({...s,downloads:s.downloads.filter(d=>d.status==='running')}))}>清理记录</button>}</div>
            {NATIVE?<NativeDownloadList tasks={state.downloads} notify={notify} scope={scope}/>:state.downloads.length===0?<Empty icon={<FolderOpen size={30}/>} title="还没有下载任务" text="前往课程资料或录播页添加一项试试。"/>:[...state.downloads].reverse().map(d=><div className="download-card" key={d.id}><div className="download-card-main"><span className="download-file"><FileText size={23}/></span><div><strong>{d.name}</strong><span>{courseById(d.courseId).name}</span></div><span className={`pill ${d.status==='completed'?'green':d.status==='running'?'blue':'gray'}`}>{d.status==='completed'?'已完成':d.status==='cancelled'?'已取消':`${d.progress}%`}</span></div>{d.status==='running'?<><div className="download-progress"><i style={{width:`${d.progress}%`}}/></div><div className="download-footer"><span><LoaderCircle size={12} className="spin"/>演示下载中</span><button onClick={()=>setState(s=>({...s,downloads:s.downloads.map(t=>t.id===d.id?{...t,status:'cancelled'}:t)}))}>取消</button></div></>:<div className="download-footer"><span>{d.status==='completed'?<><CheckCircle2 size={12}/>演示任务已完成</>:'任务已停止'}</span><div className="download-actions">{d.status==='completed'&&<button onClick={()=>{exportText(`${d.name}.演示说明.txt`,`Canvas 随行 · 演示文件\n\n原文件名：${d.name}\n课程：${courseById(d.courseId).name}\n\n本文件是交互 Demo 导出的说明，不是真实课件。正式 APK 将使用 Android 系统下载与外部应用打开。`);notify('已导出演示说明，不是真实课件');}}><ExternalLink size={12}/>导出说明</button>}<button onClick={()=>setState(s=>({...s,downloads:s.downloads.filter(t=>t.id!==d.id)}))}><Trash2 size={12}/>删除</button>{d.status!=='completed'&&<button onClick={()=>setState(s=>({...s,downloads:s.downloads.map(t=>t.id===d.id?{...t,status:'running',progress:0}:t)}))}><RefreshCw size={12}/>重试</button>}</div></div>}</div>)}
          </>}
          {tab === 'assistant' && <AssistantHome scope={scope} onOpen={openAi}/>}
          {tab === 'profile' && <>
            <div className="page-heading"><div><p className="eyebrow">偏好设置</p><h1>设置<span className="heading-dot">.</span></h1></div></div>
            <div className="profile-card"><ProfileAvatar scope={scope}/><div><h2>{NATIVE&&live.name&&live.name!=='同学'?live.name:'我的学习空间'}</h2><p>上海交通大学</p><span className="pill gray">{NATIVE?(live.account?'已连接':'未连接'):'演示账号'}</span></div><button className="text-button" onClick={()=>setDialog('login')}>连接账号<ChevronRight size={13}/></button></div>
            <ThemePicker mode={appearance.mode} onChange={appearance.setMode}/><ReplyReminderSetting key={scope} scope={scope}/><div className="settings-group"><button onClick={()=>setDialog('reminders')}><span className="setting-icon amber"><BellRing size={20}/></span><div><strong>作业截止提醒</strong><small>{state.settings.enabled?'24 小时 / 2 小时 / 30 分钟':'已关闭'}</small></div><ChevronRight size={17}/></button><button onClick={()=>setDialog('notifications')}><span className="setting-icon blue"><Bell size={20}/></span><div><strong>提醒消息</strong><small>{unread} 条未读消息</small></div><ChevronRight size={17}/></button><button onClick={()=>openAi(NATIVE?'Canvas 学习助手':'学习助手 · 示例课程')}><span className="setting-icon purple"><Sparkles size={20}/></span><div><strong>Canvas 学习助手</strong><small>课程查询 · 文件问答 · 课堂总结</small></div><ChevronRight size={17}/></button><button onClick={()=>setDialog('models')}><span className="setting-icon green"><Settings2 size={20}/></span><div><strong>AI 服务配置</strong><small>服务地址 · 模型</small></div><ChevronRight size={17}/></button></div>
            <div className="settings-group"><button onClick={()=>{if(NATIVE){void runtime.native('clearCache').then(()=>notify('临时文件与 AI 课件缓存已清理，下载文件仍保留')).catch(e=>notify(String(e)));}else{setState(initialState());notify('已恢复初始示例数据');}}}><span className="setting-icon gray"><RefreshCw size={20}/></span><div><strong>{NATIVE?'清理临时缓存':'重置演示数据'}</strong><small>{NATIVE?'保留课程下载与账号配置':'恢复作业、提醒与下载初始状态'}</small></div><ChevronRight size={17}/></button><button onClick={()=>setDialog('about')}><span className="setting-icon gray"><CircleHelp size={20}/></span><div><strong>关于 Canvas 随行</strong><small>{NATIVE?`Android · v${APP_VERSION} 个人版`:`交互预览 · v${APP_VERSION}`}</small></div><ChevronRight size={17}/></button></div>
            <div className="privacy-note"><ShieldCheck size={21}/><p>{NATIVE?'账号凭据加密保存在本机':'你的真实课程还没有接入'}<br/><small>{NATIVE?'Token、登录凭据与模型 Key 使用加密存储。':'此 Demo 不需要真实 Token、密码或 API Key。'}</small></p></div>
          </>}
        </main>
        {!workspacePad&&<nav className="bottom-nav" aria-label="主导航">{navItems.map(n=><button aria-current={tab===n.id?'page':undefined} key={n.id} className={tab===n.id?'selected':''} onClick={()=>navigate(n.id)}><span><n.icon size={21} strokeWidth={tab===n.id?2:1.7}/>{n.id==='downloads'&&state.downloads.some(d=>d.status==='running')&&<i/>}</span><strong>{n.name}</strong></button>)}{workspaceToggle&&<div className="nav-layout-toggle">{workspaceToggle}</div>}</nav>}
        <div className="home-indicator"><span/></div>
      </div>
    </div>

    {toast && <div className="toast" role="status"><CheckCircle2 size={17}/><span>{toast}</span>{undo&&<button className="undo-button" onClick={()=>{undo.run();setUndo(null);}}><Undo2 size={14}/>撤销</button>}<button onClick={()=>{setToast('');setUndo(null);}} aria-label="关闭提示"><X size={15}/></button></div>}

    {NATIVE&&assignment&&selectedCourse&&<Modal title="作业详情" subtitle={selectedCourse.name} onClose={()=>{if(!submitting)setDetail(null);}}><NativeAssignmentPanel onPreview={file=>{setAssignmentReturn(assignment.id);setDetail(null);setCourseId(assignment.courseId);setCourseSection('files');setReading({courseId:assignment.courseId,file});navigate('courses')}} assignment={assignment} live={live} notify={notify} onDone={()=>setDetail(null)} onBusy={setSubmitting}/></Modal>}
    {!NATIVE && assignment && selectedCourse && <Modal title={submitResult?'演示提交完成':'作业详情'} subtitle={selectedCourse.name} onClose={()=>{if(!submitting)setDetail(null);}}>
      {submitResult?<div className="submission-success"><SubmissionCelebration show={celebration} onFinished={()=>setCelebration(false)}/><span><Check size={34}/></span><h2>这项待办，完成了。</h2><p>示例提交状态已更新，总览和提醒也已同步。<br/>没有向真实 Canvas 上传任何内容。</p><div className="receipt"><span>提交状态<strong>{assignment.submission==='late'?'演示迟交':'演示已提交'}</strong></span><span>提交时间<strong>{formatDate(assignment.submittedAt!)}</strong></span>{assignment.attachments?.map(n=><span key={n}><FileText size={14}/>{n}</span>)}</div><button className="button primary full" onClick={()=>{setDetail(null);navigate('dashboard');setFilter('submitted');}}>查看控制面板<ArrowRight size={16}/></button></div>:<>
        <div className="assignment-detail-heading"><span className={`pill ${statusOf(assignment,now).tone}`}>{statusOf(assignment,now).text}</span><h2>{assignment.title}</h2><div><CalendarDays size={14}/>{formatDate(assignment.dueAt)} 截止</div><p className={assignment.dueAt<=now?'danger':'warning'}>{assignment.submission==='unsubmitted'?countdown(assignment.dueAt,now):`提交于 ${formatDate(assignment.submittedAt!)}`}</p></div>
        <div className="detail-section"><h3>作业要求</h3><p>{assignment.description}</p></div>
        {assignment.submission!=='unsubmitted'?<div className="detail-section"><h3>已提交附件</h3>{assignment.attachments?.map(n=><div className="attachment-row" key={n}><FileText size={18}/><span>{n}</span><CheckCircle2 size={17} className="success"/></div>)}<div className="notice"><CheckCircle2 size={16}/>已提交作业不会再产生截止提醒。</div></div>:<>
          <div className="detail-section"><h3>提交附件 <span className="subtle">{files.length} 个</span></h3><input ref={uploadInput} data-testid="attachment-input" type="file" multiple style={{display:'none'}} onChange={e=>{const next=Array.from(e.target.files||[]);if(next.some(f=>f.size>50*1024*1024)){notify('演示附件限每个 50 MB 以内');return;}setFiles(current=>[...current,...next].filter((f,i,all)=>all.findIndex(a=>a.name===f.name&&a.size===f.size)===i));setConfirmSubmit(false);e.target.value='';}}/><button className="upload-zone" onClick={()=>uploadInput.current?.click()} disabled={submitting}><UploadCloud size={27}/><strong>选择作业附件</strong><span>支持多个文件 · 仅在本机演示，不上传</span></button>{files.map((f,i)=><div className="attachment-row" key={`${f.name}-${i}`}><FileText size={18}/><span>{f.name}<small>{f.size===0?'空文件':`${Math.max(1,Math.round(f.size/1024))} KB`}</small></span><IconButton label={`移除 ${f.name}`} onClick={()=>{if(!submitting){setFiles(files.filter((_,j)=>j!==i));setConfirmSubmit(false);}}}><X size={16}/></IconButton></div>)}</div>
          {confirmSubmit&&<div className="notice amber"><ShieldCheck size={18}/><p>确认演示提交给「{selectedCourse.name}」的「{assignment.title}」，共 {files.length} 个附件。此操作只更新本机示例状态。</p></div>}
          <button className="button primary full" disabled={!files.length||submitting} onClick={()=>confirmSubmit?submit():setConfirmSubmit(true)}>{submitting?<><LoaderCircle size={17} className="spin"/>正在演示提交…</>:confirmSubmit?<><Check size={17}/>确认演示提交</>:<><CloudUpload size={17}/>检查并提交</>}</button><p className="form-caption">演示提交后可在“我的”中重置数据。</p>
        </>}
      </>}
    </Modal>}

    {dialog==='reminders'&&<Modal title="作业截止提醒" subtitle="只提醒尚未提交的作业" onClose={()=>setDialog(null)}>
      <div className="reminder-hero"><BellRing size={25}/><div><h3>让截止日期有个提前量</h3><p>已提交的作业，自动停止后续提醒。</p></div></div>
      <label className="toggle-row"><span><strong>开启作业提醒</strong><small>在应用内生成截止与逾期提醒</small></span><input type="checkbox" checked={state.settings.enabled} onChange={e=>setState(s=>({...s,settings:{...s.settings,enabled:e.target.checked}}))}/><i className="toggle"/></label>
      <div className="detail-section"><h3>截止前提醒</h3><div className="reminder-options">{[{value:24*HOUR,label:'24 小时前'},{value:2*HOUR,label:'2 小时前'},{value:HOUR/2,label:'30 分钟前'}].map(o=><button key={o.value} disabled={!state.settings.enabled} aria-pressed={state.settings.offsets.includes(o.value)} className={state.settings.offsets.includes(o.value)?'selected':''} onClick={()=>setState(s=>({...s,settings:{...s.settings,offsets:s.settings.offsets.includes(o.value)?s.settings.offsets.filter(v=>v!==o.value):[...s.settings.offsets,o.value]}}))}>{state.settings.offsets.includes(o.value)&&<Check size={13}/>} {o.label}</button>)}</div></div>
      <label className="toggle-row"><span><strong>逾期未提交提醒</strong><small>截止后提醒一次，不重复打扰</small></span><input type="checkbox" disabled={!state.settings.enabled} checked={state.settings.overdue} onChange={e=>setState(s=>({...s,settings:{...s.settings,overdue:e.target.checked}}))}/><i className="toggle"/></label>
      <div className="notice"><CircleHelp size={17}/><p>{NATIVE?'前台每分钟刷新；后台定期核对提交状态，并根据最近同步安排提醒。系统省电策略可能推迟通知。':'Demo 在页面打开时检查提醒；可开启浏览器通知并预览效果。关闭页面后的后台提醒将在正式 APK 中实现。'}</p></div>
      <div className="button-row"><button className="button secondary" onClick={requestNotifications}><Bell size={16}/>{NATIVE?'系统通知权限':'浏览器通知'}</button><button className="button primary" onClick={demonstrateReminder}><BellRing size={16}/>预览提醒</button></div>
    </Modal>}
    {dialog==='notifications'&&<Modal title="提醒消息" subtitle={`${unread} 条未读${NATIVE?' · 作业截止提醒':' · 仅包含演示作业'}`} onClose={()=>setDialog(null)}>
      <div className="section-heading"><span className="subtle">截止与提交动态</span><button className="text-button" onClick={()=>setState(s=>({...s,reminders:s.reminders.map(r=>({...r,read:true}))}))}><CheckCheck size={14}/>全部已读</button></div>
      <TermFilter courses={allCourses} value={prefs.term} onChange={setTerm}/>{visibleReminders.length?visibleReminders.map(r=><button key={r.id} className={`reminder-message ${r.read?'read':''}`} onClick={()=>{setState(s=>({...s,reminders:s.reminders.map(n=>n.id===r.id?{...n,read:true}:n)}));setDialog(null);openAssignment(r.assignmentId);}}><span className="message-icon"><BellRing size={18}/></span><div><strong>{r.title}{!r.read&&<i/>}</strong><p>{r.body}</p><small>{formatDate(r.createdAt)} · {NATIVE?'最近同步状态':'示例数据'}</small></div><ChevronRight size={15}/></button>):<Empty icon={<Bell size={30}/>} title="没有提醒消息" text="开启作业提醒后，会在临近截止时显示在这里。"/>}<button className="button secondary full" onClick={()=>setDialog('reminders')}><Settings2 size={15}/>管理提醒</button>
    </Modal>}
    <CompletionSummary scope={scope+':'+prefs.term} assignments={scopedAssignments}/>
    {dialog==='search'&&<Modal title="搜索" className="study-search-overlay" onClose={()=>setDialog(null)}><label className="search-field"><Search size={18}/><input autoFocus placeholder="课程、作业、课件、字幕或笔记" aria-label="全局搜索" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="study-search-body"><div className="search-results"><p className="search-category">课程与作业</p>{courses.filter(c=>`${c.name}${c.code}`.toLowerCase().includes(query.toLowerCase())).slice(0,query.trim()?24:6).map(c=><button key={c.id} onClick={()=>{navigate('courses');setCourseId(c.id);setCourseSection('files');setDialog(null);}}><Glyph course={c} size={19}/><span><strong>{c.name}</strong><small>课程 · {c.code}</small></span><ChevronRight size={15}/></button>)}{assignments.filter(a=>a.title.toLowerCase().includes(query.toLowerCase())).slice(0,query.trim()?24:6).map(a=><button key={a.id} onClick={()=>{setDialog(null);openAssignment(a.id);}}><FileText size={20}/><span><strong>{a.title}</strong><small>作业 · {formatDate(a.dueAt)} 截止</small></span><ChevronRight size={15}/></button>)}</div><Suspense fallback={<p className="paragraph">正在读取本地资料库…</p>}><StudySearch scope={scope} courses={courses} query={query} defaultCourseId={activeCourse?.id} loadFiles={live.files} onOpen={openStudyHit}/></Suspense></div></Modal>}
    {NATIVE&&dialog==='login'&&<Modal title="连接交大本部" subtitle="账号与本机身份验证" onClose={()=>setDialog(null)}><AccountPanel live={live} notify={notify} onDone={()=>setDialog(null)}/></Modal>}
    {!NATIVE&&dialog==='login'&&<Modal title="连接交大本部 Canvas" subtitle="此步骤展示正式版的登录设计" onClose={()=>setDialog(null)}><div className="login-illustration"><GraduationCap size={42}/><span>oc.sjtu.edu.cn</span></div><div className="login-step"><span>1</span><div><strong>连接 Canvas Token</strong><p>用于读取课程、文件和作业状态。</p></div></div><div className="login-step"><span>2</span><div><strong>本机完成 jAccount 验证</strong><p>用于访问录播和交大云盘，无需另一台设备扫码。</p></div></div><div className="notice"><ShieldCheck size={18}/><p>前端 Demo 暂未接入身份验证，不收集真实 Token、密码或 API Key。</p></div><button className="button primary full" onClick={()=>{setDialog(null);notify('正在使用演示账号 · 无需填写真实凭据');}}>继续使用演示账号<ArrowRight size={16}/></button></Modal>}
    {NATIVE&&dialog==='models'&&<Modal title="AI 服务配置" onClose={()=>setDialog(null)}><ModelPanel live={live} notify={notify} onDone={()=>setDialog(null)}/></Modal>}
    {!NATIVE&&dialog==='models'&&<Modal title="AI 服务配置" subtitle="正式 APK 的配置预览" onClose={()=>setDialog(null)}><div className="model-card"><Sparkles size={22}/><div><strong>自定义模型服务</strong><span>服务地址 · 模型名称 · API Key</span></div><span className="pill gray">待接入</span></div><p className="paragraph">正式版支持多个服务商与自定义兼容接口。当前 Demo 使用预设回复，不发送文件，也不产生模型费用。</p><button className="button primary full" onClick={()=>{setDialog(null);openAi('学习助手 · 示例课程');}}>体验问答交互 <ArrowRight size={16}/></button></Modal>}
    {NATIVE&&dialog==='about'&&<Modal title="Canvas 随行" subtitle={`Android ${APP_VERSION} · 个人版`} onClose={()=>setDialog(null)}><p className="paragraph">交大课程助手。课程、作业、资料、录播与截止提醒，由你配置的账号访问。课程资料、字幕片段与截图可用于学习助手提问。</p><div className="notice">使用同签名的新版 APK 覆盖安装更新。</div><button className="button secondary full" onClick={()=>{void live.logout().then(()=>{setDialog(null);notify('已退出账号并取消未完成任务');}).catch(e=>notify(String(e)));}}>退出当前账号</button></Modal>}
    {!NATIVE&&dialog==='about'&&<Modal title="Canvas 随行" subtitle={`SJTU Canvas Helper · Android ${APP_VERSION}`} onClose={()=>setDialog(null)}><div className="about-logo"><BrandIcon/></div><p className="paragraph">面向交大本部的移动学习助手。本演示重点验证作业控制面板、截止提醒、课程资料、录播与任务流程。</p><div className="notice">课程、日期、提交和播放画面均为示例。真实账号、安卓后台下载与系统提醒尚未接入。</div><p className="paragraph subtle">基于 Okabe-Rintarou-0 / SJTU-Canvas-Helper 的安卓移植规划，保留上游 MIT 许可。本页为新增前端原型。</p><button className="button secondary full" onClick={()=>exportText('Canvas随行_演示反馈.txt','Canvas 随行 · Demo 反馈\n\n1. 作业总览与排序：\n2. 提交流程：\n3. 提醒方式：\n4. 课程与录播界面：\n5. 希望调整的地方：\n')}>导出反馈模板<ArrowDownToLine size={15}/></button></Modal>}
    {itemActions&&<Modal title={itemActions.kind==='course'?'管理课程':'管理作业'} subtitle={itemActions.kind==='course'?courseById(itemActions.id).name:state.assignments.find(a=>a.id===itemActions.id)?.title} onClose={()=>setItemActions(null)}><div className="action-sheet"><p>操作保存在当前账号的手机中，随同步保留。</p>{itemActions.kind==='course'&&<button className="button secondary full" onClick={()=>togglePin(itemActions.id)}><Pin size={17}/>{prefs.pinnedCourses.includes(itemActions.id)?'取消课程置顶':'置顶这门课程'}</button>}{itemActions.kind==='assignment'&&!prefs.ignoredAssignments.includes(itemActions.id)&&!prefs.hiddenAssignments.includes(itemActions.id)&&<button className="button secondary full" onClick={()=>changeItem('assignment',itemActions.id,'ignore')}><Bell size={17}/>忽略这项作业 · 停止提醒</button>}{(itemActions.kind==='course'?prefs.hiddenCourses.includes(itemActions.id):prefs.ignoredAssignments.includes(itemActions.id)||prefs.hiddenAssignments.includes(itemActions.id))&&<button className="button primary full" onClick={()=>changeItem(itemActions.kind,itemActions.id,'restore')}><RefreshCw size={17}/>恢复显示与提醒</button>}<button className="button secondary full danger" onClick={()=>changeItem(itemActions.kind,itemActions.id,'hide')}><Trash2 size={17}/>从本机列表移除</button><div className="notice">不会删除 Canvas 上的课程、作业或提交记录。移除的课程与作业停止提醒，可在“已移除”中恢复。</div></div></Modal>}{!aiOpen&&(chatProgress.busy||chatProgress.completed)&&<button className="chat-progress-pill" onClick={()=>{const job=latestChat(scope);if(job){setAiPayload({...job.row.payload,args:{...job.row.payload.args,conversationId:job.row.id}});setAiContext(job.row.title)}setAiVisited(true);setAiOpen(true)}}>{chatProgress.busy?<LoaderCircle size={14} className="spin"/>:<Sparkles size={14}/>} {chatProgress.busy?'AI 正在回答':'回答已完成'}</button>}{aiVisited&&<AiChat onPlayback={resumeAiVideo} context={aiContext} payload={aiPayload} storageScope={scope} docked={aiDocked} open={aiOpen} onClose={()=>setAiOpen(false)} modelName={live.account?.modelName} onTime={seekAiReference} onConfigure={()=>{setAiOpen(false);setDialog('models');}}/>}
  </div>;
}
