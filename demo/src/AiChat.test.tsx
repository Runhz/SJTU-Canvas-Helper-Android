import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,ai:vi.fn(),cancelAi:vi.fn().mockResolvedValue(undefined)}));
import * as runtime from './runtime';
import {activateChatScope} from './chatSession';
beforeEach(()=>activateChatScope('preview'));
import {AiChat} from './AiChat';
import {RichAnswer,normalizeMath} from './RichAnswer';
afterEach(()=>{cleanup();activateChatScope('cleanup');vi.clearAllMocks()});
describe('回答与公式显示',()=>{
  it('回答尚未结束时就显示已收到的文字',async()=>{
    let resolve!:(s:string)=>void;let emit!:(s:string)=>void;
    vi.mocked(runtime.ai).mockImplementation((_m,_a,_q,onText)=>{emit=onText;return new Promise(r=>{resolve=r;});});
    render(<AiChat context="测试课件" payload={{mode:'file',args:{file:{id:1}}}} onTime={()=>{}} onConfigure={()=>{}}/>);
    fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'解释公式'}});fireEvent.click(screen.getByRole('button',{name:'发送问题'}));
    act(()=>emit('这里是第一段，'));await waitFor(()=>expect(screen.getByText('这里是第一段，')).toBeTruthy());
    expect(screen.getByRole('button',{name:'停止生成'})).toBeTruthy();
    await act(async()=>resolve('这里是第一段，完整答案。'));
    expect(screen.getByText('这里是第一段，完整答案。')).toBeTruthy();
  });
  it('停止按钮取消真实请求，中断时保留收到的正文',async()=>{
    let reject!:(e:string)=>void;let emit!:(s:string)=>void;vi.mocked(runtime.ai).mockImplementation((_m,_a,_q,onText)=>{emit=onText;return new Promise((_r,j)=>{reject=j;});});
    render(<AiChat context="字幕" payload={{mode:'materials',args:{text:'资料'}}} onTime={()=>{}} onConfigure={()=>{}}/>);
    fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'解释'}});fireEvent.click(screen.getByRole('button',{name:'发送问题'}));act(()=>emit('已收到的内容'));
    fireEvent.click(screen.getByRole('button',{name:'停止生成'}));expect(runtime.cancelAi).toHaveBeenCalled();await act(async()=>reject('已停止生成'));expect(screen.getByText('已收到的内容')).toBeTruthy();
  });
  it('LaTeX 行内和独立公式正确排版，代码和远程 HTML 保持隔离',()=>{
    const {container}=render(<RichAnswer text={'公式 \\(a^2+b^2=c^2\\)\n\n\\[\\frac{1}{2}\\]\n\n`\\(代码\\)`\n\n<script>alert(1)</script>'}/>);
    expect(container.querySelectorAll('.katex')).toHaveLength(2);expect(container.querySelector('.katex-display')).toBeTruthy();expect(container.querySelector('script')).toBeNull();expect(container.querySelector('code')?.textContent).toBe('\\(代码\\)');expect(normalizeMath('`\\(x\\)`')).toBe('`\\(x\\)`');
  });
});
