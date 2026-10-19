import {useEffect} from 'react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',async original=>({...await original<typeof import('./runtime')>(),NATIVE:true,native:vi.fn(),api:vi.fn()}));
import * as runtime from './runtime';
import {LectureDocumentWorkspace} from './LectureDocumentWorkspace';
import {clampFloating} from './floatingStudy';
const course={id:'7',name:'电力电子',code:'EE',teacher:'',glyph:'book',color:'blue' as const,filesLoaded:true,files:[{id:'42',name:'电路课件.pptx',kind:'PPTX',updated:'今天',size:'4 MB',raw:{id:42}}]},recording={id:'201',courseId:'7',source:'canvas' as const,materialsId:501,title:'电感课堂',raw:{}};
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.mocked(runtime.api).mockResolvedValue({url:'https://oc.sjtu.edu.cn/preview'});vi.mocked(runtime.native).mockImplementation(async method=>method==='captureDocument'?{image:'data:image/jpeg;base64,YWJj',videoResourceId:'canvas:201',videoPositionMs:195000}:{state:'ready'} as never)});
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
describe('movable lecture document',()=>{
  it('switches to document reading and back without refetching the preview or remounting the player',async()=>{
    const mounted=vi.fn();function Player(){useEffect(()=>{mounted()},[]);return <div>原录播实例</div>}
    render(<LectureDocumentWorkspace scope="desk-a" pane="left" recording={recording} course={course} loadFiles={vi.fn()} onAi={()=>{}}><Player/></LectureDocumentWorkspace>);
    fireEvent.click(screen.getByRole('button',{name:'打开课件'}));fireEvent.click(await screen.findByRole('button',{name:/电路课件.pptx/}));await waitFor(()=>expect(runtime.api).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole('button',{name:'课件为主'})[0]);expect(runtime.native).toHaveBeenCalledWith('playerControl',{action:'documentPrimary',resourceId:'canvas:201'});expect(runtime.api).toHaveBeenCalledTimes(1);expect(mounted).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{name:'单页阅读'}));expect(runtime.native).toHaveBeenCalledWith('documentPreviewControl',expect.objectContaining({action:'fullscreen'}));
  });
  it('attaches the actual lecture position and nearby subtitles to a document screenshot',async()=>{
    const ask=vi.fn();render(<LectureDocumentWorkspace scope="desk-b" pane="left" recording={recording} course={course} loadFiles={vi.fn()} lines={[{bg:190000,ed:196000,res:'电压有限时，电流连续。'},{bg:210000,ed:216000,res:'后面的结论'}]} onAi={ask}><div>录播</div></LectureDocumentWorkspace>);
    fireEvent.click(screen.getByRole('button',{name:'打开课件'}));fireEvent.click(await screen.findByRole('button',{name:/电路课件.pptx/}));await waitFor(()=>expect((screen.getByRole('button',{name:'截图提问'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'截图提问'}));
    await waitFor(()=>expect(ask).toHaveBeenCalledWith('电路课件.pptx',{mode:'materials',args:expect.objectContaining({file:{id:42},resourceId:'canvas:201',positionMs:195000,text:expect.stringContaining('电压有限'),timePoints:[190,195],forceModal:true})}));expect(ask.mock.calls[0][1].args.text).not.toContain('后面的结论');expect(ask.mock.calls[0][1].args.lectureBackground.lines).toHaveLength(2);
  });
  it('clamps movable windows after both horizontal and vertical system resizing',()=>{
    const box=clampFloating({x:1100,y:700,width:600,height:600},393,280);expect(box).toEqual({x:8,y:8,width:377,height:264});expect(clampFloating({...box,x:-500,y:-500,width:100,height:100},800,600)).toEqual({x:8,y:8,width:280,height:220});
  });
});
