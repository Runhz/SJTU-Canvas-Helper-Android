import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
vi.mock('./CanvasWater',()=>({createCanvasWater:()=>({setFill:vi.fn(),impulse:vi.fn(),dispose:vi.fn()})}));
import App from './App';
import {accountScope,decodeLecture,decodePage} from './pageMemory';
beforeEach(()=>{Object.defineProperty(window,'innerWidth',{value:393,configurable:true});localStorage.clear();window.scrollTo=vi.fn();vi.useFakeTimers();});
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('page memory',()=>{
  it('keeps course section, search and scroll when switching pages and after restarting',()=>{
    const view=render(<App/>);
    fireEvent.click(screen.getByRole('button',{name:'课程'}));fireEvent.click(screen.getByRole('button',{name:/CS3310.*计算机网络/}));
    fireEvent.change(screen.getByRole('textbox',{name:'搜索课程资料'}),{target:{value:'.pdf'}});
    const main=screen.getByRole('main');main.scrollTop=200;fireEvent.scroll(main);
    fireEvent.click(screen.getByRole('button',{name:'下载'}));fireEvent.click(screen.getByRole('button',{name:'课程'}));
    expect((screen.getByRole('textbox',{name:'搜索课程资料'}) as HTMLInputElement).value).toBe('.pdf');expect(main.scrollTop).toBe(200);
    fireEvent.click(screen.getByRole('button',{name:'课程大纲'}));view.unmount();
    render(<App/>);expect(screen.getByRole('button',{name:'课程大纲'}).classList.contains('selected')).toBe(true);
  });
  it('restores video position, subtitles and speed when returning from another tab',()=>{
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'录播'}));fireEvent.click(screen.getByRole('button',{name:/计算机网络.*查看录播/}));
    fireEvent.change(screen.getByRole('slider',{name:'播放进度'}),{target:{value:'1200'}});fireEvent.click(screen.getByRole('button',{name:'字幕'}));
    fireEvent.change(screen.getByRole('textbox',{name:'搜索字幕'}),{target:{value:'路由'}});
    fireEvent.click(screen.getByRole('button',{name:'播放倍速'}));fireEvent.click(screen.getByRole('button',{name:'1.5×'}));
    fireEvent.click(screen.getByRole('button',{name:'课程'}));fireEvent.click(screen.getByRole('button',{name:'录播'}));
    expect((screen.getByRole('slider',{name:'播放进度'}) as HTMLInputElement).value).toBe('1200');expect(screen.getByRole('button',{name:'播放倍速'}).textContent).toContain('1.5');
    expect((screen.getByRole('textbox',{name:'搜索字幕'}) as HTMLInputElement).value).toBe('路由');
  });
  it('validates corrupt state and excludes URLs from recording memory',()=>{
    expect(decodePage({tab:'bad',courseSection:'bad'}).tab).toBe('dashboard');
    expect(decodeLecture({courseId:'1',selected:{id:'2',title:'课堂',source:'canvas',courseId:'1',materialsId:3,raw:{url:'private'}}}).selected?.raw).toEqual({});
    expect(accountScope({accountId:'same',identityId:'1'} as never)).not.toBe(accountScope({accountId:'same',identityId:'2'} as never));
  });
});
