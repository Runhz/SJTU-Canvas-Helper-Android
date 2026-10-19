import {useState,type ComponentProps} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import type {StudyMaterialPanel} from './StudyMaterialPanel';
const panel=vi.hoisted(()=>({current:undefined as ComponentProps<typeof StudyMaterialPanel>|undefined}));
vi.mock('./StudyMaterialPanel',()=>({StudyMaterialPanel:(props:ComponentProps<typeof StudyMaterialPanel>)=>{panel.current=props;const [name]=useState(props.title);return <button onClick={()=>props.onDone({ids:[],payload:{mode:'agent',args:{text:name}}})}>确认资料 {name}</button>}}));
import {StudyAiHub,useStudyAi} from './StudyAiHub';
const first=vi.fn(),second=vi.fn();
function Entries(){const study=useStudyAi();return <><button onClick={()=>study.materials('资料甲',{mode:'agent',args:{}},first)}>甲资料</button><button onClick={()=>study.materials('资料乙',{mode:'agent',args:{}},second)}>乙资料</button><button onClick={()=>study.open('新入口',{mode:'agent',args:{}},second)}>其他入口</button></>}
const tree=(scope='hub')=><StudyAiHub scope={scope} courses={[]} loadFiles={async()=>{}}><Entries/></StudyAiHub>;
afterEach(()=>{cleanup();vi.clearAllMocks()});
it('keeps the material confirmation bound to its origin when another entry opens',()=>{
 render(tree());fireEvent.click(screen.getByText('甲资料'));fireEvent.click(screen.getByText('其他入口'));fireEvent.click(screen.getByText('确认资料 资料甲'));
 expect(first).toHaveBeenCalledWith({mode:'agent',args:{text:'资料甲'}});expect(second).toHaveBeenCalledTimes(1);
});
it('resets a replacement panel and ignores a late confirmation from the previous panel',()=>{
 render(tree());fireEvent.click(screen.getByText('甲资料'));const stale=panel.current!;fireEvent.click(screen.getByText('乙资料'));
 expect(screen.getByText('确认资料 资料乙')).toBeTruthy();stale.onDone({ids:[],payload:{mode:'agent',args:{text:'过期甲'}}});expect(first).not.toHaveBeenCalled();expect(second).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('确认资料 资料乙'));expect(second).toHaveBeenCalledWith({mode:'agent',args:{text:'资料乙'}});
});
it('closes materials when the account scope changes and rejects the old callback',()=>{
 const view=render(tree('account-a'));fireEvent.click(screen.getByText('甲资料'));const stale=panel.current!;view.rerender(tree('account-b'));
 expect(screen.queryByText('确认资料 资料甲')).toBeNull();stale.onDone({ids:[],payload:{mode:'agent',args:{text:'账号甲资料'}}});expect(first).not.toHaveBeenCalled();
});
