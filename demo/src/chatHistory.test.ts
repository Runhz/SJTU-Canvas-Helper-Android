import {beforeEach,describe,expect,it,vi} from 'vitest';
import {deleteConversation,listConversations,newConversation,saveConversation,savedPayload,reuseDocumentPayload} from './chatHistory';
beforeEach(async()=>{await listConversations('unused');localStorage.clear();});
describe('local conversations',()=>{
  it('preserves intact messages while cleaning malformed metadata and duplicate legacy anchors',async()=>{
    const row=newConversation('legacy-metadata','旧记录',{mode:'materials',args:{text:'正文'}});
    const turn={id:'first',messageIndex:0,payload:row.payload,status:'open',createdAt:1};
    localStorage.setItem(`canvas-chat-v1:${row.scope}:${row.id}`,JSON.stringify({...row,messages:[{role:'user',content:'问题'},{role:'assistant',content:'完整回答',reasoning:123}],turns:[null,turn,{...turn,id:'latest',payload:{mode:'materials',args:{text:'最后一次重试使用的正文'}}},{...turn,id:'broken',messageIndex:-1}],followUps:[null,'有效追问'],symbols:[null],pinned:42}));
    const [loaded]=await listConversations(row.scope);expect(loaded.messages[1].content).toBe('完整回答');expect(loaded.messages[1].reasoning).toBeUndefined();expect(loaded.turns).toHaveLength(1);expect(loaded.turns?.[0].id).toBe('latest');expect(loaded.followUps).toEqual(['有效追问']);expect(loaded.symbols).toEqual([]);expect(loaded.pinned).toBeUndefined();
  });
  it('allows normal saving after a failed deletion and does not leave a false deletion marker',async()=>{
    const row=newConversation('failed-delete','保留对话',{mode:'agent',args:{}});await saveConversation(row);
    const remove=vi.spyOn(Storage.prototype,'removeItem').mockImplementationOnce(()=>{throw Error('storage unavailable')});
    await expect(deleteConversation(row.scope,row.id)).rejects.toThrow('storage unavailable');remove.mockRestore();await saveConversation({...row,draft:'删除失败后继续编辑'});expect((await listConversations(row.scope))[0].draft).toBe('删除失败后继续编辑');
  });
  it('does not resurrect a deleted conversation when a stale view saves later',async()=>{
    const row=newConversation('deleted-history','应当删除',{mode:'agent',args:{}});row.draft='旧窗口里的草稿';
    await saveConversation(row);await deleteConversation(row.scope,row.id);await saveConversation({...row,draft:'迟到的保存'});
    expect(await listConversations(row.scope)).toEqual([]);
  });
  it('restores a file body from persisted history when its entry supplies IDs only',async()=>{
    const payload={mode:'file',args:{file:{id:42},courseId:'7',fileName:'讲义.pdf',documents:[{id:'42',courseId:'7',name:'讲义.pdf',preparedId:'opaque-source',text:'持久保存的正文',coverage:'已读取',images:[{page:1,image:'data:image/jpeg;base64,YQ=='}]}]}};
    const row=newConversation('reopen-file','讲义',payload);await saveConversation(row);
    const [saved]=await listConversations('reopen-file');const restored=reuseDocumentPayload({mode:'file',args:{file:{id:42},courseId:'7',fileName:'讲义.pdf'}},saved.payload);
    expect(restored.args.documents).toEqual(saved.payload.args.documents);expect(restored.args.file).toEqual({id:42,preparedId:'opaque-source'});
    expect(reuseDocumentPayload({mode:'agent',args:{}},saved.payload).args.documents).toBeUndefined();
    expect(reuseDocumentPayload({mode:'file',args:{file:{id:42},courseId:'8'}},saved.payload).args.documents).toBeUndefined();
  });
  it('invalidates updated file content and never revives an explicitly removed attachment',()=>{
    const old={mode:'materials',args:{files:[{id:42,courseId:'7',updatedAt:'old',size:20}],documents:[{id:'42',courseId:'7',name:'讲义.pdf',preparedId:'file:42:old:20',version:'file:42:old:20',text:'旧正文',coverage:'已读取'}]}};
    const same=reuseDocumentPayload({mode:'file',args:{file:{id:42,updatedAt:'old',size:20},courseId:'7'}},old);expect(same.args.documents).toHaveLength(1);
    const changed=reuseDocumentPayload({mode:'file',args:{file:{id:42,updatedAt:'new',size:20,preparedId:'file:42:old:20'},courseId:'7',documentPages:[{id:'42',courseId:'7',pages:[9]}]}},old);expect(changed.args.documents).toBeUndefined();expect(changed.args.file).toEqual({id:42,updatedAt:'new',size:20});expect(changed.args.documentPages).toEqual([]);
    expect(reuseDocumentPayload({mode:'materials',args:{text:'只选择字幕',files:[]}},old).args.documents).toBeUndefined();
    expect(JSON.stringify(savedPayload({mode:'file',args:{file:{id:42,updatedAt:'new',size:20,url:'SECRET',token:'SECRET'}}}))).not.toContain('SECRET');
  });
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
