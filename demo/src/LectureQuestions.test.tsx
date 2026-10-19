import 'fake-indexeddb/auto';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {LectureQuestions} from './LectureQuestions';
import {deleteConversation,newConversation,saveConversation} from './chatHistory';
const make=async(scope:string,resourceId:string,question:string,positionMs=0)=>{const row=newConversation(scope,'课堂',{mode:'materials',args:{resourceId,positionMs}});row.messages=[{role:'user',content:question}];row.turns=[{id:'turn-'+row.id,messageIndex:0,payload:row.payload,status:'open',createdAt:Date.now()}];await saveConversation(row);return row};
afterEach(cleanup);
it('seeks to the start of a lecture for a question anchored at zero',async()=>{
 await make('lecture-zero','canvas:1','开头问题',0);const seek=vi.fn();render(<LectureQuestions scope="lecture-zero" resourceId="canvas:1" positionMs={90000} onAsk={()=>{}} onSeek={seek}/>);await screen.findAllByText(/开头问题/);
 fireEvent.click(screen.getByText('回看'));expect(seek).toHaveBeenCalledWith(0);
});
it('removes a deleted conversation from the lecture and falls back to its previous conversation',async()=>{
 const old=await make('lecture-delete','canvas:2','更早的问题');const latest=await make('lecture-delete','canvas:2','将删除的问题');latest.updatedAt=old.updatedAt+1000;await saveConversation(latest);
 render(<LectureQuestions scope="lecture-delete" resourceId="canvas:2" positionMs={0} onAsk={()=>{}} onSeek={()=>{}}/>);await screen.findAllByText(/将删除的问题/);await act(async()=>deleteConversation(latest.scope,latest.id));
 await waitFor(()=>expect(screen.queryAllByText(/将删除的问题/)).toHaveLength(0));expect(screen.getAllByText(/更早的问题/).length).toBeGreaterThan(0);await act(async()=>deleteConversation(old.scope,old.id));await waitFor(()=>expect(screen.queryByRole('button',{name:/继续问/})).toBeNull());
});
