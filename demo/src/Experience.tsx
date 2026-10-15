import { useEffect, useState } from 'react';
import { CalendarDays, Search, WifiOff, X } from 'lucide-react';
import type { DeadlineWindow } from './productivity';

export function ConnectionBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return !online ? <div className="connection-banner" role="status"><WifiOff size={16}/><span>当前离线 · 显示上次保存的内容，提交状态需联网核对</span></div> : null;
}

export function DeadlineTools({ window, onWindow, query, onQuery, count, onExport }: {
  window: DeadlineWindow; onWindow: (v: DeadlineWindow) => void; query: string; onQuery: (v: string) => void; count: number; onExport: () => void;
}) {
  return <div className="deadline-tools">
    <div className="deadline-chips" aria-label="截止日期范围">{([
      ['all', '所有日期'], ['today', '今日截止'], ['week', '未来 7 天'], ['overdue', '已逾期'], ['undated', '未设日期'],
    ] as const).map(([id, label]) => <button key={id} className={window === id ? 'selected' : ''} aria-pressed={window === id} onClick={() => onWindow(id)}>{label}</button>)}</div>
    <label className="search-field compact-search"><Search size={16}/><input aria-label="搜索作业" placeholder="搜索作业、课程或代码" value={query} onChange={e => onQuery(e.target.value)}/>{query && <button aria-label="清除作业搜索" onClick={() => onQuery('')}><X size={16}/></button>}</label>
    <div className="calendar-export"><span>当前结果中 {count} 项待办可导出</span><button className="text-button" disabled={count === 0} onClick={onExport}><CalendarDays size={14}/>导出日历</button></div>
  </div>;
}
