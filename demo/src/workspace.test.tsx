import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {decodeWorkspace,initialWorkspace,shouldSplit,toggleWorkspace,navigateWorkspace,workspaceDisplay,phoneRotation} from './workspace';
import {clampCrop} from './ImageCropper';
import {StudyAiHub} from './StudyAiHub';
import {useStudyAi} from './StudyAiHub';
vi.mock('./runtime',async original=>({...await original<typeof import('./runtime')>(),NATIVE:false}));
beforeEach(()=>localStorage.clear());afterEach(cleanup);
describe('Pad workspace and assistant entry',()=>{
  it('keeps phones single while Pad changes only its focused pane',()=>{
    const state={enabled:true,left:'recordings' as const,right:'assistant' as const,active:'left' as const};
    expect(shouldSplit(393,state)).toBe(false);expect(shouldSplit(1024,state)).toBe(true);expect(shouldSplit(1024,{...state,right:'recordings'})).toBe(true);expect(shouldSplit(1024,{...state,enabled:false})).toBe(false);
  });
  it('migrates the existing last page without replacing it with the dashboard',()=>{
    localStorage.setItem('canvas-page-v1:student',JSON.stringify({tab:'recordings'}));expect(initialWorkspace('student').left).toBe('recordings');expect(decodeWorkspace({left:'invalid'}).left).toBe('dashboard');
  });
  it('opens the original assistant directly without a provider chooser or website events',()=>{
    const onApi=vi.fn();function Entry(){const hub=useStudyAi();return <button onClick={()=>hub.open('学习助手',{mode:'agent',args:{}},onApi)}>入口</button>;}
    render(<StudyAiHub scope="demo" courses={[]} loadFiles={async()=>{}}><Entry/></StudyAiHub>);
    fireEvent.click(screen.getByRole('button',{name:'入口'}));expect(onApi).toHaveBeenCalledWith({mode:'agent',args:{}});expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps the other pane unchanged and starts split with a different companion',()=>{
    const state=decodeWorkspace({left:'courses',right:'courses',active:'right'});const dual=toggleWorkspace(state);expect(dual.left).toBe('assistant');expect(dual.right).toBe('courses');
    expect(navigateWorkspace(dual,'downloads')).toEqual({...dual,right:'downloads'});expect(toggleWorkspace(dual).active).toBe('right');
  });
  it('allows Pad split and phone landscape, without mistaking the keyboard for rotation',()=>{
    expect(workspaceDisplay(800,1024)).toEqual({tablet:true,canSplit:true});
    expect(workspaceDisplay(393,852)).toEqual({tablet:false,canSplit:false});
    expect(workspaceDisplay(852,393)).toEqual({tablet:true,canSplit:true});
    expect(workspaceDisplay(393,280,{smallestWidthDp:393,landscape:false})).toEqual({tablet:false,canSplit:false});
    const state=decodeWorkspace({enabled:true,active:'right',left:'recordings',right:'courses'});
    expect(shouldSplit(393,state,852)).toBe(false);expect(shouldSplit(852,state,393)).toBe(true);expect(state.right).toBe('courses');
  });
  it('reflows a Pad system window without changing the stored pane choice',()=>{
    const pad={smallestWidthDp:800,landscape:true};
    const state=decodeWorkspace({enabled:true,active:'right',left:'recordings',right:'courses'});
    for(const width of [1200,1000,850,800])expect(shouldSplit(width,state,900,pad)).toBe(true);
    for(const width of [799,768,760,700,600])expect(workspaceDisplay(width,900,pad)).toEqual({tablet:true,canSplit:false});
    for(const width of [599,500,393,320])expect(workspaceDisplay(width,900,pad)).toEqual({tablet:false,canSplit:false});
    expect(shouldSplit(500,state,900,pad)).toBe(false);
    expect(shouldSplit(1000,state,900,pad)).toBe(true);
    expect(state).toEqual({enabled:true,active:'right',left:'recordings',right:'courses'});
  });
  it('handles top/bottom system split without leaving unusable panes in short windows',()=>{
    const state=decodeWorkspace({enabled:true,active:'right',left:'recordings',right:'courses'}),pad={smallestWidthDp:800,landscape:false};
    for(const height of [1000,600,450,360])expect(shouldSplit(1000,state,height,pad)).toBe(true);
    for(const height of [359,320,300,250,180])expect(shouldSplit(1000,state,height,pad)).toBe(false);
    expect(shouldSplit(1000,state,600,pad)).toBe(true);expect(state.active).toBe('right');
    expect(workspaceDisplay(850,320,{smallestWidthDp:393,landscape:false}).canSplit).toBe(false);
  });
  it('leaves phone split on physical portrait rotation and keeps the focused page and companion',()=>{
    const state=decodeWorkspace({enabled:true,active:'right',left:'recordings',right:'courses'});
    expect(phoneRotation(state,{smallestWidthDp:393,landscape:false})).toEqual({...state,enabled:false});
    expect(phoneRotation(state,{smallestWidthDp:393,landscape:true})).toBe(state);
    expect(phoneRotation(state,{smallestWidthDp:800,landscape:false})).toBe(state);
    expect(workspaceDisplay(852,280,{smallestWidthDp:393,landscape:true}).canSplit).toBe(false);
  });
  it('bounds a crop on all edges so export cannot sample outside the image',()=>{
    const rect=clampCrop({x:-.2,y:.95,w:1.5,h:.8});expect(rect.x).toBe(0);expect(rect.x+rect.w).toBeLessThanOrEqual(1);expect(rect.y+rect.h).toBeLessThanOrEqual(1);expect(rect.h).toBeGreaterThan(0);
  });
});
