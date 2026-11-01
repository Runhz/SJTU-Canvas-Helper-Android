import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {clearRememberedAccountState,usePageScroll,useRememberedState} from './pageMemory';
import 'fake-indexeddb/auto';

function PreferenceProbe({scope}:{scope:string}){
 const [value,setValue]=useRememberedState(`preference:${scope}`,{owner:scope,count:0},raw=>raw&&typeof raw==='object'&&typeof (raw as {count?:unknown}).count==='number'?raw as {owner:string;count:number}:{owner:scope,count:0});
 return <button onClick={()=>setValue(old=>({...old,count:old.count+1}))}>{value.owner}:{value.count}</button>;
}
function ScrollProbe({scope}:{scope:string}){const main=usePageScroll(scope,'course');return <main ref={main}/>;}

beforeEach(()=>{localStorage.clear();window.scrollTo=vi.fn()});
afterEach(cleanup);

describe('account-scoped page memory',()=>{
 it('loads and writes each account preference under its own key',()=>{
  localStorage.setItem('preference:account-a',JSON.stringify({owner:'A',count:1}));
  localStorage.setItem('preference:account-b',JSON.stringify({owner:'B',count:7}));
  const view=render(<PreferenceProbe scope="account-a"/>);expect(screen.getByRole('button').textContent).toBe('A:1');
  view.rerender(<PreferenceProbe scope="account-b"/>);expect(screen.getByRole('button').textContent).toBe('B:7');fireEvent.click(screen.getByRole('button'));
  view.rerender(<PreferenceProbe scope="account-a"/>);expect(screen.getByRole('button').textContent).toBe('A:1');
  view.rerender(<PreferenceProbe scope="account-b"/>);expect(screen.getByRole('button').textContent).toBe('B:8');
  expect(JSON.parse(localStorage.getItem('preference:account-a')||'{}')).toMatchObject({owner:'A',count:1});
  expect(JSON.parse(localStorage.getItem('preference:account-b')||'{}')).toMatchObject({owner:'B',count:8});
 });

 it('restores scroll positions independently when the active account changes',()=>{
  localStorage.setItem('canvas-scroll-v1:account-a',JSON.stringify({course:{main:100,window:111}}));
  localStorage.setItem('canvas-scroll-v1:account-b',JSON.stringify({course:{main:200,window:222}}));
  const view=render(<ScrollProbe scope="account-a"/>),main=screen.getByRole('main');expect(main.scrollTop).toBe(100);
  (main as HTMLElement).scrollTop=333;view.rerender(<ScrollProbe scope="account-b"/>);expect(main.scrollTop).toBe(200);expect(window.scrollTo).toHaveBeenLastCalledWith({top:222,behavior:'auto'});
  view.rerender(<ScrollProbe scope="account-a"/>);expect(main.scrollTop).toBe(333);
 });

 it('does not let a late store restore override scrolling in the current visit',async()=>{
  const indexedDb=await import('./workspaceStore');let finish!:(value:{main:number;window:number}|undefined)=>void;
  const restore=vi.spyOn(indexedDb,'readWorkspaceRecord').mockImplementation((_scope,kind)=>kind==='uiScroll'?new Promise(resolve=>{finish=resolve}) as never:Promise.resolve(undefined) as never);
  try{const view=render(<ScrollProbe scope="account-late"/>),main=screen.getByRole('main') as HTMLElement;main.scrollTop=450;fireEvent.scroll(main);finish({main:100,window:100});await Promise.resolve();expect(main.scrollTop).toBe(450);view.unmount();}finally{restore.mockRestore();}
 });

 it('clears account-scoped legacy UI keys without touching another account',()=>{
  localStorage.setItem('canvas-page-v1:account-a','{}');localStorage.setItem('canvas-page-v1:account-b','{}');localStorage.setItem('canvas-slide-follow-v1:account-a:canvas:1','true');localStorage.setItem('canvas-video-position-v1:account-a:canvas:1','42');localStorage.setItem('canvas-video-position-v1:account-b:canvas:1','84');
  clearRememberedAccountState('account-a',{accountId:'student-a',identityId:'1'});
  expect(localStorage.getItem('canvas-page-v1:account-a')).toBeNull();expect(localStorage.getItem('canvas-slide-follow-v1:account-a:canvas:1')).toBeNull();expect(localStorage.getItem('canvas-video-position-v1:account-a:canvas:1')).toBeNull();expect(localStorage.getItem('canvas-page-v1:account-b')).toBe('{}');expect(localStorage.getItem('canvas-video-position-v1:account-b:canvas:1')).toBe('84');
 });
});
