import 'fake-indexeddb/auto';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {AssistantHome} from './AssistantHome';
import {newConversation,saveConversation} from './chatHistory';
afterEach(cleanup);
describe('assistant conversation discovery',()=>{
  it('finds file and lecture conversations after reopening and resumes the chosen context',async()=>{
    const file=newConversation('home-08','实验指导书.pdf',{mode:'materials',args:{file:{id:42},fileName:'实验指导书.pdf',courseId:'7',screenshot:'data:image/jpeg;base64,YWJj'}}),lecture=newConversation('home-08','电感课堂',{mode:'materials',args:{resourceId:'canvas:201',courseId:'7',positionMs:65000}});
    file.messages=[{role:'user',content:'请解释图中的电路'}];lecture.messages=[{role:'user',content:'为什么连续'}];await saveConversation(file);await saveConversation(lecture);
    const open=vi.fn(),view=render(<AssistantHome scope="home-08" onOpen={open}/>);fireEvent.click(await screen.findByRole('button',{name:/文件.*实验指导书/}));expect(open).toHaveBeenCalledWith(file.title,expect.objectContaining({args:expect.objectContaining({conversationId:file.id,file:{id:42}})}));
    view.unmount();render(<AssistantHome scope="home-08" onOpen={open}/>);fireEvent.click(await screen.findByRole('button',{name:/课堂.*电感课堂/}));expect(open).toHaveBeenLastCalledWith(lecture.title,expect.objectContaining({args:expect.objectContaining({positionMs:65000})}));
  });
});
