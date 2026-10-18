import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('./runtime',()=>({NATIVE:true,ai:vi.fn(),cancelAi:vi.fn().mockResolvedValue(undefined)}));
import * as runtime from './runtime';
import {newConversation,listConversations} from './chatHistory';
import {activateChatScope,startChat,chatJob,stopChat,patchChat,flushChats} from './chatSession';
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();activateChatScope('a')});afterEach(()=>activateChatScope('cleanup'));
describe('foreground assistant jobs',()=>{
  it('preserves every streamed character on an incomplete finish and continues with the partial answer in history',async()=>{
    vi.mocked(runtime.ai).mockImplementationOnce((_m,_a,_q,emit)=>{emit('还没写完**比');return Promise.reject(Error('[INCOMPLETE] 回答达到服务的生成长度上限'))}).mockResolvedValue('补完剩余内容');
    const row=newConversation('a','课堂',{mode:'materials',args:{resourceId:'canvas:9',positionMs:12000,text:'课堂资料'}});startChat(row,'详细解释');await vi.waitFor(()=>expect(chatJob(row.id)?.busy).toBe(false));const incomplete=chatJob(row.id)!;
    expect(incomplete.row.messages[1].content).toBe('还没写完**比');expect(incomplete.row.interrupted).toBe(true);expect(incomplete.unread).toBe(false);
    startChat(incomplete.row,'请从中断处继续');await vi.waitFor(()=>expect(chatJob(row.id)?.row.interrupted).toBe(false));expect(vi.mocked(runtime.ai).mock.calls[1][4]).toEqual([{role:'user',content:'详细解释'},{role:'assistant',content:'还没写完**比'}]);
  });
  it('continues independently of views, freezes each question context and keeps newer drafts and context during completion',async()=>{
    let done!:(s:string)=>void;vi.mocked(runtime.ai).mockImplementation((_m,_a,_q,emit)=>{emit('半段');return new Promise(r=>done=r)});
    const row=newConversation('a','课堂',{mode:'materials',args:{resourceId:'canvas:1',positionMs:10000,text:'原位置',screenshot:'data:image/jpeg;base64,YQ=='}});startChat(row,'为什么');const j=chatJob(row.id)!;patchChat({...j.row,draft:'正在写的新问题',payload:{mode:'materials',args:{resourceId:'canvas:1',positionMs:30000,text:'新位置'}}});flushChats();
    expect(j.row.turns?.[0].payload.args.positionMs).toBe(10000);done('回答\n<study_meta>{"questions":["接下来问什么？"],"symbols":[]}</study_meta>');await vi.waitFor(()=>expect(j.busy).toBe(false));
    expect(j.row.draft).toBe('正在写的新问题');expect(j.row.payload.args.positionMs).toBe(30000);expect(j.row.turns?.[0].payload.args.text).toBe('原位置');expect(j.row.messages[j.row.messages.length-1].content).toBe('回答');expect(j.row.followUps).toEqual(['接下来问什么？']);expect(runtime.cancelAi).not.toHaveBeenCalled();
  });
  it('flushes pending text on explicit stop and ignores a late server reply',async()=>{
    let done!:(s:string)=>void;vi.mocked(runtime.ai).mockImplementation((_m,_a,_q,emit)=>{emit('还未绘制的内容');return new Promise(r=>done=r)});const row=newConversation('a','课堂',{mode:'agent',args:{}});startChat(row,'问题');stopChat(row.id);expect(chatJob(row.id)?.row.messages[1].content).toBe('还未绘制的内容');done('不该覆盖');await Promise.resolve();expect(chatJob(row.id)?.row.messages[1].content).toBe('还未绘制的内容');expect(runtime.cancelAi).toHaveBeenCalledOnce();
  });
  it('cancels the old identity on account switch and persists only sanitized anchored payloads',async()=>{
    vi.mocked(runtime.ai).mockImplementation(()=>new Promise(()=>{}));const row=newConversation('a','课堂',{mode:'materials',args:{resourceId:'canvas:1',positionMs:1,text:'原文',token:'SECRET',url:'https://x/?cookie=SECRET'}});startChat(row,'问题');activateChatScope('b');expect(runtime.cancelAi).toHaveBeenCalledOnce();expect(chatJob(row.id)).toBeUndefined();const records=await listConversations('a');expect(JSON.stringify(records)).not.toContain('SECRET');expect(records[0].turns?.[0].payload.args.positionMs).toBe(1);expect(await listConversations('b')).toEqual([]);
  });
});
