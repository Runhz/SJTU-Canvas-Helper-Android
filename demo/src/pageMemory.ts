import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AccountConfig, Recording } from './runtime';

export type Tab = 'dashboard' | 'courses' | 'recordings' | 'downloads' | 'profile' | 'assistant';
export function accountScope(account: AccountConfig | null) {
  return account ? JSON.stringify([account.accountId, account.identityId || '']) : 'anonymous';
}
export function useRememberedState<T>(key: string, initial: T, decode: (raw: unknown) => T) {
  const [value, setValue] = useState<T>(() => {
    try { return decode(JSON.parse(localStorage.getItem(key) || 'null')); } catch { return initial; }
  });
  const latest = useRef(value); latest.current = value;
  useEffect(() => {
    const save = () => { try { localStorage.setItem(key, JSON.stringify(latest.current)); } catch { /* State remains available in this visit. */ } };
    save(); window.addEventListener('pagehide', save); document.addEventListener('visibilitychange', save);
    return () => { save(); window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', save); };
  }, [key, value]);
  return [value, setValue] as const;
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
  const positions = useRef<Record<string, { main: number; window: number }>>({});
  useState(() => { try { const value=JSON.parse(localStorage.getItem(key) || '{}');if(value&&typeof value==='object'&&!Array.isArray(value))for(const [route,position] of Object.entries(value)){const p=position as {main:number;window:number};if(p&&Number.isFinite(p.main)&&Number.isFinite(p.window)&&p.main>=0&&p.window>=0)positions.current[route]=p;} } catch {} });
  useLayoutEffect(() => {
    const element = main.current;
    const previous = positions.current[route];
    if (element) element.scrollTop = previous?.main || 0;
    window.scrollTo({ top: previous?.window || 0, behavior: 'auto' });
    const save = () => {
      positions.current[route] = { main: element?.scrollTop || 0, window: window.scrollY || 0 };
      try { localStorage.setItem(key, JSON.stringify(positions.current)); } catch {}
    };
    element?.addEventListener('scroll', save, { passive: true }); window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('pagehide', save); document.addEventListener('click',save,true);document.addEventListener('visibilitychange',save);
    return () => { element?.removeEventListener('scroll', save); window.removeEventListener('scroll', save); window.removeEventListener('pagehide', save);document.removeEventListener('click',save,true);document.removeEventListener('visibilitychange',save); };
  }, [scope, route]);
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
