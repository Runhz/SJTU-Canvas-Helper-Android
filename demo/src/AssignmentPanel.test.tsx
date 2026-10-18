import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',async original=>({...await original<typeof import('./runtime')>(),api:vi.fn(),native:vi.fn().mockResolvedValue({}),enqueueFile:vi.fn().mockResolvedValue({}),pickAttachments:vi.fn().mockResolvedValue([{name:'答案.pdf',path:'/cache/answer',size:1024,mime:'application/pdf'}]),submitAssignment:vi.fn().mockResolvedValue({status:'submitted',receipt:{submitted_at:'2026-10-17T08:00:00Z',attachments:[{id:99,filename:'答案.pdf'}]}})}));
import * as runtime from './runtime';
import {NativeAssignmentPanel} from './AssignmentPanel';
const raw={id:8,name:'实验一',description:'<p>请完成实验</p><a href="/files/42">实验要求.pdf</a>',submission_types:['online_upload'],submission:{workflow_state:'unsubmitted'}};
const live={account:{accountId:'student'},markSubmission:vi.fn(),refresh:vi.fn().mockResolvedValue({})} as any;
beforeEach(()=>{vi.clearAllMocks();vi.mocked(runtime.api).mockImplementation(async action=>action==='assignmentDetail'?raw:{submitted_at:'2026-10-17T08:00:00Z',attachments:[{id:99,filename:'答案.pdf'}]} as never)});afterEach(cleanup);
describe('assignment file channels',()=>{
  it('previews and downloads requirement files while exporting the textual requirements separately',async()=>{
    const preview=vi.fn();render(<NativeAssignmentPanel assignment={runtime.mapAssignment('7',raw)} live={live} onBusy={()=>{}} onDone={()=>{}} notify={()=>{}} onPreview={preview}/>);
    fireEvent.click(await screen.findByRole('button',{name:'预览 实验要求.pdf'}));expect(preview).toHaveBeenCalledWith(expect.objectContaining({id:'42'}));
    fireEvent.click(screen.getByRole('button',{name:'下载 实验要求.pdf'}));await waitFor(()=>expect(runtime.enqueueFile).toHaveBeenCalledWith(expect.objectContaining({id:'42'}),'7','student'));
    fireEvent.click(screen.getByRole('button',{name:'保存要求'}));expect(runtime.native).toHaveBeenCalledWith('exportFile',expect.objectContaining({text:expect.stringContaining('请完成实验')}));expect(runtime.submitAssignment).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation and then exposes the receipt attachment for preview and download',async()=>{
    render(<NativeAssignmentPanel assignment={runtime.mapAssignment('7',raw)} live={live} onBusy={()=>{}} onDone={()=>{}} notify={()=>{}} onPreview={()=>{}}/>);
    await screen.findByText('实验要求.pdf');fireEvent.click(screen.getByRole('button',{name:/选择作业文件/}));await screen.findByText('答案.pdf');fireEvent.click(screen.getByRole('button',{name:'检查并提交'}));expect(runtime.submitAssignment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'确认提交到 Canvas'}));await screen.findByRole('button',{name:'下载 答案.pdf'});await screen.findByText('提交成功');expect(runtime.submitAssignment).toHaveBeenCalledTimes(1);expect(live.markSubmission).toHaveBeenCalled();
  });
});
