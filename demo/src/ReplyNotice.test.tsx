import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {act,cleanup,render,screen,fireEvent} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,native:vi.fn().mockResolvedValue({}),ai:vi.fn(),cancelAi:vi.fn().mockResolvedValue(undefined)}));
import * as runtime from './runtime';
import {ReplyNotice} from './ReplyNotice';
import {newConversation} from './chatHistory';
import {activateChatScope,startChat,viewChat,stopChat} from './chatSession';
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();activateChatScope('notice')});afterEach(()=>{cleanup();activateChatScope('cleanup')});
describe('reply completion reminders',()=>{
  it('notifies only after an unseen successful answer and resumes the specific conversation',async()=>{
    const open=vi.fn();vi.mocked(runtime.ai).mockResolvedValue('完整回答');render(<ReplyNotice scope="notice" onOpen={open}/>);const row=newConversation('notice','课堂问题',{mode:'agent',args:{}});await act(async()=>startChat(row,'问题'));fireEvent.click(screen.getByRole('button',{name:/AI 回答已完成/}));expect(open).toHaveBeenCalledWith(row.id);expect(runtime.native).toHaveBeenCalledWith('notifyAiComplete',{scope:'notice',conversationId:row.id});
  });
  it('stays quiet while reading, after explicit cancellation, and for another identity',async()=>{
    vi.mocked(runtime.ai).mockResolvedValue('完成');render(<ReplyNotice scope="notice" onOpen={()=>{}}/>);const row=newConversation('notice','正在看',{mode:'agent',args:{}}),leave=viewChat(row.id,true);await act(async()=>startChat(row,'问题'));expect(runtime.native).not.toHaveBeenCalled();leave();
    let finish!:(s:string)=>void;vi.mocked(runtime.ai).mockImplementation(()=>new Promise(r=>finish=r));const second=newConversation('notice','取消',{mode:'agent',args:{}});startChat(second,'问题');stopChat(second.id);await act(async()=>finish('迟到的回答'));expect(runtime.native).not.toHaveBeenCalled();act(()=>window.dispatchEvent(new CustomEvent('canvas-ai-complete',{detail:{scope:'other',id:'other',title:'other'}})));expect(screen.queryByRole('status')).toBeNull();
  });
});
