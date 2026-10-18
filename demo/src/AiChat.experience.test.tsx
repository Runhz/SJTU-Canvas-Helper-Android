import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,ai:vi.fn(),native:vi.fn(),cancelAi:vi.fn().mockResolvedValue(undefined)}));
import * as runtime from './runtime';
import {AiChat} from './AiChat';
import {activateChatScope} from './chatSession';
import {listConversations} from './chatHistory';
const payload={mode:'materials',args:{resourceId:'canvas:1',title:'电路课',text:'L 表示电感',positionMs:23000,positionLabel:'00:00:23',timePoints:[10],studyAssist:true}};
const props={context:'电路课',payload,storageScope:'experience',onTime:vi.fn(),onConfigure:vi.fn()};
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();activateChatScope('experience')});afterEach(()=>{cleanup();activateChatScope('cleanup')});
async function ready(){await waitFor(()=>expect((screen.getByRole('textbox',{name:'向学习助手提问'}) as HTMLTextAreaElement).disabled).toBe(false))}
describe('low-friction classroom assistant',()=>{
  it('sends a preset immediately, generates follow-ups in the same request and never replaces a draft',async()=>{
    let complete!:(s:string)=>void;vi.mocked(runtime.ai).mockImplementation(()=>new Promise(r=>complete=r));render(<AiChat {...props}/>);await ready();
    fireEvent.click(screen.getByRole('button',{name:'解释这一步'}));expect(runtime.ai).toHaveBeenCalledOnce();fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'我已经开始写下一问'}});
    await act(async()=>complete('这是解释。<study_meta>{"questions":["这个条件可以去掉吗？","能举例吗？"],"symbols":[]}</study_meta>'));
    expect(screen.queryByText(/study_meta/)).toBeNull();expect((screen.getByRole('textbox',{name:'向学习助手提问'}) as HTMLTextAreaElement).value).toBe('我已经开始写下一问');expect(runtime.ai).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'发送问题'}));expect(runtime.ai).toHaveBeenCalledTimes(2);expect(vi.mocked(runtime.ai).mock.calls[1][2]).toContain('这个条件可以去掉吗？');
  });
  it('keeps one-tap feedback attached to the original answer position after moving the video context',async()=>{
    vi.mocked(runtime.ai).mockResolvedValue('解释内容');const view=render(<AiChat {...props}/>);await ready();fireEvent.click(screen.getByRole('button',{name:'解释这一步'}));await screen.findByText('解释内容');
    view.rerender(<AiChat {...props} payload={{...payload,args:{...payload.args,positionMs:90000,positionLabel:'00:01:30',text:'另一个片段'}}}/>);await ready();
    fireEvent.click(screen.getByText('更多'));fireEvent.click(screen.getByRole('button',{name:'太难了'}));await waitFor(()=>expect(runtime.ai).toHaveBeenCalledTimes(2));expect(vi.mocked(runtime.ai).mock.calls[1][1]).toEqual(expect.objectContaining({positionMs:23000,text:'L 表示电感'}));
  });
  it('marks questions and resumes from a deliberate five-second lead-in without automatically playing on close',async()=>{
    vi.mocked(runtime.ai).mockResolvedValue('回答');const onPlayback=vi.fn();render(<AiChat {...props} onPlayback={onPlayback}/>);await ready();fireEvent.click(screen.getByRole('button',{name:'解释这一步'}));await screen.findByText('回答');fireEvent.click(screen.getByRole('button',{name:'稍后再看'}));await waitFor(async()=>expect((await listConversations('experience'))[0].turns?.[0].status).toBe('later'));expect(onPlayback).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'从 00:00:18 继续看'}));expect(onPlayback).toHaveBeenCalledWith(expect.objectContaining({args:expect.objectContaining({positionMs:23000})}),18000,true);
  });
  it('keeps a compact text composer without the removed speech entry',async()=>{
    render(<AiChat {...props}/>);await ready();fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'已有草稿'}});expect(screen.queryByRole('button',{name:'语音输入'})).toBeNull();const expand=screen.getByRole('button',{name:'扩大输入框'});expect(expand.closest('.compose-main')).toBeTruthy();expect(expand.textContent).toBe('');fireEvent.click(expand);expect((screen.getByRole('textbox',{name:'向学习助手提问'}) as HTMLTextAreaElement).value).toBe('已有草稿');expect(runtime.ai).not.toHaveBeenCalled();
  });
  it('offers a selection popup, quotes only on click and preserves the selected answer source when sending',async()=>{
    vi.mocked(runtime.ai).mockResolvedValue('电感电流在有限电压下连续');const view=render(<AiChat {...props}/>);await ready();fireEvent.click(screen.getByRole('button',{name:'解释这一步'}));const answer=await screen.findByText('电感电流在有限电压下连续');
    view.rerender(<AiChat {...props} payload={{...payload,args:{...payload.args,positionMs:90000,text:'稍后的讲解'}}}/>);await ready();
    const removeAllRanges=vi.fn(),selection=vi.spyOn(window,'getSelection').mockReturnValue({isCollapsed:false,rangeCount:1,anchorNode:answer.firstChild,focusNode:answer.firstChild,toString:()=> '有限电压下连续',getRangeAt:()=>({getBoundingClientRect:()=>({left:120,bottom:200})}),removeAllRanges} as unknown as Selection);
    try{fireEvent.pointerUp(answer);expect(screen.getByRole('button',{name:'追问'})).toBeTruthy();expect(screen.queryByRole('button',{name:'取消引用'})).toBeNull();expect(runtime.ai).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button',{name:'追问'}));expect(screen.queryByRole('button',{name:'追问'})).toBeNull();expect(screen.getByRole('button',{name:'取消引用'})).toBeTruthy();expect(document.activeElement).toBe(screen.getByRole('textbox',{name:'向学习助手提问'}));expect(removeAllRanges).toHaveBeenCalledOnce();expect(runtime.ai).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'为什么需要这个条件？'}});fireEvent.click(screen.getByRole('button',{name:'发送问题'}));await waitFor(()=>expect(runtime.ai).toHaveBeenCalledTimes(2));expect(vi.mocked(runtime.ai).mock.calls[1][1]).toEqual(expect.objectContaining({positionMs:23000,text:'L 表示电感'}));expect(vi.mocked(runtime.ai).mock.calls[1][2]).toContain('有限电压下连续');
    }finally{selection.mockRestore()}
  });
});
