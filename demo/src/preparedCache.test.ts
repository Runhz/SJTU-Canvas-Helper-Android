import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('./runtime',()=>({NATIVE:true,native:vi.fn(),api:vi.fn(),subscribeDownloads:vi.fn(),currentDownloads:vi.fn()}));
import * as runtime from './runtime';
import {fileSource,prepareSource} from './studyAttachments';
beforeEach(()=>vi.clearAllMocks());
describe('offline prepared course files',()=>{
  it('reuses a version-matched local file before asking Canvas for any URL',async()=>{
    const source=fileSource({id:'42',name:'讲义.pdf',kind:'PDF',size:'1 MB',updated:'今天',raw:{updatedAt:'v2',size:100}},'7');
    const item={id:source.key,name:source.name,mime:source.mime,size:100,kind:'file',courseId:'7',resourceId:'42',updatedAt:1};vi.mocked(runtime.native).mockResolvedValue({items:[item]} as never);
    expect(await prepareSource(source,'student','student',new AbortController().signal,()=>{})).toEqual(item);expect(runtime.api).not.toHaveBeenCalled();expect(runtime.native).toHaveBeenCalledTimes(1);
  });
  it('does not reuse an old version when the course metadata changed',async()=>{
    const source=fileSource({id:'42',name:'讲义.pdf',kind:'PDF',size:'1 MB',updated:'今天',raw:{updatedAt:'v3',size:100}},'7');vi.mocked(runtime.native).mockResolvedValue({items:[{id:'file:42:v2:100'}]} as never);vi.mocked(runtime.api).mockRejectedValue(Error('offline'));
    await expect(prepareSource(source,'student','student',new AbortController().signal,()=>{})).rejects.toThrow('offline');expect(runtime.api).toHaveBeenCalledWith('downloadPlan',expect.anything());
  });
  it('shows first-download progress and waits for the complete original before registering it',async()=>{
    const source=fileSource({id:'42',name:'大课件.pptx',kind:'PPTX',size:'100 MB',updated:'今天',raw:{updatedAt:'v1',size:100}},'7');
    const progress=vi.fn(),unsubscribe=vi.fn();let update:((tasks:runtime.NativeTask[])=>void)|undefined;
    const task={id:'download1',name:source.name,courseId:'7',resourceId:'42',path:'',status:'running' as const,progress:37,reason:0};
    vi.mocked(runtime.subscribeDownloads).mockImplementation(handler=>{update=handler;return unsubscribe});vi.mocked(runtime.currentDownloads).mockReturnValue([task]);
    vi.mocked(runtime.api).mockResolvedValue({size:100,updatedAt:'v1',name:source.name});
    vi.mocked(runtime.native).mockImplementation(async method=>method==='studyPrepared'?{items:[]}:method==='enqueueDownload'?{id:task.id}:method==='studyRegisterDownload'?{id:source.key}:{} as never);
    const reading=prepareSource(source,'student','student',new AbortController().signal,progress);
    await vi.waitFor(()=>expect(progress).toHaveBeenCalledWith('正在下载文件 · 37%'));
    expect(vi.mocked(runtime.native).mock.calls.some(call=>call[0]==='studyRegisterDownload')).toBe(false);
    update!([{...task,status:'completed',progress:100}]);await expect(reading).resolves.toMatchObject({id:source.key});expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
