import { Component, type ReactNode } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="recovery-page"><BookOpen size={36}/><h1>学习空间暂时遇到问题</h1><p>重新打开可恢复界面，已保存的账号和下载记录会保留。</p><button className="button primary" onClick={() => window.location.reload()}><RefreshCw size={17}/>重新打开</button></main>;
  }
}
