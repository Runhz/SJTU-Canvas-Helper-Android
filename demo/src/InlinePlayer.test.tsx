import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,native:vi.fn(),recordingTracks:vi.fn()}));
import * as runtime from './runtime';
import {InlinePlayer} from './InlinePlayer';
const recording:runtime.Recording={id:'7',courseId:'1',materialsId:2,source:'canvas',title:'课堂',raw:{}};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(runtime.native).mockImplementation(async method=>method==='playerStatus'?{resourceId:'canvas:7',opened:true,positionMs:10000,speed:1.5,camera:1}:{} as never);vi.mocked(runtime.recordingTracks).mockResolvedValue([{url:'https://example.test/video',headers:{}}]);vi.stubGlobal('requestAnimationFrame',(f:()=>void)=>setTimeout(f,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('retained native player',()=>{
  it('hides and pauses via layout when leaving, then reuses the same native player',async()=>{
    const props={recording,notify:vi.fn()};const view=render(<InlinePlayer {...props} obscured={false}/>);
    fireEvent.click(screen.getByRole('button',{name:'播放本堂课'}));await waitFor(()=>expect(screen.getByRole('button',{name:'放大全屏'})).toBeTruthy());
    view.rerender(<InlinePlayer {...props} obscured={true}/>);
    await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('playerControl',expect.objectContaining({action:'layout',visible:false})));
    view.rerender(<InlinePlayer {...props} obscured={false}/>);
    await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('playerControl',expect.objectContaining({action:'layout',visible:true})));
    expect(vi.mocked(runtime.native).mock.calls.filter(([method])=>method==='embedPlayer')).toHaveLength(1);
    expect(vi.mocked(runtime.native).mock.calls.some(([method,args])=>method==='playerControl'&&args?.action==='close')).toBe(false);
  });
  it('reopens saved playback as a paused frame after an app restart',async()=>{
    render(<InlinePlayer recording={recording} notify={()=>{}} obscured={false} resume/>);
    await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('embedPlayer',expect.objectContaining({autoplay:false,visible:true,resourceId:'canvas:7'})));
  });
  it('does not start hidden playback when track resolution finishes after navigation',async()=>{
    let resolve!:(value:Awaited<ReturnType<typeof runtime.recordingTracks>>)=>void;
    vi.mocked(runtime.recordingTracks).mockImplementation(()=>new Promise(r=>resolve=r));
    const view=render(<InlinePlayer recording={recording} notify={()=>{}} obscured={false}/>);
    fireEvent.click(screen.getByRole('button',{name:'播放本堂课'}));
    view.rerender(<InlinePlayer recording={recording} notify={()=>{}} obscured/>);
    resolve([{url:'https://example.test/video',headers:{}}]);
    await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('embedPlayer',expect.objectContaining({autoplay:false,visible:false})));
  });
});
