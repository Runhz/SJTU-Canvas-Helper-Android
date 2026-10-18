import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',async original=>({...await original<typeof import('./runtime')>(),NATIVE:true,native:vi.fn(),api:vi.fn()}));
vi.mock('./studyAttachments',async original=>({...await original<typeof import('./studyAttachments')>(),prepareSource:vi.fn()}));
import * as runtime from './runtime';
import {prepareSource} from './studyAttachments';
import DocumentReader from './DocumentReader';
const file={id:'42',name:'中文课件.pptx',kind:'PPTX',size:'200 MB',updated:'今天',raw:{id:42,updatedAt:'v1',size:200000000}};
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',(f:()=>void)=>setTimeout(f,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.mocked(runtime.api).mockResolvedValue({url:'https://oc.sjtu.edu.cn/login/session_token/signed-private'});vi.mocked(runtime.native).mockResolvedValue({state:'ready'})});
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
describe('official inline document preview',()=>{
  it('asks about the visible document screenshot without downloading the original and keeps the file conversation identity',async()=>{
    const ask=vi.fn();vi.mocked(runtime.native).mockImplementation(async method=>method==='captureDocument'?{image:'data:image/jpeg;base64,YWJj'}:{state:'ready'} as never);
    render(<DocumentReader scope="student" courseId="7" file={file} onClose={()=>{}} onAi={ask}/>);
    await waitFor(()=>expect((screen.getByRole('button',{name:'截图提问'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'截图提问'}));
    await waitFor(()=>expect(ask).toHaveBeenCalledWith({mode:'materials',args:expect.objectContaining({file:{id:42},courseId:'7',fileName:file.name,screenshot:'data:image/jpeg;base64,YWJj',text:''})}));expect(prepareSource).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'AI 总结'}));expect(ask).toHaveBeenLastCalledWith({mode:'file',args:expect.objectContaining({readMode:'full',initialQuestion:expect.any(String)})});
  });
  it.each(['pptx','pdf','doc','docx','png'])('uses the platform viewer for %s without a full-file download or local parser',async ext=>{
    render(<DocumentReader scope="student" accountId="student" courseId="7" file={{...file,name:`讲义.${ext}`}} onClose={()=>{}}/>);
    await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('embedDocument',expect.objectContaining({scope:'student',url:expect.stringContaining('oc.sjtu.edu.cn'),rect:expect.objectContaining({viewportWidth:innerWidth})})));
    expect(prepareSource).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('signed-private');expect(screen.queryByText('本地预览')).toBeNull();expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps a bounded card in the course page and enlarges the existing native session only on request',async()=>{
    render(<DocumentReader scope="student" courseId="7" file={file} onClose={()=>{}}/>);
    await waitFor(()=>expect((screen.getByRole('button',{name:'放大阅读'}) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByLabelText('文件预览窗口').closest('.document-preview-card')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'放大阅读'}));
    expect(runtime.native).toHaveBeenCalledWith('documentPreviewControl',expect.objectContaining({action:'fullscreen'}));expect(runtime.api).toHaveBeenCalledOnce();
  });
  it('does not open a late session after returning to the file list',async()=>{
    let reply!:(v:{url:string})=>void;vi.mocked(runtime.api).mockReturnValue(new Promise(r=>reply=r) as never);
    const view=render(<DocumentReader scope="student" courseId="7" file={file} onClose={()=>{}}/>);view.unmount();reply({url:'https://oc.sjtu.edu.cn/preview'});await Promise.resolve();expect(runtime.native).not.toHaveBeenCalledWith('embedDocument',expect.anything());
  });
  it('offers retry and external opening on official failure, without reverting to a local reader',async()=>{
    vi.mocked(runtime.api).mockRejectedValue(Error('平台暂未提供预览'));render(<DocumentReader scope="student" accountId="student" courseId="7" file={file} onClose={()=>{}}/>);
    expect((await screen.findByRole('alert')).textContent).toContain('平台暂未提供预览');expect(screen.getByRole('button',{name:'外部打开'})).toBeTruthy();expect(prepareSource).not.toHaveBeenCalled();expect(screen.queryByText('阅读文字')).toBeNull();
  });
  it('releases its specific native view on leave',async()=>{
    const view=render(<DocumentReader scope="student" courseId="7" file={file} onClose={()=>{}}/>);await waitFor(()=>expect(runtime.native).toHaveBeenCalledWith('embedDocument',expect.anything()));const id=vi.mocked(runtime.native).mock.calls.find(c=>c[0]==='embedDocument')?.[1]?.id;view.unmount();expect(runtime.native).toHaveBeenCalledWith('documentPreviewControl',{id,action:'close'});
  });
});
