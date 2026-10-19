import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('./runtime',()=>({NATIVE:true,ai:vi.fn(),cancelAi:vi.fn().mockResolvedValue(undefined)}));
vi.mock('./studyFileReader',()=>({readQuestionMaterials:vi.fn()}));
import * as runtime from './runtime';
import {readQuestionMaterials} from './studyFileReader';
import {newConversation,type AiPayload} from './chatHistory';
import {activateChatScope,startChat,chatJob,patchChat,stopChat} from './chatSession';
const original:AiPayload={mode:'file',args:{file:{id:1},courseId:'7',fileName:'资料甲.pdf'}};
const prepared:AiPayload={...original,args:{...original.args,documents:[{id:'1',courseId:'7',name:'资料甲.pdf',text:'甲的正文',coverage:'已读取'}]}};
beforeEach(()=>{activateChatScope('race');vi.clearAllMocks();vi.mocked(runtime.ai).mockResolvedValue('甲的回答')});afterEach(()=>activateChatScope('cleanup'));
it('keeps a newer material selection when an older read finishes late',async()=>{
 let resolve!:(p:AiPayload)=>void;vi.mocked(readQuestionMaterials).mockImplementation(()=>new Promise(r=>resolve=r));
 const row=newConversation('race','资料甲',original);startChat(row,'问题甲');const job=chatJob(row.id)!;
 const newer:AiPayload={mode:'file',args:{file:{id:2},courseId:'7',fileName:'资料乙.pdf',documents:[{id:'2',courseId:'7',name:'资料乙.pdf',text:'乙的正文',coverage:'已读取'}]}};
 patchChat({...job.row,payload:newer,draft:'接下来问乙'});resolve(prepared);await vi.waitFor(()=>expect(job.busy).toBe(false));
 expect(vi.mocked(runtime.ai).mock.calls[0][1].documents).toMatchObject([{id:'1',text:'甲的正文'}]);expect(job.row.payload.args.documents).toMatchObject([{id:'2',text:'乙的正文'}]);expect(job.row.draft).toBe('接下来问乙');expect(job.row.turns?.[0].payload.args.documents).toMatchObject([{id:'1'}]);
});
it('never starts a model request when cancelled during material preparation',async()=>{
 let resolve!:(p:AiPayload)=>void;vi.mocked(readQuestionMaterials).mockImplementation(()=>new Promise(r=>resolve=r));
 const row=newConversation('race','资料甲',original);startChat(row,'问题甲');stopChat(row.id);resolve(prepared);await Promise.resolve();await Promise.resolve();
 expect(runtime.ai).not.toHaveBeenCalled();expect(chatJob(row.id)?.row.payload.args.documents).toBeUndefined();
});
it('validates first-answer symbol definitions against newly prepared document text',async()=>{
 vi.mocked(readQuestionMaterials).mockResolvedValue({...prepared,args:{...prepared.args,documents:[{id:'1',courseId:'7',name:'课件.pptx',text:'课件明确给出 T 表示周期',coverage:'已读取'}]}});
 vi.mocked(runtime.ai).mockResolvedValue('回答<study_meta>{"questions":[],"symbols":[{"symbol":"T","meaning":"周期","evidence":"T 表示周期"}]}</study_meta>');
 const row=newConversation('race','第一问',original);startChat(row,'解释符号');await vi.waitFor(()=>expect(chatJob(row.id)?.busy).toBe(false));expect(chatJob(row.id)?.row.symbols).toMatchObject([{symbol:'T',meaning:'周期'}]);
});
