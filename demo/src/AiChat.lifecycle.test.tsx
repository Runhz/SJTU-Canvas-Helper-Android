import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const materials=vi.hoisted(()=>vi.fn());
vi.mock('./StudyAiHub',()=>({useStudyAi:()=>({materials})}));
vi.mock('./ImageCropper',()=>({ImageCropper:()=> <div>截图编辑界面</div>}));
vi.mock('./runtime',()=>({NATIVE:true,ai:vi.fn(),native:vi.fn().mockResolvedValue({}),cancelAi:vi.fn().mockResolvedValue(undefined)}));
vi.mock('./studyFileReader',()=>({readQuestionMaterials:vi.fn(async payload=>payload)}));
import * as runtime from './runtime';
import {AiChat} from './AiChat';
import {activateChatScope,chatJob,startChat} from './chatSession';
import {listConversations,newConversation,saveConversation,deleteConversation,type AiPayload} from './chatHistory';
let scope='';let revision=0;const noop=()=>{};
const props=(payload:{mode:string;args:Record<string,unknown>},context='课堂甲')=>({context,payload,storageScope:scope,onTime:noop,onConfigure:noop});
const ready=async()=>waitFor(()=>expect(screen.queryByText('正在恢复对话…')).toBeNull());
beforeEach(()=>{scope=`lifecycle-${++revision}`;activateChatScope(scope);vi.clearAllMocks();vi.mocked(runtime.ai).mockResolvedValue('回答')});
afterEach(async()=>{cleanup();activateChatScope('cleanup');await listConversations(scope)});
it('saves the old draft before a quick switch to a different file entry',async()=>{
 const view=render(<AiChat {...props({mode:'file',args:{file:{id:1},courseId:'7'}})}/>);await ready();
 fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'还没来得及保存的草稿'}});
 view.rerender(<AiChat {...props({mode:'file',args:{file:{id:2},courseId:'7'}},'课堂乙')}/>);await ready();
 expect((await listConversations(scope)).find(r=>r.source==='file:1')?.draft).toBe('还没来得及保存的草稿');
});
it('creates a genuinely new chat even when an older job for that source exists',async()=>{
 const row=newConversation(scope,'旧对话',{mode:'agent',args:{}});startChat(row,'不应带入的新问题');await vi.waitFor(()=>expect(chatJob(row.id)?.busy).toBe(false));
 render(<AiChat {...props({mode:'agent',args:{newChat:true}})}/>);await ready();expect(screen.queryByText('不应带入的新问题')).toBeNull();
 fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'新对话草稿'}});cleanup();const records=await listConversations(scope);expect(records.find(r=>r.draft==='新对话草稿')?.id).not.toBe(row.id);
});
it('does not silently open a different chat when an explicit conversation ID is missing',async()=>{
 const row=newConversation(scope,'别的对话',{mode:'agent',args:{}});row.messages=[{role:'user',content:'其他对话中的私有问题'}];await saveConversation(row);
 render(<AiChat {...props({mode:'agent',args:{conversationId:'already-deleted'}})}/>);await ready();expect(screen.queryByText('其他对话中的私有问题')).toBeNull();expect(screen.getByText('原对话已删除或不可用，已打开新对话')).toBeTruthy();
});
it('does not recreate a conversation after deleting it from the current chat history',async()=>{
 const row=newConversation(scope,'要删除的对话',{mode:'agent',args:{}});row.messages=[{role:'user',content:'待删除的问题'}];await saveConversation(row);
 render(<AiChat {...props({...row.payload,args:{conversationId:row.id}})}/>);await ready();fireEvent.click(screen.getByRole('button',{name:'历史对话'}));await waitFor(()=>expect(screen.getByRole('button',{name:'删除对话 要删除的对话'})).toBeTruthy());
 fireEvent.click(screen.getByRole('button',{name:'删除对话 要删除的对话'}));fireEvent.click(screen.getByRole('button',{name:'确认删除对话'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'确认删除对话'})).toBeNull());cleanup();
 expect((await listConversations(scope)).some(r=>r.id===row.id)).toBe(false);
});
it('clears a loaded conversation when it is deleted from another pane',async()=>{
 const row=newConversation(scope,'双栏对话',{mode:'agent',args:{}});row.messages=[{role:'user',content:'另一个栏将删除这个问题'}];await saveConversation(row);
 render(<AiChat {...props({...row.payload,args:{conversationId:row.id}})}/>);await ready();expect(screen.getByText('另一个栏将删除这个问题')).toBeTruthy();
 await act(async()=>deleteConversation(scope,row.id));expect(screen.queryByText('另一个栏将删除这个问题')).toBeNull();expect(screen.getByText('这段对话已删除，已打开新对话')).toBeTruthy();
});
it('resumes the newest saved draft instead of an older completed in-memory chat',async()=>{
 const old=newConversation(scope,'旧对话',{mode:'agent',args:{}});startChat(old,'旧问题');await vi.waitFor(()=>expect(chatJob(old.id)?.busy).toBe(false));
 const newer=newConversation(scope,'新草稿',{mode:'agent',args:{}});newer.draft='应恢复的最新草稿';newer.updatedAt=chatJob(old.id)!.row.updatedAt+1000;await saveConversation(newer);
 render(<AiChat {...props({mode:'agent',args:{}})}/>);await ready();expect((screen.getByRole('textbox',{name:'向学习助手提问'}) as HTMLTextAreaElement).value).toBe('应恢复的最新草稿');expect(screen.queryByText('旧问题')).toBeNull();
});
it('keeps the selected teaching method, draft and history when changing skill and reopening',async()=>{
 const row=newConversation(scope,'教学方式',{mode:'agent',args:{}});row.messages=[{role:'user',content:'原来的问题'},{role:'assistant',content:'原来的回答'}];await saveConversation(row);
 const payload={mode:'agent',args:{conversationId:row.id}};render(<AiChat {...props(payload)}/>);await ready();
 fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'这一步为什么成立'}});fireEvent.click(screen.getByRole('button',{name:'选择学习 skill'}));fireEvent.click(screen.getByRole('button',{name:/启发式提示/}));fireEvent.click(screen.getByRole('button',{name:'使用启发式提示'}));
 expect((screen.getByRole('textbox',{name:'向学习助手提问'}) as HTMLTextAreaElement).value).toBe('这一步为什么成立');expect(screen.getByText('原来的回答')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'发送问题'}));await waitFor(()=>expect(runtime.ai).toHaveBeenCalled());expect(vi.mocked(runtime.ai).mock.calls[0][1].learningSkill).toBe('hint');await waitFor(()=>expect(screen.queryByRole('button',{name:'停止生成'})).toBeNull());cleanup();
 render(<AiChat {...props(payload)}/>);await ready();expect(screen.getByRole('button',{name:'选择学习 skill'}).textContent).toContain('启发式提示');
});
it('does not attach an old material selection to a newly opened conversation',async()=>{
 const view=render(<AiChat {...props({mode:'file',args:{file:{id:101},courseId:'7'}})}/>);await ready();fireEvent.click(screen.getByRole('button',{name:'提问资料'}));
 const confirm=materials.mock.calls[0][2] as (payload:AiPayload)=>void;
 view.rerender(<AiChat {...props({mode:'file',args:{file:{id:102},courseId:'7'}},'另一个文件')}/>);await ready();
 act(()=>confirm({mode:'file',args:{file:{id:101},courseId:'7',text:'甲文件的资料'}}));
 fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'乙文件草稿'}});cleanup();
 expect((await listConversations(scope)).find(r=>r.draft==='乙文件草稿')?.payload.args.file).toEqual({id:102});
});
it('closes screenshot editing before switching to a new image entry',async()=>{
 const image='data:image/jpeg;base64,YQ==';const view=render(<AiChat {...props({mode:'materials',args:{resourceId:'canvas:1',screenshot:image}})}/>);await ready();fireEvent.click(screen.getByRole('button',{name:'编辑提问截图'}));expect(screen.getByText('截图编辑界面')).toBeTruthy();
 view.rerender(<AiChat {...props({mode:'materials',args:{resourceId:'canvas:2',screenshot:image}},'课堂乙')}/>);await ready();expect(screen.queryByText('截图编辑界面')).toBeNull();
});
it('closes note extraction when switching conversations so the summary cannot be saved under another source',async()=>{
 const row=newConversation(scope,'甲课堂',{mode:'materials',args:{resourceId:'canvas:1'}});row.messages=[{role:'assistant',content:'甲课堂回答'}];await saveConversation(row);
 const view=render(<AiChat {...props({...row.payload,args:{...row.payload.args,conversationId:row.id}})}/>);await ready();fireEvent.click(screen.getByRole('button',{name:'整理成笔记'}));await screen.findByRole('textbox',{name:'提炼笔记内容'});
 view.rerender(<AiChat {...props({mode:'materials',args:{resourceId:'canvas:2'}},'乙课堂')}/>);await ready();expect(screen.queryByRole('textbox',{name:'提炼笔记内容'})).toBeNull();
});
