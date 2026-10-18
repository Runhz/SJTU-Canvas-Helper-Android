import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,ai:vi.fn(),native:vi.fn().mockResolvedValue({}),cancelAi:vi.fn().mockResolvedValue(undefined)}));
import * as runtime from './runtime';
import {AiChat} from './AiChat';
import {listConversations} from './chatHistory';
import {activateChatScope,flushChats} from './chatSession';
const payload={mode:'materials',args:{resourceId:'canvas:42',text:'课堂原字幕',timePoints:[4]}};
const props={storageScope:'student-a',context:'测试课堂',payload,onTime:vi.fn(),onConfigure:vi.fn()};
beforeEach(async()=>{await listConversations('unused');localStorage.clear();vi.clearAllMocks();activateChatScope('student-a');});
afterEach(()=>{cleanup();activateChatScope('cleanup')});
async function ready(){await waitFor(()=>expect((screen.getByRole('textbox',{name:'向学习助手提问'}) as HTMLTextAreaElement).disabled).toBe(false));}
function question(text:string){fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:text}});fireEvent.click(screen.getByRole('button',{name:'发送问题'}));}
describe('persistent classroom chat',()=>{
  it('keeps streaming while closed and restores full context and a draft after remount',async()=>{
    let emit!:(s:string)=>void,resolve!:(s:string)=>void;
    vi.mocked(runtime.ai).mockImplementationOnce((_m,_a,_q,onText)=>{emit=onText;return new Promise(r=>resolve=r);}).mockResolvedValueOnce('第二次回答');
    const view=render(<AiChat {...props}/>);await ready();question('第一问');
    act(()=>emit('半段回答'));
    view.rerender(<AiChat {...props} open={false}/>);
    expect(runtime.cancelAi).not.toHaveBeenCalled();
    await act(async()=>{emit('，继续接收');resolve('完整回答');});
    view.rerender(<AiChat {...props}/>);expect(screen.getByText('完整回答')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'第二问草稿'}});
    view.unmount();render(<AiChat {...props}/>);await ready();
    expect((screen.getByRole('textbox',{name:'向学习助手提问'}) as HTMLTextAreaElement).value).toBe('第二问草稿');
    expect(screen.getByText('完整回答')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'发送问题'}));
    await waitFor(()=>expect(runtime.ai).toHaveBeenCalledTimes(2));
    expect(vi.mocked(runtime.ai).mock.calls[1][4]).toEqual([{role:'user',content:'第一问'},{role:'assistant',content:'完整回答'}]);
    expect(vi.mocked(runtime.ai).mock.calls[1][1]).toEqual(expect.objectContaining({text:'课堂原字幕',resourceId:'canvas:42'}));
    await waitFor(()=>expect(screen.getByText('第二次回答')).toBeTruthy());
  });
  it('flushes partial text on teardown, exposes it in history and does not resend automatically',async()=>{
    vi.mocked(runtime.ai).mockImplementation((_m,_a,_q,emit)=>{emit('已收到但还没绘制的正文');return new Promise(()=>{});});
    const view=render(<AiChat {...props}/>);await ready();question('解释公式');view.unmount();
    expect(runtime.cancelAi).not.toHaveBeenCalled();flushChats();
    const rows=await listConversations('student-a');expect(rows[0].messages.at(-1)?.content).toBe('已收到但还没绘制的正文');expect(rows[0].interrupted).toBe(true);
    render(<AiChat {...props} payload={{mode:'agent',args:{history:true}}}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:/测试课堂.*解释公式/})).toBeTruthy());
    fireEvent.click(screen.getByRole('button',{name:/测试课堂.*解释公式/}));
    expect(screen.getByText('已收到但还没绘制的正文')).toBeTruthy();expect(runtime.ai).toHaveBeenCalledTimes(1);
  });
});
