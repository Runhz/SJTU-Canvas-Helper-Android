import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,native:vi.fn().mockResolvedValue({})}));
import {ChatWindow,clampChatSize} from './ChatWindow';
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals()});
describe('adjustable chat window',()=>{
  it('coalesces horizontal drags to a frame and never changes height while dragging',()=>{
    vi.stubGlobal('innerWidth',1200);vi.stubGlobal('innerHeight',640);vi.stubGlobal('PointerEvent',MouseEvent);let draw:FrameRequestCallback=()=>{};vi.stubGlobal('requestAnimationFrame',vi.fn((fn:FrameRequestCallback)=>{draw=fn;return 1}));vi.stubGlobal('cancelAnimationFrame',vi.fn());
    render(<ChatWindow scope="drag" docked title="课堂" onClose={()=>{}}>正文</ChatWindow>);const edge=screen.getByRole('button',{name:'拖动调整对话窗大小'}),panel=screen.getByLabelText('随课问答');edge.setPointerCapture=vi.fn();const height=panel.style.height;
    fireEvent.pointerDown(edge,{clientX:700,clientY:600,button:0});fireEvent.pointerMove(edge,{clientX:620,clientY:100});fireEvent.pointerMove(edge,{clientX:600,clientY:200});expect(panel.style.width).toBe('440px');fireEvent.pointerUp(edge);expect(panel.style.width).toBe('540px');expect(panel.style.height).toBe(height);expect(JSON.parse(localStorage.getItem('canvas-chat-window-v2:drag:dock')!).width).toBe(540);
  });
  it('uses the full phone width on leaving the dock and restores height after the keyboard closes',()=>{
    vi.stubGlobal('innerWidth',1200);vi.stubGlobal('innerHeight',640);const view=render(<ChatWindow scope="resize" docked title="课堂" onClose={()=>{}}>正文</ChatWindow>);
    vi.stubGlobal('innerWidth',393);vi.stubGlobal('innerHeight',852);view.rerender(<ChatWindow scope="resize" docked={false} title="课堂" onClose={()=>{}}>正文</ChatWindow>);const modal=screen.getByRole('dialog');expect(modal.style.width).toBe('377px');expect(modal.style.height).toBe('828px');vi.stubGlobal('innerHeight',280);fireEvent(window,new Event('resize'));expect(modal.style.height).toBe('256px');vi.stubGlobal('innerHeight',852);fireEvent(window,new Event('resize'));expect(modal.style.height).toBe('828px');
  });
  it('clamps both axes to the available window and leaves room for the video in dock mode',()=>{
    vi.stubGlobal('innerWidth',1000);vi.stubGlobal('innerHeight',320);expect(clampChatSize(5000,5000,true)).toEqual({width:720,height:304});vi.stubGlobal('innerWidth',393);vi.stubGlobal('innerHeight',280);expect(clampChatSize(5000,5000,false)).toEqual({width:377,height:264});
  });
  it('expands the dock into a native-occluding reading modal and returns to the dock',()=>{
    render(<ChatWindow scope="window" docked title="原课堂" onClose={()=>{}}><div>保留正文</div></ChatWindow>);expect(screen.getByLabelText('随课问答')).toBeTruthy();expect(screen.getByRole('button',{name:'拖动调整对话窗大小'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'展开阅读'}));expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByText('保留正文')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'收起阅读'}));expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByLabelText('随课问答')).toBeTruthy();
  });
});
