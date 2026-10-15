import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('./CanvasWater',()=>({createCanvasWater:()=>({setFill:vi.fn(),impulse:vi.fn(),dispose:vi.fn()})}));
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  localStorage.clear(); window.scrollTo=vi.fn();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T08:00:00+08:00'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('学习界面实用交互', () => {
  it('作业搜索与日期筛选叠加，清除后恢复原列表', () => {
    const {container}=render(<App/>);
    fireEvent.click(screen.getByRole('button',{name:'未来 7 天'}));
    expect(container.querySelectorAll('.assignment-card')).toHaveLength(3);
    fireEvent.change(screen.getByRole('textbox',{name:'搜索作业'}),{target:{value:'CS3310'}});
    expect(container.querySelectorAll('.assignment-card')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'已逾期'}));
    expect(container.querySelectorAll('.assignment-card')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button',{name:'所有日期'}));
    fireEvent.click(screen.getByRole('button',{name:'清除作业搜索'}));
    expect(container.querySelectorAll('.assignment-card')).toHaveLength(4);
  });
  it('忽略后撤销精确恢复原状态，不改动其他作业和提醒设置', () => {
    const {container}=render(<App/>);
    fireEvent.click(screen.getByRole('button',{name:'实验 2：Socket 编程的操作'}));
    fireEvent.click(screen.getByRole('button',{name:'忽略这项作业 · 停止提醒'}));
    expect(container.querySelector('.overview-number')?.textContent).toBe('3');
    fireEvent.click(screen.getByRole('button',{name:'撤销'}));
    expect(container.querySelector('.overview-number')?.textContent).toBe('4');
    expect(JSON.parse(localStorage.getItem('sjtu-canvas-demo-v1')!).study.ignoredAssignments).toEqual([]);
  });
  it('课程置顶在重开后保留，资料搜索不混入其他文件', () => {
    const app=render(<App/>);
    fireEvent.click(screen.getByRole('button',{name:'课程'}));
    fireEvent.click(screen.getByRole('button',{name:'机器学习的操作'}));
    fireEvent.click(screen.getByRole('button',{name:'置顶这门课程'}));
    expect(app.container.querySelector('.course-card')?.textContent).toContain('机器学习');
    app.unmount(); const reloaded=render(<App/>);
    fireEvent.click(screen.getByRole('button',{name:'课程'}));
    expect(reloaded.container.querySelector('.course-card')?.textContent).toContain('机器学习');
    fireEvent.click(screen.getByRole('button',{name:/CS3310.*计算机网络/}));
    fireEvent.change(screen.getByRole('textbox',{name:'搜索课程资料'}),{target:{value:'.zip'}});
    expect(reloaded.container.querySelectorAll('.file-row')).toHaveLength(1);
    expect(reloaded.container.querySelector('.file-row')?.textContent).toContain('实验资源');
  });
  it('弹窗焦点循环且关闭后回到入口，时钟更新不抢焦点', () => {
    render(<App/>);
    const entry=screen.getByRole('button',{name:'搜索'}); entry.focus(); fireEvent.click(entry);
    const dialog=screen.getByRole('dialog');
    expect(document.querySelector('.app-shell')?.getAttribute('aria-hidden')).toBe('true');
    dialog.focus(); fireEvent.keyDown(document,{key:'Tab',shiftKey:true});
    expect(dialog.contains(document.activeElement)).toBe(true);
    act(()=>vi.advanceTimersByTime(2000));
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(entry);
    expect(document.querySelector('.app-shell')?.hasAttribute('aria-hidden')).toBe(false);
  });
});
