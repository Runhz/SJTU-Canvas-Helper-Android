import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const holder=vi.hoisted(()=>({live:null as any}));
vi.mock('./useLiveCanvas',()=>({useLiveCanvas:()=>holder.live}));
vi.mock('./UpcomingSchedule',()=>({UpcomingSchedule:()=>null}));
vi.mock('./CanvasWater',()=>({createCanvasWater:()=>({setFill:vi.fn(),impulse:vi.fn(),dispose:vi.fn()})}));
vi.mock('./runtime',async original=>({...await original<typeof import('./runtime')>(),NATIVE:true,native:vi.fn(),recordingTracks:vi.fn()}));
import * as runtime from './runtime';
import App from './App';
import {DEFAULT_REMINDERS,type Course} from './domain';
import {accountScope} from './pageMemory';
const course:Course={id:'1',name:'测试课程',code:'TEST',teacher:'',color:'blue',glyph:'network',files:[]};
const recording:runtime.Recording={id:'201',title:'测试课堂',courseId:'1',source:'canvas',materialsId:501,raw:{}};
beforeEach(()=>{
  localStorage.clear();vi.clearAllMocks();window.scrollTo=vi.fn();HTMLElement.prototype.scrollTo=vi.fn();
  vi.stubGlobal('requestAnimationFrame',(f:()=>void)=>setTimeout(f,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  vi.mocked(runtime.recordingTracks).mockResolvedValue([{url:'https://example.test/video',headers:{}}]);
  vi.mocked(runtime.native).mockImplementation(async method=>method==='playerStatus'?{resourceId:'canvas:201',opened:true,positionMs:124000,speed:1.5,camera:0}:{} as never);
  holder.live={account:{accountId:'student',identityId:'1'},name:'学生',courses:[course],recordings:[recording],state:{version:1,assignments:[],downloads:[],reminders:[],seen:[],syncedAt:0,settings:DEFAULT_REMINDERS,study:{term:'all'}},setState:vi.fn(),saved:{accounts:[]},error:'',busy:false,files:vi.fn().mockResolvedValue([]),videos:vi.fn().mockResolvedValue([recording]),peekMaterials:()=>null,loadMaterials:vi.fn().mockResolvedValue({lines:[{bg:1000,ed:4000,res:'原始课堂字幕'}],slides:[],text:'原始课堂字幕'})};
  localStorage.setItem(`canvas-page-v1:${accountScope(holder.live.account)}`,JSON.stringify({tab:'recordings'}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();Reflect.deleteProperty(HTMLElement.prototype,'scrollTo');});
describe('native navigation memory',()=>{
  it('returns to the same classroom/player without fetching tracks again, and restores after restart',async()=>{
    const view=render(<App/>);
    fireEvent.click(screen.getByRole('button',{name:/测试课程.*查看录播/}));
    fireEvent.click(await screen.findByRole('button',{name:/测试课堂/}));
    await screen.findByText('原始课堂字幕');fireEvent.click(screen.getByRole('button',{name:'播放本堂课'}));
    await screen.findByRole('button',{name:'放大全屏'});
    await waitFor(()=>expect(localStorage.getItem(`canvas-lecture-v1:${accountScope(holder.live.account)}`)).toContain('124000'));
    fireEvent.change(screen.getByRole('textbox',{name:'搜索字幕'}),{target:{value:'原始'}});
    fireEvent.click(screen.getByRole('button',{name:'课程'}));
    await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('playerControl',expect.objectContaining({action:'layout',visible:false})));
    fireEvent.click(screen.getByRole('button',{name:'录播'}));
    expect((screen.getByRole('textbox',{name:'搜索字幕'}) as HTMLInputElement).value).toBe('原始');
    expect(screen.getByRole('button',{name:'放大全屏'})).toBeTruthy();expect(runtime.recordingTracks).toHaveBeenCalledTimes(1);
    view.unmount();render(<App/>);
    await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('embedPlayer',expect.objectContaining({resourceId:'canvas:201',autoplay:false})));
    expect((screen.getByRole('textbox',{name:'搜索字幕'}) as HTMLInputElement).value).toBe('原始');
  });
  it('does not restore another identity even when the account label is reused',()=>{
    const view=render(<App/>);fireEvent.click(screen.getByRole('button',{name:'我的'}));
    holder.live={...holder.live,account:{accountId:'student',identityId:'2'}};view.rerender(<App/>);
    expect(screen.getByRole('heading',{name:/学习总览/})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'录播'}));expect(screen.getByRole('button',{name:/测试课程.*查看录播/})).toBeTruthy();
  });
});
