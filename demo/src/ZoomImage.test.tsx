import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,native:vi.fn().mockResolvedValue({})}));
import {native} from './runtime';
import {ZoomImage,clampImagePan} from './ZoomImage';
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(0),0));vi.stubGlobal('cancelAnimationFrame',clearTimeout)});afterEach(()=>{cleanup();vi.unstubAllGlobals()});
describe('zoomable readonly pages',()=>{
  it('opens fullscreen outside a clipped pane and hides native video until closed',()=>{
    const view=render(<div className="app-shell workspace-pane"><ZoomImage src="data:image/jpeg;base64,/9j/" alt="课堂课件"/></div>);fireEvent.click(screen.getByRole('button',{name:'全屏预览'}));
    const dialog=screen.getByRole('dialog');expect(view.container.contains(dialog)).toBe(false);expect(dialog.classList.contains('fullscreen')).toBe(true);expect(native).toHaveBeenCalledWith('playerControl',{action:'occlusion',obscured:true});
    fireEvent.click(screen.getByRole('button',{name:'退出全屏预览'}));expect(screen.queryByRole('dialog')).toBeNull();expect(native).toHaveBeenCalledWith('playerControl',{action:'occlusion',obscured:false});
  });
  it('supports bounded enlargement and resetting to fit width',()=>{
    render(<ZoomImage src="data:image/jpeg;base64,/9j/" alt="讲义" initialZoom={2}/>);expect(screen.getByText('200%')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'放大预览'}));expect(screen.getByText('225%')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'适合窗口'}));expect(screen.getByText('100%')).toBeTruthy();for(let i=0;i<3;i++)fireEvent.click(screen.getByRole('button',{name:'缩小预览'}));expect(screen.getByText('25%')).toBeTruthy();expect((screen.getByRole('button',{name:'缩小预览'}) as HTMLButtonElement).disabled).toBe(true);
  });
  it('fits a portrait page inside both card dimensions before zooming',()=>{
    const width=vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(320),height=vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(240);
    try{
      render(<ZoomImage src="data:image/jpeg;base64,/9j/" alt="竖版讲义" contained controls={false}/>);
      const image=screen.getByAltText('竖版讲义');Object.defineProperty(image,'naturalWidth',{value:2000});Object.defineProperty(image,'naturalHeight',{value:3000});fireEvent.load(image);
      expect(image.style.width).toBe('160px');expect(screen.queryByRole('button',{name:'全屏预览'})).toBeNull();
    }finally{width.mockRestore();height.mockRestore()}
  });
  it('fits the whole landscape slide in a short fullscreen window and retains its AI action',()=>{
    const width=vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(900),height=vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(300),ask=vi.fn();
    try{render(<ZoomImage src="data:image/jpeg;base64,/9j/" alt="横版课件" onAsk={ask}/>);const image=screen.getByAltText('横版课件');Object.defineProperty(image,'naturalWidth',{value:1600});Object.defineProperty(image,'naturalHeight',{value:900});fireEvent.load(image);fireEvent.click(screen.getByRole('button',{name:'全屏预览'}));const fullImage=screen.getByAltText('横版课件');Object.defineProperty(fullImage,'naturalWidth',{value:1600});Object.defineProperty(fullImage,'naturalHeight',{value:900});fireEvent.load(fullImage);expect(parseFloat(fullImage.style.height)).toBeCloseTo(300);expect(parseFloat(fullImage.style.width)).toBeCloseTo(533.333);fireEvent.click(screen.getByRole('button',{name:'课件切片问 AI'}));expect(ask).toHaveBeenCalledOnce();expect(screen.queryByRole('dialog')).toBeNull()}finally{width.mockRestore();height.mockRestore()}
  });
  it('allows positioning a shrunken page and bounds extreme dragging so it remains reachable',()=>{
    expect(clampImagePan(70,30,400,300,200,150)).toEqual({x:70,y:30});expect(clampImagePan(900,-900,400,300,200,150)).toEqual({x:100,y:-75});expect(clampImagePan(0,0,400,300,200,150)).toEqual({x:0,y:0});
  });
});
