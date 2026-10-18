import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,ai:vi.fn(),native:vi.fn().mockResolvedValue({}),cancelAi:vi.fn().mockResolvedValue(undefined)}));
import * as runtime from './runtime';
import {AiChat} from './AiChat';
import {activateChatScope,flushChats} from './chatSession';
import {listConversations,newConversation,saveConversation,savedPayload} from './chatHistory';
const image='data:image/jpeg;base64,YWJj',payload={mode:'materials',args:{resourceId:'canvas:compose',positionMs:23000,text:'附近字幕',screenshot:image}};
const props={context:'课堂提问',payload,storageScope:'compose',onTime:vi.fn(),onConfigure:vi.fn()};
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();activateChatScope('compose')});afterEach(()=>{cleanup();activateChatScope('cleanup')});
const ready=()=>waitFor(()=>expect((screen.getByRole('textbox',{name:'向学习助手提问'}) as HTMLTextAreaElement).disabled).toBe(false));
describe('focused composer',()=>{
  it('sends the displayed suggestion directly without an adoption control',async()=>{
    const row=newConversation('compose','课堂提问',payload);row.messages=[{role:'user',content:'上一问'},{role:'assistant',content:'上一答'}];row.followUps=['为什么数字截止频率相同？'];await saveConversation(row);
    vi.mocked(runtime.ai).mockResolvedValue('频率解释');render(<AiChat {...props}/>);await ready();
    expect((screen.getByRole('textbox',{name:'向学习助手提问'}) as HTMLTextAreaElement).placeholder).toBe('为什么数字截止频率相同？');expect(screen.queryByText('采用')).toBeNull();expect(screen.getByRole('button',{name:'扩大输入框'}).textContent).toBe('');
    fireEvent.click(screen.getByRole('button',{name:'发送问题'}));await screen.findByText('频率解释');expect(vi.mocked(runtime.ai).mock.calls[0][2]).toBe('为什么数字截止频率相同？');
  });
  it('does not restore the original image after its annotated version was sent, but accepts a new capture',async()=>{
    const source={...payload,args:{...payload.args,intentId:'capture-one'}};const row=newConversation('compose','课堂',source);const edited={...savedPayload(source),args:{...savedPayload(source).args,screenshot:'data:image/jpeg;base64,ZWRpdGVk'}};
    row.messages=[{role:'user',content:'标记后的问题'},{role:'assistant',content:'旧回答'}];row.turns=[{id:'t',messageIndex:0,payload:edited,status:'open',createdAt:1}];delete row.payload.args.screenshot;await saveConversation(row);
    const view=render(<AiChat {...props} payload={source}/>);await ready();expect(screen.queryByAltText('待发送截图')).toBeNull();view.rerender(<AiChat {...props} payload={{...source,args:{...source.args,intentId:'capture-two'}}}/>);await ready();expect(screen.getByAltText('待发送截图')).toBeTruthy();
  });
  it('keeps the answer scroll position when switching from docked to modal reading',async()=>{
    vi.mocked(runtime.ai).mockResolvedValue('很长的解释');const view=render(<AiChat {...props} onClose={()=>{}} docked/>);await ready();fireEvent.click(screen.getByRole('button',{name:'解释这一步'}));await screen.findByText('很长的解释');const messages=screen.getByLabelText('对话记录');Object.defineProperties(messages,{scrollHeight:{value:1000},clientHeight:{value:200}});messages.scrollTop=180;fireEvent.scroll(messages);view.rerender(<AiChat {...props} onClose={()=>{}} docked={false}/>);expect(screen.getByLabelText('对话记录').scrollTop).toBe(180);
  });
  it('stages the image in the composer, sends it with text and moves it into the sent turn',async()=>{
    vi.mocked(runtime.ai).mockResolvedValue('回答');const view=render(<AiChat {...props}/>);await ready();expect(screen.getByAltText('待发送截图').closest('form')).toBeTruthy();expect(screen.queryByRole('button',{name:'模型设置'})).toBeNull();expect(runtime.ai).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'看这张图的箭头'}});fireEvent.click(screen.getByRole('button',{name:'发送问题'}));await screen.findByText('回答');expect(vi.mocked(runtime.ai).mock.calls[0][1]).toMatchObject({screenshot:image,positionMs:23000,text:'附近字幕'});expect(vi.mocked(runtime.ai).mock.calls[0][2]).toBe('看这张图的箭头');expect(screen.queryByAltText('待发送截图')).toBeNull();expect(screen.getByAltText('已发送的截图')).toBeTruthy();
    flushChats();view.unmount();const rows=await listConversations('compose');expect(rows[0].turns?.[0].payload.args.screenshot).toBe(image);expect(rows[0].payload.args.screenshot).toBeUndefined();
  });
  it('can remove a pending screenshot without sending it or discarding the text',async()=>{
    vi.mocked(runtime.ai).mockResolvedValue('仅文字回答');render(<AiChat {...props}/>);await ready();fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'已有问题'}});fireEvent.click(screen.getByRole('button',{name:'移除提问截图'}));expect(runtime.ai).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'发送问题'}));await waitFor(()=>expect(runtime.ai).toHaveBeenCalledOnce());expect(vi.mocked(runtime.ai).mock.calls[0][1].screenshot).toBeUndefined();expect(vi.mocked(runtime.ai).mock.calls[0][2]).toBe('已有问题');
  });
  it('expands the same input in place and only collapses when requested',async()=>{
    render(<AiChat {...props}/>);await ready();const input=screen.getByRole('textbox',{name:'向学习助手提问'});fireEvent.click(screen.getByRole('button',{name:'扩大输入框'}));const value='这是一段需要编辑的长问题。'.repeat(100);expect(screen.getByRole('textbox',{name:'向学习助手提问'})).toBe(input);expect(screen.queryByRole('dialog')).toBeNull();fireEvent.change(input,{target:{value}});expect(input.closest('form')?.classList.contains('composer-expanded')).toBe(true);fireEvent.click(screen.getByRole('button',{name:'收起输入框'}));expect((input as HTMLTextAreaElement).value).toBe(value);expect(runtime.ai).not.toHaveBeenCalled();
  });
  it('Enter sends, Shift+Enter and IME confirmation do not submit',async()=>{
    vi.mocked(runtime.ai).mockResolvedValue('键盘回答');render(<AiChat {...props}/>);await ready();const input=screen.getByRole('textbox',{name:'向学习助手提问'});fireEvent.change(input,{target:{value:'问题\n第二行'}});fireEvent.keyDown(input,{key:'Enter',shiftKey:true});fireEvent.keyDown(input,{key:'Enter',isComposing:true});fireEvent.keyDown(input,{key:'Enter',keyCode:229});expect(runtime.ai).not.toHaveBeenCalled();fireEvent.keyDown(input,{key:'Enter'});await screen.findByText('键盘回答');expect(runtime.ai).toHaveBeenCalledTimes(1);expect(vi.mocked(runtime.ai).mock.calls[0][2]).toBe('问题\n第二行');
  });
  it('does not reattach a sent image when an entry rerenders or the panel reopens',async()=>{
    vi.mocked(runtime.ai).mockResolvedValue('已处理图片');const view=render(<AiChat {...props}/>);await ready();fireEvent.change(screen.getByRole('textbox',{name:'向学习助手提问'}),{target:{value:'说明图片'}});fireEvent.click(screen.getByRole('button',{name:'发送问题'}));expect(screen.queryByAltText('待发送截图')).toBeNull();await screen.findByText('已处理图片');view.rerender(<AiChat {...props} payload={{...payload,args:{...payload.args}}}/>);await ready();expect(screen.queryByAltText('待发送截图')).toBeNull();flushChats();view.unmount();render(<AiChat {...props}/>);await ready();expect(screen.queryByAltText('待发送截图')).toBeNull();expect(screen.getByAltText('已发送的截图')).toBeTruthy();
  });
});
