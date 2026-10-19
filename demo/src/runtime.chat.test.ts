import {describe,expect,it,vi} from 'vitest';
const {invoke}=vi.hoisted(()=>({invoke:vi.fn().mockResolvedValue('回答')}));
vi.mock('@tauri-apps/api/core',()=>({invoke,isTauri:()=>true,Channel:class{onmessage=()=>{};}}));
import {ai,type ChatMessage} from './runtime';
describe('conversation context transport',()=>{
  it('preserves restored history beyond twelve messages for model-capacity selection',async()=>{
    const messages:ChatMessage[]=Array.from({length:30},(_,i)=>({role:i%2?'assistant':'user',content:`第 ${i} 条历史内容`}));
    await ai('materials',{text:'原始字幕'},'继续解释',()=>{},messages,{requestId:'test-context'});
    expect(invoke).toHaveBeenCalledWith('ai_chat',expect.objectContaining({messages:[...messages,{role:'user',content:'继续解释'}],requestId:'test-context'}));
  });
  it('routes model reasoning separately and does not send old reasoning back as answer text',async()=>{
    const reasoning=vi.fn();await ai('materials',{text:'PDF 正文'},'解释',()=>{},[{role:'assistant',content:'结论',reasoning:'不应重发的思考'}],{onReasoning:reasoning});
    const args=invoke.mock.calls.at(-1)![1];args.onReasoning.onmessage('服务返回的思考片段');expect(reasoning).toHaveBeenCalledWith('服务返回的思考片段');expect(args.messages[0]).toEqual({role:'assistant',content:'结论'});
  });
});
