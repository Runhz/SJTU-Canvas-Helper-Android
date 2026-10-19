import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react';
import {SlideDeck} from './SlideDeck';
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()});
it('times out a stalled image, retries, ignores the timeout after load, and cleans up on unmount',()=>{
  vi.useFakeTimers();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  const view=render(<SlideDeck slides={[{key:'1',image:'https://example.test/slide.png',timeMs:0,text:''}]} index={0} onIndex={()=>{}}/>);
  expect(screen.getByRole('status').textContent).toContain('加载');act(()=>vi.advanceTimersByTime(18000));expect(screen.queryByRole('img')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'重新加载'}));fireEvent.load(screen.getByRole('img'));act(()=>vi.advanceTimersByTime(18000));expect(screen.queryByRole('status')).toBeNull();expect(screen.getByRole('img')).toBeTruthy();
  view.unmount();expect(vi.getTimerCount()).toBe(0);
});
it('shows an empty state without invalid pagination or question controls',()=>{
  render(<SlideDeck slides={[]} index={0} onIndex={()=>{}} onAsk={()=>{}}/>);expect(screen.getByRole('status').textContent).toContain('暂无');expect(screen.queryByRole('button')).toBeNull();
});
