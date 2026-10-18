import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {LectureNotebook} from './LectureNotebook';
const recording={id:'notes201',title:'测试课堂',courseId:'7',source:'canvas' as const,materialsId:8,raw:{}};
beforeEach(()=>localStorage.clear());afterEach(cleanup);
describe('timeline notebook',()=>{
  it('preserves an accidental-close draft, then stores a recoverable time-linked note',async()=>{
    const onSeek=vi.fn(),props={scope:'notebook-student',recording,positionMs:65000,onSeek};const view=render(<LectureNotebook {...props}/>);
    fireEvent.click(screen.getByRole('button',{name:'记笔记'}));fireEvent.change(screen.getByRole('textbox',{name:'笔记内容'}),{target:{value:'卷积推导中的疑问'}});view.unmount();
    const reopened=render(<LectureNotebook {...props}/>);fireEvent.click(screen.getByRole('button',{name:'继续草稿'}));expect((screen.getByRole('textbox',{name:'笔记内容'}) as HTMLTextAreaElement).value).toBe('卷积推导中的疑问');fireEvent.click(screen.getByRole('button',{name:'保存笔记'}));await waitFor(()=>expect(screen.queryByRole('textbox',{name:'笔记内容'})).toBeNull());
    reopened.unmount();render(<LectureNotebook {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'跳到 00:01:05'}));expect(onSeek).toHaveBeenCalledWith(65000);
  });
  it('does not offer another identity the first identity draft',async()=>{
    const view=render(<LectureNotebook scope="first-identity" recording={recording} positionMs={0} onSeek={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'记笔记'}));fireEvent.change(screen.getByRole('textbox',{name:'笔记内容'}),{target:{value:'私有草稿'}});view.unmount();render(<LectureNotebook scope="second-identity" recording={recording} positionMs={0} onSeek={()=>{}}/>);await waitFor(()=>expect(screen.queryByRole('button',{name:'继续草稿'})).toBeNull());expect(screen.queryByText('私有草稿')).toBeNull();
  });
});
