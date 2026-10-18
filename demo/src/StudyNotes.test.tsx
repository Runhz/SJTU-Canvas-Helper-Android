import 'fake-indexeddb/auto';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',async original=>({...await original<typeof import('./runtime')>(),NATIVE:true,ai:vi.fn(),cancelAi:vi.fn().mockResolvedValue(undefined),native:vi.fn().mockResolvedValue({})}));
import * as runtime from './runtime';
import {ConversationNote,StudyNotes} from './StudyNotes';
import {newConversation} from './chatHistory';
import {listNotes} from './studyLibrary';
import {LectureNotebook} from './LectureNotebook';
const recording={id:'note801',source:'canvas' as const,courseId:'7',title:'电感电流',materialsId:901,raw:{}};
afterEach(()=>{cleanup();vi.clearAllMocks()});
describe('conversation to existing notes',()=>{
  it('allows editing before saving, then finds the same note in the classroom and assistant note list',async()=>{
    const row=newConversation('note-08-a','电感问题',{mode:'materials',args:{courseId:'7',resourceId:'canvas:note801',recording,positionMs:65000}});row.messages=[{role:'user',content:'为什么连续？'},{role:'assistant',content:'有限电压下电流连续。'}];
    vi.mocked(runtime.ai).mockResolvedValue('## 结论\n有限电压下，电感电流连续。');const close=vi.fn();const view=render(<ConversationNote row={row} onClose={close}/>);
    const body=await screen.findByRole('textbox',{name:'提炼笔记内容'});expect(await listNotes(row.scope)).toHaveLength(0);
    fireEvent.change(body,{target:{value:'我整理后的笔记：电压有限时电流连续。'}});fireEvent.click(screen.getByRole('button',{name:'保存到笔记'}));await screen.findByText('已存入笔记');
    const notes=await listNotes(row.scope,recording);expect(notes).toHaveLength(1);expect(notes[0]).toMatchObject({conversationId:row.id,positionMs:65000,body:'我整理后的笔记：电压有限时电流连续。'});expect(await listNotes('other-identity')).toEqual([]);
    view.unmount();const original=render(<LectureNotebook scope={row.scope} recording={recording} positionMs={0} onSeek={()=>{}}/>);await screen.findByText('我整理后的笔记：电压有限时电流连续。');original.unmount();
    const resume=vi.fn();render(<StudyNotes scope={row.scope} onContinue={resume}/>);fireEvent.click(await screen.findByRole('button',{name:'继续讨论'}));expect(resume).toHaveBeenCalledWith(row.id);
  });
  it('cancels a note request when closed and never saves an unfinished note automatically',async()=>{
    vi.mocked(runtime.ai).mockReturnValue(new Promise(()=>{}));const row=newConversation('note-08-b','文件问题',{mode:'file',args:{file:{id:42},fileName:'课件.pptx',courseId:'7'}});row.messages=[{role:'assistant',content:'解释'}];
    const view=render(<ConversationNote row={row} onClose={()=>{}}/>);await waitFor(()=>expect(runtime.ai).toHaveBeenCalled());view.unmount();expect(runtime.cancelAi).toHaveBeenCalled();expect(await listNotes(row.scope)).toEqual([]);
  });
});
