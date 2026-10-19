import {expect,it} from 'vitest';
import {lecturePayload,parseStudyAnswer} from './studyAssist';
import {savedPayload,reuseDocumentPayload,newConversation,saveConversation,listConversations} from './chatHistory';
import {apiPayload,seedSources,rangedSource} from './studyAttachments';
const lines=[{bg:1000,ed:2000,res:'最早定义 f 表示频率'},{bg:190000,ed:192000,res:'当前讲解'},{bg:250000,ed:251000,res:'后面的应用'}];
it('keeps nearby focus while making the complete lecture available as background',()=>{
 const payload=lecturePayload('课堂','canvas:71','7',195000,lines);
 expect(payload.args.text).toContain('当前讲解');expect(payload.args.text).not.toContain('最早定义');expect(payload.args.lectureBackground).toMatchObject({resourceId:'canvas:71',lines});
});
it('retains deliberately selected course files on the next screenshot in the same lecture only',()=>{
 const old={mode:'materials',args:{resourceId:'canvas:71',files:[{id:9,courseId:'7',name:'讲义.pptx'}],documents:[{id:'9',courseId:'7',name:'讲义.pptx',text:'已经读过的课件正文',coverage:'正文'}]}};
 const next=reuseDocumentPayload(lecturePayload('课堂','canvas:71','7',195000,lines),old);expect(next.args.files).toMatchObject([{id:9}]);expect(next.args.documents).toMatchObject([{text:'已经读过的课件正文'}]);
 expect(reuseDocumentPayload(lecturePayload('另一堂','canvas:72','7',195000,lines),old).args.files).toBeUndefined();
});
it('respects explicit subtitle selection and removal instead of silently retaining the entire lecture',async()=>{
 const original=lecturePayload('课堂','canvas:71','7',195000,lines),sources=seedSources('课堂',original),source=sources.find(s=>s.kind==='subtitle')!;
 expect(source.lines).toEqual(lines);
 const kept=await apiPayload([source],original,'test');expect(kept.args.lectureBackground).toMatchObject({lines});expect(kept.args.text).toContain('当前讲解');expect(kept.args.text).not.toContain('后面的应用');
 const range=await apiPayload([rangedSource(source,180000,200000,'txt')],original,'test');expect(range.args.lectureBackground).toBeUndefined();expect(range.args.subtitleScope).toBe('selected');
 const image={key:'image',name:'画面',kind:'image' as const,courseId:'7',resourceId:'canvas:71',mime:'image/jpeg',image:'data:image/jpeg;base64,YQ=='};
 const removed=await apiPayload([image],original,'test');expect(removed.args.lectureBackground).toBeUndefined();expect(removed.args.text).toBe('');
});
it('persists the teaching choice and one copy of background without credentials or cross-lecture reuse',async()=>{
 const payload=lecturePayload('课堂','canvas:71','7',195000,lines);payload.args.learningSkill='recall';payload.args.lectureBackground={resourceId:'canvas:71',lines:[...lines,{bg:1,res:'唯一整堂背景内容'}],token:'PRIVATE'};
 const row=newConversation('workflow-cache','课堂',payload);row.messages=[{role:'user',content:'问题'}];row.turns=[{id:'t',messageIndex:0,payload,status:'open',createdAt:1}];await saveConversation(row);const saved=(await listConversations(row.scope))[0];
 expect(saved.payload.args.learningSkill).toBe('recall');expect(JSON.stringify(saved).match(/唯一整堂背景内容/g)).toHaveLength(1);expect(JSON.stringify(saved)).not.toContain('PRIVATE');
 const anchor=reuseDocumentPayload(saved.turns![0].payload,saved.payload);expect(anchor.args.lectureBackground).toBeTruthy();expect(savedPayload({mode:'materials',args:{resourceId:'other',lectureBackground:payload.args.lectureBackground}}).args.lectureBackground).toBeUndefined();
});
it('accepts symbol evidence from actually read PPT and PDF bodies as well as subtitles',()=>{
 const payload={mode:'file',args:{file:{id:1},resourceId:'canvas:1',lectureBackground:{resourceId:'canvas:1',lines:[{bg:1000,res:'开头定义 f 表示频率'}]},documents:[{id:'1',name:'讲义.pptx',text:'本页定义 T 表示周期'}]}};
 const result=parseStudyAnswer('说明<study_meta>{"questions":[],"symbols":[{"symbol":"T","meaning":"周期","evidence":"T 表示周期"},{"symbol":"f","meaning":"频率","evidence":"f 表示频率"}]}</study_meta>',payload);expect(result.symbols).toMatchObject([{symbol:'T',meaning:'周期'},{symbol:'f',meaning:'频率'}]);
});
