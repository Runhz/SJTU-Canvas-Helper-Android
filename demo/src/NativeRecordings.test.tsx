import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,modelCapabilities:vi.fn().mockResolvedValue({}),materialText:vi.fn(),recordingTracks:vi.fn(),native:vi.fn(),enqueueRecording:vi.fn()}));
import * as runtime from './runtime';
import {NativeRecordings} from './NativePanels';
import type {Course} from './domain';
const course:Course={id:'1',name:'测试课程',code:'TEST',teacher:'',color:'blue',glyph:'network',files:[]};
const recording:runtime.Recording={id:'201',title:'测试课堂',courseId:'1',source:'canvas',materialsId:501,raw:{}};
beforeEach(()=>{localStorage.clear();Object.defineProperty(HTMLElement.prototype,'scrollTo',{configurable:true,value:vi.fn()});});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(runtime.native).mockResolvedValue({});vi.mocked(runtime.recordingTracks).mockResolvedValue([{url:'https://example.test/video.mp4',headers:{}}]);vi.mocked(runtime.materialText).mockResolvedValue({lines:[{bg:1000,ed:4000,res:'课堂原始字幕'}],slides:[],text:'课堂原始字幕'});vi.stubGlobal('requestAnimationFrame',(f:()=>void)=>setTimeout(f,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);});
afterEach(()=>{cleanup();delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;vi.unstubAllGlobals()});
async function setup(){
  const live={account:{accountId:'test'},courses:[course],recordings:[recording],videos:vi.fn().mockResolvedValue([recording]),loadMaterials:runtime.materialText,peekMaterials:()=>null} as unknown as Parameters<typeof NativeRecordings>[0]['live'];
  const onAi=vi.fn();render(<NativeRecordings live={live} courses={[course]} allCourses={[course]} term="current" setTerm={()=>{}} notify={()=>{}} onAi={onAi} obscured={false}/>);
  fireEvent.click(screen.getByRole('button',{name:/测试课程.*查看录播/}));
  await waitFor(()=>expect(live.videos).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button',{name:/测试课堂/}));
  await waitFor(()=>expect(screen.getByText('课堂原始字幕')).toBeTruthy());return {onAi};
}
describe('课堂学习页',()=>{
  it('整堂总结启用全文处理，不把抽样片段当作整堂内容',async()=>{
    const {onAi}=await setup();fireEvent.click(screen.getByRole('button',{name:'AI 总结'}));expect(onAi.mock.calls[0][1].args.readMode).toBe('full');
  });
  it('主动选择不附字幕时仍可进入自由提问，不偷偷附加附近字幕',async()=>{
    const {onAi}=await setup();fireEvent.click(screen.getByRole('button',{name:'提问资料'}));fireEvent.click(screen.getByRole('button',{name:'不附字幕'}));fireEvent.click(screen.getByRole('button',{name:'问这里'}));await waitFor(()=>expect(onAi).toHaveBeenCalled());expect(onAi.mock.calls[0][1].args).toMatchObject({text:'',subtitleLines:[],contextLabel:'自由提问'});
  });
  it('选中字幕后直接发起提问，只附所选原文和时间范围',async()=>{
    const {onAi}=await setup();fireEvent.click(screen.getByRole('button',{name:'选择字幕'}));fireEvent.click(screen.getByRole('button',{name:'选择字幕 1'}));fireEvent.click(screen.getByRole('button',{name:'用所选字幕提问'}));
    expect(onAi).toHaveBeenCalledWith('测试课堂 · 课堂问答',expect.objectContaining({args:expect.objectContaining({contextLabel:'所选字幕',positionMs:1000,timePoints:[1],text:expect.stringContaining('00:00:01—00:00:04'),subtitleLines:[{bg:1000,ed:4000,res:'课堂原始字幕'}]})}));
  });
  it.each([393,768])('字幕资料选择在宽度 %i 时通知原生视频让位，关闭后恢复',async(width)=>{
    vi.stubGlobal('innerWidth',width);
    await setup();fireEvent.click(screen.getByRole('button',{name:'播放本堂课'}));
    await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('embedPlayer',expect.objectContaining({rect:expect.objectContaining({viewportWidth:width})})));
    fireEvent.click(screen.getByRole('button',{name:'提问资料'}));
    expect(runtime.native).toHaveBeenCalledWith('playerControl',{action:'occlusion',obscured:true});
    fireEvent.click(screen.getByRole('button',{name:'仅所选字幕'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(runtime.native).toHaveBeenCalledWith('playerControl',{action:'occlusion',obscured:false});
  });
  it('播放使用内嵌播放器，字幕定位沿用当前播放器',async()=>{
    await setup();fireEvent.click(screen.getByRole('button',{name:'播放本堂课'}));
    await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('embedPlayer',expect.objectContaining({resourceId:'canvas:201'})));
    fireEvent.click(screen.getByRole('button',{name:/00:00:01.*课堂原始字幕/}));
    expect(runtime.native).toHaveBeenCalledWith('playerControl',{action:'seek',positionMs:1000,resourceId:'canvas:201'});
  });
  it('下载字幕保持原始时间，课堂提问绑定当前课堂资料',async()=>{
    const {onAi}=await setup();fireEvent.click(screen.getByRole('button',{name:'下载 SRT 字幕'}));
    expect(runtime.native).toHaveBeenCalledWith('exportFile',expect.objectContaining({name:'测试课堂.srt',text:'1\n00:00:01,000 --> 00:00:04,000\n课堂原始字幕\n'}));
    fireEvent.click(screen.getByRole('button',{name:/00:00:01.*课堂原始字幕/}));fireEvent.click(screen.getByRole('button',{name:'问这里'}));
    await waitFor(()=>expect(onAi).toHaveBeenCalled());
    expect(onAi).toHaveBeenCalledWith('测试课堂 · 课堂问答',expect.objectContaining({mode:'materials',args:expect.objectContaining({text:expect.stringContaining('课堂原始字幕'),resourceId:'canvas:201',timePoints:[1]})}));
  });
});
