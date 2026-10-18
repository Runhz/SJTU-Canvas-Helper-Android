import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,api:vi.fn(),native:vi.fn()}));
import * as runtime from './runtime';
import {NativeDownloadList} from './NativePanels';
const task={id:'17',courseId:'7',name:'讲义.pptx',resourceId:'42',path:'/downloads/lecture.pptx',progress:100,status:'completed' as const};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(runtime.native).mockResolvedValue({});vi.mocked(runtime.api).mockResolvedValue({url:'https://oc.sjtu.edu.cn/preview'});});
afterEach(cleanup);
describe('downloaded original and official preview',()=>{
  it('opens a Canvas file in the official viewer without downloading it again',async()=>{
    render(<NativeDownloadList tasks={[task]} scope='["student","42"]' notify={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'打开'}));
    await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('openDocumentPreview',expect.objectContaining({url:'https://oc.sjtu.edu.cn/preview',scope:'["student","42"]',title:task.name,downloadPath:task.path})));
    expect(runtime.api).toHaveBeenCalledWith('filePreview',{file:{id:42}});expect(runtime.native).not.toHaveBeenCalledWith('openFile',expect.anything());
  });
  it('falls back to the downloaded original when the platform cannot preview it',async()=>{
    vi.mocked(runtime.api).mockRejectedValue(Error('offline'));render(<NativeDownloadList tasks={[task]} scope='["student","42"]' notify={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'打开'}));
    await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('openFile',expect.objectContaining({id:'17',path:task.path})));expect(runtime.native).not.toHaveBeenCalledWith('enqueueDownload',expect.anything());
  });
  it('opens videos directly and lets the user delete completed and failed downloads',async()=>{
    render(<NativeDownloadList tasks={[{...task,name:'课堂.mp4',resourceId:'canvas:201:0'},{...task,id:'18',name:'未完成.pdf',status:'failed'}]} scope='["student","42"]' notify={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'打开'}));expect(runtime.api).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'删除下载 课堂.mp4'}));fireEvent.click(screen.getByRole('button',{name:'删除下载 未完成.pdf'}));
    expect(runtime.native).toHaveBeenCalledWith('deleteDownload',expect.objectContaining({id:'17'}));expect(runtime.native).toHaveBeenCalledWith('deleteDownload',expect.objectContaining({id:'18'}));
  });
});
