import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {LectureSubtitles,selectedLectureText} from './LectureSubtitles';
const lines=[{bg:1000,ed:2000,res:'第一段'},{bg:3000,ed:4000,res:'第二段'}];
afterEach(cleanup);
describe('subtitle context',()=>{
  it('includes only selected text and original timestamps',()=>{const text=selectedLectureText(lines,[1],'课堂','canvas:1');expect(text).toContain('第二段');expect(text).not.toContain('第一段');expect(text).toContain('t=3');});
  it('allows manual scrolling, resume and independent subtitle selection',()=>{
    const choose=vi.fn();render(<LectureSubtitles lines={lines} query="" positionMs={0} onSeek={()=>{}} selected={[]} onSelected={choose} scope="all" onScope={()=>{}}/>);
    fireEvent.wheel(document.querySelector('.subtitle-scroll')!);expect(screen.getByRole('button',{name:'恢复跟随'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'选择字幕'}));fireEvent.click(screen.getByRole('button',{name:'选择字幕 2'}));expect(choose).toHaveBeenCalledWith([1]);
  });
});
