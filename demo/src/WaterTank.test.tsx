import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,waitFor,act} from '@testing-library/react';
vi.mock('./WaterPool',()=>({createWaterPool:vi.fn(()=>({setFill:vi.fn(),impulse:vi.fn(),disturb:vi.fn(),dispose:vi.fn()}))}));
import {createWaterPool} from './WaterPool';
import WaterTank from './WaterTank';
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks();vi.unstubAllGlobals()});
it('loads the transparent pool lazily, uses the touch position, updates fill and disposes',async()=>{
  vi.stubGlobal('PointerEvent',MouseEvent);localStorage.setItem('canvas-water-quality','eco');const ui=render(<WaterTank completed={1} total={4}/>);await waitFor(()=>expect(createWaterPool).toHaveBeenCalledWith(expect.any(HTMLElement),.25,expect.any(Function)));const handle=vi.mocked(createWaterPool).mock.results[0].value;
  const stage=document.querySelector('.water-tank-stage')!;stage.getBoundingClientRect=()=>({left:0,top:0,width:200,height:200} as DOMRect);fireEvent.pointerDown(stage,{clientX:100,clientY:80});expect(handle.disturb).toHaveBeenCalledWith(.5,.4,.045);ui.rerender(<WaterTank completed={2} total={4}/>);expect(handle.setFill).toHaveBeenLastCalledWith(.5);ui.unmount();expect(handle.dispose).toHaveBeenCalledOnce();
});
it('cleans up and shows a static fallback when the GPU context fails',async()=>{
  render(<WaterTank completed={1} total={4}/>);await waitFor(()=>expect(createWaterPool).toHaveBeenCalled());const handle=vi.mocked(createWaterPool).mock.results[0].value;act(()=>vi.mocked(createWaterPool).mock.calls[0][2]());await waitFor(()=>expect(document.querySelector('.water-tank-fallback')).toBeTruthy());expect(handle.dispose).toHaveBeenCalledOnce();
});
it('keeps the last actual frame on return, without the coarse loading fallback or another account frame',async()=>{
 const snapshot='data:image/png;base64,YQ==';vi.mocked(createWaterPool).mockImplementationOnce(()=>({setFill:vi.fn(),impulse:vi.fn(),disturb:vi.fn(),dispose:vi.fn(),snapshot:()=>snapshot}));
 const first=render(<WaterTank completed={1} total={4} cacheKey="snapshot-account"/>);await waitFor(()=>expect(createWaterPool).toHaveBeenCalled());expect(document.querySelector('.water-tank-fallback')).toBeNull();first.unmount();
 const second=render(<WaterTank completed={1} total={4} cacheKey="snapshot-account"/>);expect(document.querySelector('.water-last-frame')?.getAttribute('src')).toBe(snapshot);second.unmount();
 const third=render(<WaterTank completed={0} total={4} cacheKey="different-account"/>);expect(document.querySelector('.water-last-frame')).toBeNull();third.unmount();
});
