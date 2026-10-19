import {beforeEach,describe,expect,it} from 'vitest';
import {deleteConversation,listConversations,newConversation,saveConversation,savedPayload} from './chatHistory';
beforeEach(async()=>{await listConversations('unused');localStorage.clear();});
describe('local conversations',()=>{
  it('stores document bodies once while retaining older turn references for rereading',async()=>{
    const payload={mode:'file',args:{file:{id:42},fileName:'讲义.pdf',documents:[{id:'42',courseId:'7',name:'讲义.pdf',preparedId:'opaque-source',text:'唯一文件正文',coverage:'全部文字'}]}};
    const row=newConversation('deduplicated','讲义',payload);row.turns=[{id:'turn',messageIndex:0,payload,status:'open',createdAt:1}];await saveConversation(row);const [saved]=await listConversations('deduplicated');
    expect(JSON.stringify(saved).match(/唯一文件正文/g)).toHaveLength(1);expect(saved.turns?.[0].payload.args.documents).toBeUndefined();expect(saved.turns?.[0].payload.args.file).toEqual({id:42,preparedId:'opaque-source'});expect(saved.payload.args.documents).toHaveLength(1);
  });
  it('skips damaged rows without hiding intact history',async()=>{
    const row=newConversation('student-a','完整对话',{mode:'agent',args:{}});await saveConversation(row);
    localStorage.setItem('canvas-chat-v1:student-a:broken',JSON.stringify({...row,id:'broken',messages:[null]}));
    expect((await listConversations('student-a')).map(item=>item.title)).toEqual(['完整对话']);
  });
  it('round-trips messages, drafts and original subtitle context without credentials',async()=>{
    const payload={mode:'materials',args:{resourceId:'canvas:2',text:'原始字幕\n公式 $x^2$',timePoints:[1,4],token:'private-test-only',headers:{Cookie:'private-test-only'},url:'https://example.test/?token=private'}};
    const row=newConversation('student-a','测试课堂',payload);row.messages=[{role:'user',content:'第一问'},{role:'assistant',content:'回答'}];row.draft='还没发出的问题';
    await saveConversation(row);
    const [loaded]=await listConversations('student-a');
    expect(loaded.messages).toEqual(row.messages);expect(loaded.draft).toBe(row.draft);expect(loaded.payload.args.text).toBe(payload.args.text);
    expect(JSON.stringify(loaded)).not.toContain('private');
    expect(savedPayload({mode:'file',args:{file:{id:12,url:'https://example.test/private',headers:{}}}})).toEqual({mode:'file',args:{file:{id:12}}});
  });
  it('isolates users and separate conversations for the same classroom',async()=>{
    const first=newConversation('student-a','课堂',{mode:'materials',args:{resourceId:'canvas:2'}}),second=newConversation('student-a','课堂',{mode:'materials',args:{resourceId:'canvas:2'}}),other=newConversation('student-b','课堂',{mode:'materials',args:{resourceId:'canvas:2'}});
    await saveConversation(first);await saveConversation(second);await saveConversation(other);
    expect(await listConversations('student-a')).toHaveLength(2);expect(await listConversations('student-b')).toHaveLength(1);
    await deleteConversation('student-b',first.id);expect(await listConversations('student-a')).toHaveLength(2);
    await deleteConversation('student-a',first.id);expect((await listConversations('student-a'))[0].id).toBe(second.id);
  });
  it('keeps bundle source IDs while discarding authentication and download URLs',()=>{
    expect(savedPayload({mode:'materials',args:{files:[{id:12,name:'中文课件.pptx',courseId:'4',url:'https://private.test',headers:{Authorization:'secret'}},null],headers:{Cookie:'secret'}}})).toEqual({mode:'materials',args:{files:[{id:12,name:'中文课件.pptx',courseId:'4'}]}});
  });
});
