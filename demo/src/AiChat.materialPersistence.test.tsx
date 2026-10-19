import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,native:vi.fn(),readPreparedFile:vi.fn(),cancelAi:vi.fn().mockResolvedValue(undefined),ai:vi.fn()}));
vi.mock('./studyAttachments',async original=>({...await original<typeof import('./studyAttachments')>(),prepareSource:vi.fn(async s=>({id:s.file?.raw?.preparedId||s.key,name:s.name}))}));
import * as runtime from './runtime';
import {prepareSource} from './studyAttachments';
import {activateChatScope} from './chatSession';
import {listConversations,newConversation,saveConversation} from './chatHistory';
import {AiChat} from './AiChat';
let scope='';let testNumber=0;
const entry={mode:'file',args:{file:{id:42,updatedAt:'2026-10-19',size:100},courseId:'7',fileName:'讲义.pdf'}};
function open(payload=entry){return render(<AiChat context="讲义.pdf" payload={payload} storageScope={scope} onTime={()=>{}} onConfigure={()=>{}}/>)}
async function send(question:string){await waitFor(()=>expect(screen.queryByText('正在恢复对话…')).toBeNull());fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:question}});fireEvent.click(screen.getByRole('button',{name:'发送问题'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'停止生成'})).toBeNull());await waitFor(()=>expect(screen.getAllByText('已依据资料回答').length).toBeGreaterThan(0));}
beforeEach(()=>{scope=JSON.stringify(['reopen-account',`identity-${++testNumber}`]);vi.clearAllMocks();activateChatScope(scope);vi.mocked(runtime.native).mockImplementation(async method=>(method==='studyStageForAi'?{path:'/private/source'}:method==='documentInfo'?{pages:20}:method==='documentPage'?{image:'data:image/jpeg;base64,YQ=='}:{}) as never);vi.mocked(runtime.readPreparedFile).mockResolvedValue({name:'讲义.pdf',text:'[PDF 第 9 页]\n稳定保留的资料正文'});vi.mocked(runtime.ai).mockImplementation(async(_mode,_args,_question,emit)=>{emit('已依据资料回答');return '已依据资料回答'});});
afterEach(async()=>{cleanup();activateChatScope('cleanup');await listConversations(scope)});
it('reuses the parsed PDF and page image after closing and after recreating the app session',async()=>{
 const view=open();await send('第一次解释');expect(runtime.readPreparedFile).toHaveBeenCalledOnce();expect(prepareSource).toHaveBeenCalledOnce();
 view.unmount();await listConversations(scope);activateChatScope('app-restarted');activateChatScope(scope);
 const reopened=open();await send('继续解释');expect(runtime.readPreparedFile).toHaveBeenCalledOnce();expect(prepareSource).toHaveBeenCalledOnce();expect(runtime.native).toHaveBeenCalledTimes(3);
 expect(vi.mocked(runtime.ai).mock.calls[1][1].documents).toMatchObject([{text:expect.stringContaining('稳定保留'),images:[{page:1}]}]);
 reopened.unmount();await listConversations(scope);activateChatScope('app-restarted-again');activateChatScope(scope);open();
 await waitFor(()=>expect(screen.queryByText('正在恢复对话…')).toBeNull());const more=screen.getAllByText('更多')[0];fireEvent.click(more);fireEvent.click(within(more.parentElement!).getByRole('button',{name:'太难了'}));await waitFor(()=>expect(runtime.ai).toHaveBeenCalledTimes(3));expect(runtime.readPreparedFile).toHaveBeenCalledOnce();
});
it('retains already prepared materials even when the user closes before the first question',async()=>{
 const prepared={...entry,args:{...entry.args,documents:[{id:'42',courseId:'7',name:'讲义.pdf',text:'尚未提问的已读正文',preparedId:'file:42:2026-10-19:100',version:'file:42:2026-10-19:100',coverage:'已读取'}]}};
 const view=open(prepared);await waitFor(()=>expect(screen.queryByText('正在恢复对话…')).toBeNull());view.unmount();const rows=await listConversations(scope);expect(rows.some(r=>JSON.stringify(r.payload).includes('尚未提问的已读正文'))).toBe(true);
 open();await send('第一次正式提问');expect(runtime.readPreparedFile).not.toHaveBeenCalled();expect(vi.mocked(runtime.ai).mock.calls[0][1].documents).toMatchObject([{text:'尚未提问的已读正文'}]);
});
it('restores a persisted old turn without keeping document bodies in every turn',async()=>{
 const payload={...entry,args:{...entry.args,documents:[{id:'42',courseId:'7',name:'讲义.pdf',text:'旧轮次引用的正文',preparedId:'file:42:2026-10-19:100',version:'file:42:2026-10-19:100',coverage:'已读取',pages:20,images:[{page:2,image:'data:image/jpeg;base64,YQ=='}]}]}};
 const row=newConversation('old-turn-scope','讲义.pdf',payload);row.messages=[{role:'user',content:'旧问题'},{role:'assistant',content:'旧回答'}];row.turns=[{id:'old-turn',messageIndex:0,payload,status:'open',createdAt:1}];row.payload={...payload,args:{...payload.args,documents:[{...payload.args.documents[0],images:[{page:3,image:'data:image/jpeg;base64,Yg=='}]}]}};await saveConversation(row);
 render(<AiChat context="讲义.pdf" payload={{...entry,args:{...entry.args,conversationId:row.id,turnId:'old-turn'}}} storageScope="old-turn-scope" onTime={()=>{}} onConfigure={()=>{}}/>);await send('针对旧问题继续');expect(runtime.readPreparedFile).not.toHaveBeenCalled();expect(vi.mocked(runtime.ai).mock.calls[0][1].documents).toMatchObject([{text:'旧轮次引用的正文',images:[{page:2}]}]);expect(runtime.native).toHaveBeenCalledWith('documentPage',expect.objectContaining({page:1}));
});
it('does not reuse another account identity\'s document for the same file ID',async()=>{
 const view=open();await send('账号甲的问题');view.unmount();await listConversations(scope);
 scope='["reopen-account","different-school-user"]';activateChatScope(scope);
 vi.mocked(runtime.readPreparedFile).mockResolvedValueOnce({name:'讲义.pdf',text:'账号乙的资料内容'});
 open();await send('账号乙的问题');expect(runtime.readPreparedFile).toHaveBeenCalledTimes(2);
 const args=vi.mocked(runtime.ai).mock.calls[1][1];expect(args.documents).toMatchObject([{text:'账号乙的资料内容'}]);expect(JSON.stringify(args)).not.toContain('稳定保留的资料正文');
});
