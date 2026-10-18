import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./CanvasWater',()=>({createCanvasWater:()=>({setFill:vi.fn(),impulse:vi.fn(),dispose:vi.fn()})}));
import { act, cleanup, fireEvent, render, screen,within } from '@testing-library/react';
import App from './App';
beforeEach(()=>{Object.defineProperty(window,'innerWidth',{value:393,configurable:true});localStorage.clear();window.scrollTo=vi.fn();vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(0),0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.setSystemTime(new Date('2026-10-15T08:00:00+08:00'));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
describe('演示主流程',()=>{
  it('collapses an active dual workspace while system split shrinks, then restores both pages',()=>{
    Object.defineProperty(window,'innerWidth',{value:1200,configurable:true});
    const view=render(<App layoutPreview/>);
    fireEvent.click(screen.getByRole('button',{name:'选中右栏'}));
    fireEvent.click(within(screen.getByRole('navigation',{name:'左侧导航'})).getByRole('button',{name:'课程'}));
    Object.defineProperty(window,'innerWidth',{value:500,configurable:true});fireEvent(window,new Event('resize'));act(()=>vi.advanceTimersByTime(20));
    expect(view.container.querySelectorAll('.app-shell')).toHaveLength(1);
    expect(screen.getByRole('region',{name:'右栏 课程'})).toBeTruthy();
    expect(view.container.querySelector('.tablet-layout')).toBeNull();
    expect(screen.queryByRole('button',{name:'切换为双栏'})).toBeNull();
    Object.defineProperty(window,'innerWidth',{value:1200,configurable:true});fireEvent(window,new Event('resize'));act(()=>vi.advanceTimersByTime(20));
    expect(view.container.querySelectorAll('.app-shell')).toHaveLength(2);
    expect(screen.getByRole('region',{name:'左栏 录播'})).toBeTruthy();expect(screen.getByRole('region',{name:'右栏 课程'})).toBeTruthy();
  });
  it('restores the original Pad shell after closing A split instead of stretching a pane',()=>{
    Object.defineProperty(window,'innerWidth',{value:1200,configurable:true});
    const view=render(<App layoutPreview/>);expect(view.container.querySelectorAll('.app-shell')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button',{name:'选中右栏'}));fireEvent.click(screen.getByRole('button',{name:'切换为单栏'}));
    expect(view.container.querySelector('.app-shell.tablet-layout')).toBeTruthy();expect(view.container.querySelector('.app-header')).toBeNull();expect(view.container.querySelector('.bottom-nav')).toBeTruthy();expect(screen.getByRole('button',{name:'切换为双栏'}).closest('nav')).toBeTruthy();expect(view.container.querySelector('.workspace-rail')).toBeNull();expect(view.container.querySelector('.workspace-pane-label')).toBeNull();
  });
  it('also collapses and restores when only the system window height changes',()=>{
    const height=innerHeight;Object.defineProperty(window,'innerWidth',{value:1000,configurable:true});Object.defineProperty(window,'innerHeight',{value:700,configurable:true});
    try{const view=render(<App layoutPreview/>);fireEvent.click(screen.getByRole('button',{name:'选中右栏'}));
      Object.defineProperty(window,'innerHeight',{value:250,configurable:true});fireEvent(window,new Event('resize'));act(()=>vi.advanceTimersByTime(20));
      expect(view.container.querySelectorAll('.app-shell')).toHaveLength(1);expect(screen.getByRole('region',{name:'右栏 助手'})).toBeTruthy();expect(view.container.querySelector('.app-header')).toBeNull();
      Object.defineProperty(window,'innerHeight',{value:500,configurable:true});fireEvent(window,new Event('resize'));act(()=>vi.advanceTimersByTime(20));
      expect(view.container.querySelectorAll('.app-shell')).toHaveLength(2);expect(screen.getByRole('region',{name:'左栏 录播'})).toBeTruthy();
    }finally{Object.defineProperty(window,'innerHeight',{value:height,configurable:true});}
  });
  it('Pad toggles immediately and shared navigation changes only the selected pane',()=>{
    const original=innerWidth;Object.defineProperty(window,'innerWidth',{value:1200,configurable:true});
    try{
      const view=render(<App/>);expect(view.container.querySelectorAll('.app-shell')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button',{name:'切换为双栏'}));
      expect(view.container.querySelectorAll('.app-shell')).toHaveLength(2);
      fireEvent.click(screen.getByRole('button',{name:'选中右栏'}));fireEvent.click(within(screen.getByRole('navigation',{name:'左侧导航'})).getByRole('button',{name:'课程'}));
      expect(screen.getByRole('region',{name:'左栏 总览'})).toBeTruthy();expect(screen.getByRole('region',{name:'右栏 课程'})).toBeTruthy();
      fireEvent.click(screen.getByRole('button',{name:'切换为单栏'}));expect(view.container.querySelectorAll('.app-shell')).toHaveLength(1);expect(screen.getByRole('region',{name:'右栏 课程'})).toBeTruthy();
      expect(screen.queryByRole('button',{name:'提醒消息'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'总览'}));fireEvent.click(screen.getByRole('button',{name:'提醒消息'}));expect(screen.getByRole('dialog')).toBeTruthy();
    }finally{Object.defineProperty(window,'innerWidth',{value:original,configurable:true});}
  });
  it('长按忽略停止待办计数，刷新后保留，且能恢复',()=>{
    const {container,unmount}=render(<App/>);
    const menu=screen.getByRole('button',{name:'实验 2：Socket 编程的操作'});
    fireEvent.contextMenu(menu.parentElement!);
    fireEvent.click(screen.getByRole('button',{name:'忽略这项作业 · 停止提醒'}));
    expect(container.querySelector('.overview-number')?.textContent).toBe('3');
    unmount();const next=render(<App/>);
    expect(next.container.querySelector('.overview-number')?.textContent).toBe('3');
    fireEvent.click(screen.getByRole('button',{name:'已忽略 1'}));
    fireEvent.click(screen.getByRole('button',{name:'实验 2：Socket 编程的操作'}));
    fireEvent.click(screen.getByRole('button',{name:'恢复显示与提醒'}));
    expect(next.container.querySelector('.overview-number')?.textContent).toBe('4');
  });
  it('学期选择在课程与提醒间共享，课程移除后可以恢复',()=>{
    render(<App/>);
    fireEvent.click(screen.getByRole('button',{name:'学期筛选'}));fireEvent.click(screen.getByRole('button',{name:'所有学期'}));
    fireEvent.click(screen.getByRole('button',{name:'课程'}));
    expect(screen.getByRole('button',{name:'学期筛选'}).textContent).toBe('所有学期');
    fireEvent.click(screen.getByRole('button',{name:'计算机网络的操作'}));
    fireEvent.click(screen.getByRole('button',{name:'从本机列表移除'}));
    fireEvent.click(screen.getByRole('button',{name:'已移除课程 1'}));
    fireEvent.click(screen.getByRole('button',{name:'计算机网络的操作'}));
    fireEvent.click(screen.getByRole('button',{name:'恢复显示与提醒'}));
    expect(screen.getByRole('button',{name:'返回课程 0'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'总览'}));
    fireEvent.click(screen.getByRole('button',{name:'提醒消息'}));
    const selects=screen.getAllByRole('button',{name:'学期筛选'});
    expect(selects[selects.length-1].textContent).toBe('所有学期');
  });
  it('演示提交更新面板，刷新后保留状态且不再生成该作业提醒',()=>{
    const {container,unmount}=render(<App/>);
    expect(container.querySelector('.overview-number')?.textContent).toBe('4');
    fireEvent.click(screen.getByRole('button',{name:/计算机网络.*实验 2：Socket 编程/}));
    const input=screen.getByTestId('attachment-input');
    fireEvent.change(input,{target:{files:[new File(['演示'],'中文作业.txt',{type:'text/plain'})]}});
    fireEvent.click(screen.getByRole('button',{name:'检查并提交'}));
    fireEvent.click(screen.getByRole('button',{name:'确认演示提交'}));
    act(()=>vi.advanceTimersByTime(1200));
    expect(screen.getByRole('heading',{name:'这项待办，完成了。'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'查看控制面板'}));
    expect(container.querySelector('.overview-number')?.textContent).toBe('3');
    const saved=JSON.parse(localStorage.getItem('sjtu-canvas-demo-v1')!);
    expect(saved.assignments.find((a:{id:string})=>a.id==='a1').submission).toBe('submitted');
    const existingIds=saved.reminders.filter((r:{assignmentId:string})=>r.assignmentId==='a1').map((r:{id:string})=>r.id);
    unmount();
    const reloaded=render(<App/>);
    expect(reloaded.container.querySelector('.overview-number')?.textContent).toBe('3');
    act(()=>vi.advanceTimersByTime(6*3600_000));
    const next=JSON.parse(localStorage.getItem('sjtu-canvas-demo-v1')!);
    expect(next.reminders.filter((r:{assignmentId:string;read:boolean})=>r.assignmentId==='a1'&&!r.read)).toHaveLength(0);
    expect(next.reminders.filter((r:{assignmentId:string})=>r.assignmentId==='a1').map((r:{id:string})=>r.id)).toEqual(existingIds);
  });
  it('提醒开关与提醒预览可用',()=>{
    render(<App/>);
    fireEvent.click(screen.getByRole('button',{name:'设置截止提醒'}));
    fireEvent.click(screen.getByRole('button',{name:'预览提醒'}));
    expect(screen.getByRole('status').textContent).toContain('尚未提交');
    const toggle=screen.getByRole('checkbox',{name:/开启作业提醒/});
    fireEvent.click(toggle);
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(JSON.parse(localStorage.getItem('sjtu-canvas-demo-v1')!).settings.enabled).toBe(false);
  });
  it('弹窗在时钟更新后不抢走输入焦点',()=>{
    render(<App/>);
    fireEvent.click(screen.getByRole('button',{name:'搜索'}));
    const input=screen.getByRole('textbox',{name:'全局搜索'});
    input.focus();fireEvent.change(input,{target:{value:'网络'}});
    act(()=>vi.advanceTimersByTime(3000));
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe('网络');
  });
  it('取消任务停止进度并可重试',()=>{
    render(<App/>);
    fireEvent.click(screen.getByRole('button',{name:'课程'}));
    fireEvent.click(screen.getByRole('button',{name:/CS3310.*计算机网络/}));
    fireEvent.click(screen.getByRole('button',{name:'下载 第 5 讲 · 网络层.pdf'}));
    fireEvent.click(screen.getByRole('button',{name:'下载'}));
    fireEvent.click(screen.getByRole('button',{name:'取消'}));
    act(()=>vi.advanceTimersByTime(5000));
    let task=JSON.parse(localStorage.getItem('sjtu-canvas-demo-v1')!).downloads.find((d:{id:string})=>d.id==='net:net1');
    expect(task.status).toBe('cancelled');expect(task.progress).toBe(0);
    fireEvent.click(screen.getByRole('button',{name:'重试'}));
    act(()=>vi.advanceTimersByTime(11000));
    task=JSON.parse(localStorage.getItem('sjtu-canvas-demo-v1')!).downloads.find((d:{id:string})=>d.id==='net:net1');
    expect(task.status).toBe('completed');expect(task.progress).toBe(100);
  });
});
