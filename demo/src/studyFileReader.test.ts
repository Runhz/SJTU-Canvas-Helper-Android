import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('./runtime',()=>({NATIVE:true,native:vi.fn(),readPreparedFile:vi.fn(),cancelAi:vi.fn().mockResolvedValue(undefined)}));
vi.mock('./studyAttachments',async original=>({...await original<typeof import('./studyAttachments')>(),prepareSource:vi.fn(async s=>({id:'prepared-'+s.resourceId,name:s.name}))}));
import * as runtime from './runtime';
import {prepareSource} from './studyAttachments';
import {readQuestionMaterials,requestedPdfPages} from './studyFileReader';
const payload={mode:'file',args:{file:{id:42},fileName:'测试课件.pdf',courseId:'7'}};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(runtime.native).mockImplementation(async method=>(method==='studyStageForAi'?{path:'/private/source'}:method==='documentInfo'?{pages:20}:method==='documentPage'?{image:'data:image/jpeg;base64,YQ=='}:{}) as never);vi.mocked(runtime.readPreparedFile).mockResolvedValue({name:'测试课件.pdf',text:'[PDF 第 9 页]\n惟一知识点：离散变换'});});
it('supplies actual document text, page receipts and a bounded page image',async()=>{
 const result=await readQuestionMaterials(payload,'["account","identity"]',new AbortController().signal,vi.fn());
 expect(result.args.documents).toMatchObject([{id:'42',name:'测试课件.pdf',text:expect.stringContaining('离散变换'),images:[{page:1}],pages:20}]);
 expect(runtime.readPreparedFile).toHaveBeenCalledOnce();expect(runtime.native).toHaveBeenCalledWith('documentPage',expect.objectContaining({page:0,width:1000}));
 expect(JSON.stringify(result)).not.toContain('/private/');
 const again=await readQuestionMaterials(result,'["account","identity"]',new AbortController().signal,vi.fn());expect(again.args.documents).toEqual(result.args.documents);expect(runtime.readPreparedFile).toHaveBeenCalledOnce();
});
it('renders only three pages of a scanned PDF and states the unread range',async()=>{
 vi.mocked(runtime.readPreparedFile).mockRejectedValue(Error('[NO_TEXT] 无文字层'));
 const result=await readQuestionMaterials(payload,'["a","i"]',new AbortController().signal,vi.fn());
 const docs=result.args.documents as {images:unknown[];coverage:string}[];expect(docs[0].images).toHaveLength(3);expect(docs[0].coverage).toContain('其余页面图像尚未读取');
});
it('reads a specifically requested later page without downloading or reparsing the PDF',async()=>{
 const first=await readQuestionMaterials(payload,'["a","i"]',new AbortController().signal,vi.fn());
 const next=await readQuestionMaterials(first,'["a","i"]',new AbortController().signal,vi.fn(),'讲解第 9—10 页的图');
 expect((next.args.documents as {images:{page:number}[]}[])[0].images.map(i=>i.page)).toEqual([9,10]);expect(runtime.readPreparedFile).toHaveBeenCalledOnce();
 const continued=await readQuestionMaterials(next,'["a","i"]',new AbortController().signal,vi.fn(),'继续解释');expect((continued.args.documents as {images:{page:number}[]}[])[0].images.map(i=>i.page)).toEqual([9,10]);
 const replaced=await readQuestionMaterials(next,'["a","i"]',new AbortController().signal,vi.fn(),'第 3 页呢');expect(replaced.args.documentPages).toEqual([{id:'42',courseId:'7',pages:[3]}]);expect(runtime.readPreparedFile).toHaveBeenCalledOnce();
 expect(requestedPdfPages('page 20',20)).toEqual([20]);expect(()=>requestedPdfPages('第21页',20)).toThrow('范围');expect(()=>requestedPdfPages('第1-10页',20)).toThrow('最多');
});
it('keeps readable text when the optional PDF image renderer fails',async()=>{
 vi.mocked(runtime.native).mockImplementation(async method=>{if(method==='documentInfo')throw Error('图像不可用');return{path:'/private/source'} as never});
 const result=await readQuestionMaterials(payload,'["a","i"]',new AbortController().signal,vi.fn());expect((result.args.documents as {text:string;coverage:string}[])[0]).toMatchObject({text:expect.stringContaining('离散变换'),coverage:expect.stringContaining('图像无法渲染')});
});
it('extracts a new version once rather than using a stale body for the same file ID',async()=>{
 const original={...payload,args:{...payload.args,file:{id:42,updatedAt:'old',size:100}}};
 const first=await readQuestionMaterials(original,'["a","i"]',new AbortController().signal,vi.fn());
 const changed={...first,args:{...first.args,file:{id:42,updatedAt:'new',size:100}}};
 vi.mocked(runtime.readPreparedFile).mockResolvedValueOnce({name:'测试课件.pdf',text:'新版更正后的正文'});
 const next=await readQuestionMaterials(changed,'["a","i"]',new AbortController().signal,vi.fn());
 expect(runtime.readPreparedFile).toHaveBeenCalledTimes(2);expect((next.args.documents as {text:string}[])[0].text).toBe('新版更正后的正文');
 await readQuestionMaterials(next,'["a","i"]',new AbortController().signal,vi.fn());expect(runtime.readPreparedFile).toHaveBeenCalledTimes(2);
});
it('does not hide corruption or dispatch a cancelled read as usable material',async()=>{
 vi.mocked(runtime.readPreparedFile).mockRejectedValue(Error('文件已损坏'));
 await expect(readQuestionMaterials(payload,'["a","i"]',new AbortController().signal,vi.fn())).rejects.toThrow('已损坏');
 const controller=new AbortController();controller.abort();vi.mocked(prepareSource).mockRejectedValueOnce(Error('已取消准备'));
 await expect(readQuestionMaterials(payload,'["a","i"]',controller.signal,vi.fn())).rejects.toThrow('取消');
});
