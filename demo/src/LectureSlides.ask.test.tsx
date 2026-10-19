import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,native:vi.fn().mockResolvedValue({image:'data:image/jpeg;base64,YWJj'})}));
import {native} from './runtime';
import {LectureSlides} from './LectureSlides';
const recording={source:'canvas' as const,id:'201',courseId:'7',title:'电路课',materialsId:501,raw:{}};
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',(f:FrameRequestCallback)=>setTimeout(()=>f(0),0));vi.stubGlobal('cancelAnimationFrame',clearTimeout)});afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it('asks about the displayed slice with its matching timestamp and subtitles, without loading course files',async()=>{
  const ask=vi.fn(),loadFiles=vi.fn();render(<LectureSlides scope="student" recording={recording} onAi={ask} onSeek={()=>{}} loadFiles={loadFiles} positionMs={23000} lines={[{bg:9000,ed:11000,res:'第一步'},{bg:20000,ed:25000,res:'第二步'}]} slides={[{createSec:10,pptImgUrl:'https://v.sjtu.edu.cn/one.jpg',ocrText:'公式一'},{createSec:20,pptImgUrl:'https://v.sjtu.edu.cn/two.jpg',ocrText:'公式二'}]}/>);
  expect(screen.queryByRole('button',{name:'关联课件'})).toBeNull();expect(loadFiles).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'上一张课件切片'}));fireEvent.click(screen.getByRole('button',{name:'课件切片问 AI'}));await waitFor(()=>expect(ask).toHaveBeenCalledOnce());expect(native).toHaveBeenCalledWith('captureSlideImage',{scope:'student',url:'https://v.sjtu.edu.cn/one.jpg'});expect(ask.mock.calls[0][1]).toMatchObject({mode:'materials',args:{resourceId:'canvas:201',positionMs:10000,screenshot:'data:image/jpeg;base64,YWJj',recording}});expect(ask.mock.calls[0][1].args.text).toContain('第一步');expect(ask.mock.calls[0][1].args.text).not.toContain('公式一');expect(ask.mock.calls[0][1].args.text).not.toContain('第二步');
});
