import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AccountConfig, Recording } from './runtime';
import {readWorkspaceRecord,writeWorkspaceRecord} from './workspaceStore';

export type Tab = 'dashboard' | 'courses' | 'recordings' | 'downloads' | 'profile' | 'assistant';
export function accountScope(account: AccountConfig | null) {
  return account ? JSON.stringify([account.accountId, account.identityId || '']) : 'anonymous';
}
export function rememberedAccountPrefixes(scope:string,account?:Pick<AccountConfig,'accountId'|'identityId'>){
  const prefixes=[`canvas-page-v1:${scope}`,`canvas-scroll-v1:${scope}`,`canvas-workspace-v1:${scope}`,`canvas-layout-preview-v2:${scope}`,`canvas-lecture-v1:${scope}`,`canvas-video-position-v1:${scope}:`,`canvas-personal-schedule-v1:${scope}`,`canvas-chat-v1:${scope}:`,`canvas-slide-follow-v1:${scope}:`,`canvas-slide-links-v1:${scope}:`,`canvas-avatar-v1:${scope}`,`canvas-ai-presets-v1:${scope}`,`canvas-note-draft-v1:${scope}:`,`canvas-open-file-v1:${scope}`,`canvas-lecture-desk-v1:${scope}:`,`canvas-chat-window-v2:${scope}:`,`canvas-study-recent:${scope}`,`canvas-study-basket:${scope}`];
  if(account)prefixes.push(`canvas-calendar-reminder:${account.accountId}:${account.identityId||''}`,`canvas-resources-v2:${account.accountId}:${account.identityId||''}`,`canvas-cache:${account.accountId}`,`canvas-ui-v2:${account.accountId}:${account.identityId||''}`);
  return prefixes;
}
/** Keep the existing left-pane key for backwards compatibility; split right panes get their own memory. */
export function lectureMemoryKey(scope:string,pane:'left'|'right'='left'){return `canvas-lecture-v1:${scope}${pane==='right'?':right':''}`;}
export function clearRememberedAccountState(scope:string,account?:Pick<AccountConfig,'accountId'|'identityId'>){
  const prefixes=rememberedAccountPrefixes(scope,account);
  try{for(let index=localStorage.length-1;index>=0;index--){const key=localStorage.key(index);if(key&&prefixes.some(prefix=>key===prefix||key.startsWith(prefix)))localStorage.removeItem(key)}}catch{/* Local storage may be unavailable. */}
}
function readRememberedValue<T>(key:string,initial:T,decode:(raw:unknown)=>T){try{return decode(JSON.parse(localStorage.getItem(key)||'null'))}catch{return initial}}
export function useRememberedState<T>(key: string, initial: T, decode: (raw: unknown) => T) {
  const decodeRef=useRef(decode);decodeRef.current=decode;const initialRef=useRef(initial);initialRef.current=initial;
  const [stored,setStored]=useState(()=>({key,value:readRememberedValue(key,initial,decode)}));
  const value=stored.key===key?stored.value:readRememberedValue(key,initial,decode);
  const latest = useRef({key,value}); latest.current = {key,value};
  const revisions=useRef(new Map<string,number>()),hydratedKeys=useRef(new Set<string>());
  useLayoutEffect(()=>{if(stored.key!==key)setStored({key,value:readRememberedValue(key,initialRef.current,decodeRef.current)})},[key,stored.key]);
  useEffect(()=>{
    let active=true;const revision=revisions.current.get(key)||0;
    void readWorkspaceRecord<T>(key,'uiState','value').then(async persisted=>{
      if(!active)return;
      hydratedKeys.current.add(key);
      if((revisions.current.get(key)||0)!==revision){const current=latest.current.key===key?latest.current.value:readRememberedValue(key,initialRef.current,decodeRef.current);void writeWorkspaceRecord(key,'uiState','value',current);return;}
      if(persisted!==undefined){const restored=decodeRef.current(persisted);latest.current={key,value:restored};setStored({key,value:restored});try{localStorage.setItem(key,JSON.stringify(restored))}catch{/* Keep the restored value in memory. */}}
      else{const current=latest.current.key===key?latest.current.value:readRememberedValue(key,initialRef.current,decodeRef.current);void writeWorkspaceRecord(key,'uiState','value',current);}
    }).catch(()=>{if(active)hydratedKeys.current.add(key)});
    return()=>{active=false};
  },[key]);
  useEffect(() => {
    const save = () => { const current=latest.current.key===key?latest.current.value:value;try { localStorage.setItem(key, JSON.stringify(current)); } catch { /* State remains available in this visit. */ }if(hydratedKeys.current.has(key))void writeWorkspaceRecord(key,'uiState','value',current); };
    window.addEventListener('pagehide', save); document.addEventListener('visibilitychange', save);
    return () => { window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', save); };
  }, [key,value]);
  const setValue:Dispatch<SetStateAction<T>>=next=>setStored(old=>{
    const current=old.key===key?old.value:readRememberedValue(key,initialRef.current,decodeRef.current),resolved=typeof next==='function'?(next as (value:T)=>T)(current):next;
    revisions.current.set(key,(revisions.current.get(key)||0)+1);try{localStorage.setItem(key,JSON.stringify(resolved))}catch{/* Keep the latest value in memory. */}if(hydratedKeys.current.has(key))void writeWorkspaceRecord(key,'uiState','value',resolved);
    return{key,value:resolved};
  });
  return [value,setValue] as const;
}
export const defaultPage = {
  tab: 'dashboard' as Tab, courseId: null as string | null, courseSection: 'files', filter: 'pending',
  showHiddenCourses: false, courseFilter: 'all', courseQuery: '', assignmentQuery: '', deadlineWindow: 'all' as 'all' | 'today' | 'week' | 'overdue' | 'undated', fileQuery: '',
  video: null as string | null, videoTime: 754, speed: '1.0', angle: 'slide', videoSection: 'chapters', subtitleQuery: '',
  showCalendar: false, selectedDay: null as string | null,
};
export type PageState = typeof defaultPage;
export function decodePage(raw: unknown): PageState {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const next = { ...defaultPage };
  for (const key of Object.keys(next) as (keyof PageState)[]) {
    const item = value[key], sample = next[key];
    if (typeof item === typeof sample && (typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item) && item >= 0 || typeof item === 'string' && item.length < 1000) || sample === null && (item === null || typeof item === 'string' && item.length < 1000)) (next as Record<string, unknown>)[key] = item;
  }
  if (!['dashboard','courses','recordings','downloads','profile','assistant'].includes(next.tab)) next.tab = 'dashboard';
  if (!['files','assignments','syllabus'].includes(next.courseSection)) next.courseSection='files';
  if (!['pending','submitted','all','ignored','hidden'].includes(next.filter)) next.filter='pending';
  if (!['all','today','week','overdue','undated'].includes(next.deadlineWindow)) next.deadlineWindow='all';
  if (!['slide','teacher','dual'].includes(next.angle)) next.angle='slide';
  if (!['chapters','subtitles','slides'].includes(next.videoSection)) next.videoSection='chapters';
  if (!['0.75','1.0','1.25','1.5','2.0'].includes(next.speed)) next.speed='1.0';
  return next;
}
export function pageField<K extends keyof PageState>(page: PageState, setPage: Dispatch<SetStateAction<PageState>>, key: K): [PageState[K], Dispatch<SetStateAction<PageState[K]>>] {
  return [page[key], next => setPage(old => ({ ...old, [key]: typeof next === 'function' ? (next as (old: PageState[K]) => PageState[K])(old[key]) : next }))];
}

