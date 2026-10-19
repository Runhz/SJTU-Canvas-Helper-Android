import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {StudyMaterialPanel} from './StudyMaterialPanel';
import type {PreparedAttachment} from './studyAttachments';
import {courses} from './domain';
import * as runtime from './runtime';
vi.mock('./runtime',async original=>({...await original<typeof import('./runtime')>(),NATIVE:true,native:vi.fn(),readPreparedFile:vi.fn(async(_path,name)=>({name,text:'[PDF 第 1 页]\n测试文件正文'}))}));
const native=vi.mocked(runtime.native);
const items:PreparedAttachment[]=[{id:'one',name:'课程一.pdf',mime:'application/pdf',size:200,kind:'file',courseId:'1',resourceId:'11',updatedAt:1},{id:'two',name:'课程二.pdf',mime:'application/pdf',size:300,kind:'file',courseId:'1',resourceId:'12',updatedAt:1},{id:'image',name:'课堂.jpg',mime:'image/jpeg',size:50,kind:'image',courseId:'1',resourceId:'13',updatedAt:1}];
beforeEach(()=>{localStorage.clear();native.mockReset();native.mockImplementation(async method=>(method==='studyPrepared'?{items}:method==='studyStageForAi'?{path:'/private/ai-imports/source'}:method==='documentInfo'?{pages:2}:method==='documentPage'?{image:'data:image/jpeg;base64,YQ=='}:{}) as never);});afterEach(cleanup);
describe('unified question materials',()=>{
  it('filters courses by semester while preserving selected materials',async()=>{
    const now=Date.now(),current={...courses[0],id:'current-course',name:'本学期课程',term:{id:'term-now',name:'当前学期',startAt:now-1000,endAt:now+100000}},old={...courses[1],id:'past-course',name:'以前的课程',term:{id:'term-old',name:'2020 秋季'}};
    const loadFiles=vi.fn(async()=>{});render(<StudyMaterialPanel scope="semester" courses={[current,old]} loadFiles={loadFiles} title="学习助手" payload={{mode:'agent',args:{}}} onDone={()=>{}} onClose={()=>{}}/>);
    await waitFor(()=>expect(loadFiles).toHaveBeenCalledWith(current));fireEvent.click(screen.getByRole('button',{name:'学期筛选'}));fireEvent.click(screen.getByRole('button',{name:'2020 秋季'}));await waitFor(()=>expect(loadFiles).toHaveBeenCalledWith(old));expect(screen.getByRole('button',{name:'资料课程'}).textContent).toContain('以前的课程');
  });
  it('loads only a selected course directory and never prepares files before confirmation',async()=>{
    const available=courses.filter(c=>c.files.length);const loadFiles=vi.fn(async()=>{});render(<StudyMaterialPanel scope="student" courses={available} loadFiles={loadFiles} accountId="student" title="学习助手" payload={{mode:'agent',args:{}}} onDone={()=>{}} onClose={()=>{}}/>);
    await waitFor(()=>expect(loadFiles).toHaveBeenCalledTimes(1));expect(loadFiles).toHaveBeenCalledWith(available[0]);
    fireEvent.click(document.querySelector('.study-file-select')!);expect(native.mock.calls.every(([method])=>method==='studyPrepared'||method==='playerControl'||method==='documentPreviewControl')).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'刷新课程资料'}));await waitFor(()=>expect(loadFiles).toHaveBeenLastCalledWith(available[0],true));
  });
  it('reads prepared course files before entering the assistant without downloading again',async()=>{
    localStorage.setItem('canvas-study-basket:student',JSON.stringify(['one','two']));
    const onDone=vi.fn();render(<StudyMaterialPanel scope="student" courses={[]} loadFiles={async()=>{}} title="学习助手" payload={{mode:'agent',args:{}}} onDone={onDone} onClose={()=>{}}/>);
    await waitFor(()=>expect(document.querySelectorAll('.study-selected-item')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button',{name:'进入助手'}));await waitFor(()=>expect(onDone).toHaveBeenCalled());
    const result=onDone.mock.calls[0][0].payload;expect((result.args.files as {id:number}[]).map(f=>f.id)).toEqual([11,12]);expect(result.args.documents).toHaveLength(2);expect(result.args.documents[0].text).toContain('测试文件正文');expect(native.mock.calls.some(([method])=>method==='enqueueDownload')).toBe(false);expect(runtime.readPreparedFile).toHaveBeenCalledTimes(2);
  });
  it('shows invalid subtitle times in the range dialog and preserves selected text after cancelling',async()=>{
    render(<StudyMaterialPanel scope="student" courses={[]} loadFiles={async()=>{}} title="课堂" payload={{mode:'materials',args:{resourceId:'recording',text:'第一句',subtitleLines:[{bg:1000,ed:2000,res:'第一句'}]}}} onDone={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'选择字幕范围'}));fireEvent.change(screen.getByRole('textbox',{name:'字幕结束时间'}),{target:{value:'00:00:00'}});fireEvent.click(screen.getByRole('button',{name:'使用所选字幕'}));
    const dialog=screen.getAllByRole('dialog').at(-1)!;expect(within(dialog).getByRole('alert').textContent).toContain('有效的起止时间');
    fireEvent.click(within(dialog).getByRole('button',{name:'关闭弹窗'}));expect(document.querySelectorAll('.study-selected-item')).toHaveLength(1);
  });
});