export function usePageScroll(scope: string, route: string) {
  const main = useRef<HTMLElement>(null);
  const key = `canvas-scroll-v1:${scope}`;
  const positions = useRef(new Map<string,Record<string,{main:number;window:number}>>());
  useLayoutEffect(() => {
    let scoped=positions.current.get(key);
    if(!scoped){scoped={};try{const value=JSON.parse(localStorage.getItem(key)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))for(const [name,position] of Object.entries(value)){const p=position as {main:number;window:number};if(p&&Number.isFinite(p.main)&&Number.isFinite(p.window)&&p.main>=0&&Number.isFinite(p.window)&&p.window>=0)scoped[name]=p;}}catch{/* Start with an empty position map. */}positions.current.set(key,scoped)}
    const element = main.current;
    let userChanged=false;
    const previous = scoped[route];
    if (element) element.scrollTop = previous?.main || 0;
    window.scrollTo({ top: previous?.window || 0, behavior: 'auto' });
    const save = () => {
      userChanged=true;
      scoped![route] = { main: element?.scrollTop || 0, window: window.scrollY || 0 };
      try { localStorage.setItem(key, JSON.stringify(scoped)); } catch { /* Keep this visit's position in memory. */ }
      void writeWorkspaceRecord(key,'uiScroll',route,scoped[route]);
    };
    let active=true;void readWorkspaceRecord<{main:number;window:number}>(key,'uiScroll',route).then(saved=>{if(!active||userChanged||!saved||!Number.isFinite(saved.main)||!Number.isFinite(saved.window)||saved.main<0||saved.window<0)return;scoped![route]=saved;if(element)element.scrollTop=saved.main;window.scrollTo({top:saved.window,behavior:'auto'});}).catch(()=>{});
    element?.addEventListener('scroll', save, { passive: true }); window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('pagehide', save); document.addEventListener('click',save,true);document.addEventListener('visibilitychange',save);
    return () => { active=false;save();element?.removeEventListener('scroll', save); window.removeEventListener('scroll', save); window.removeEventListener('pagehide', save);document.removeEventListener('click',save,true);document.removeEventListener('visibilitychange',save); };
  }, [key, route]);
  return main;
}

export interface LectureMemory { courseId: string; selected: Recording | null; subQuery: string; section: string; positionMs: number; selectedLines: number[]; subtitleScope: 'all' | 'selected' | 'none'; hasPlayed: boolean }
export const defaultLecture: LectureMemory = { courseId: '', selected: null, subQuery: '', section: 'subtitles', positionMs: 0, selectedLines: [], subtitleScope: 'all', hasPlayed: false };
export function decodeLecture(raw: unknown): LectureMemory {
  const value = raw as Partial<LectureMemory> | null;
  if (!value || typeof value.courseId !== 'string') return { ...defaultLecture };
  const selected = value.selected;
  const valid = selected && typeof selected.id === 'string' && typeof selected.title === 'string' && selected.courseId === value.courseId && ['canvas','videoSpace','legacy'].includes(selected.source) && Number.isFinite(selected.materialsId);
  return { courseId: value.courseId, selected: valid ? { id: selected.id, title: selected.title, courseId: selected.courseId, source: selected.source, materialsId: selected.materialsId, raw: {} } : null,
    subQuery: typeof value.subQuery === 'string' ? value.subQuery : '', section: value.section === 'slides' || value.section==='notes' ? value.section : 'subtitles',
    positionMs: Number.isFinite(value.positionMs) ? Math.max(0, value.positionMs!) : 0,
    selectedLines: Array.isArray(value.selectedLines) ? value.selectedLines.filter(i => Number.isInteger(i) && i >= 0) : [],
    subtitleScope: value.subtitleScope === 'selected' || value.subtitleScope === 'none' ? value.subtitleScope : 'all', hasPlayed: value.hasPlayed === true };
}
