import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {fileUnits,fileVersion,getDocument,indexFile,indexLecture,listDocuments,listNotes,saveNote,deleteNote,searchLibrary,loadLinks,saveLinks} from './studyLibrary';
const file={id:'42',name:'中文课件.pptx',kind:'PPTX',size:'1 MB',updated:'今天',raw:{id:42,size:100,updatedAt:'2026-10-16',url:'https://host.test/private?token=SECRET',token:'SECRET'}};
const recording={id:'201',title:'第2讲',courseId:'7',source:'canvas' as const,materialsId:8,raw:{url:'https://private.test/?token=SECRET'}};
describe('durable learning library',()=>{
  it('keeps only explicit source page numbers, with no invented PDF pages',()=>{
    expect(fileUnits('[幻灯片 1]\n第一页\n[幻灯片 5]\n第五页')).toEqual([{page:1,text:'第一页'},{page:5,text:'第五页'}]);
    expect(fileUnits('PDF continuous text')).toEqual([{text:'PDF continuous text'}]);
  });
  it('indexes UTF-8 sources, replaces old revisions and isolates identities',async()=>{
    const scope='["学生甲","1"]';await indexFile(scope,'7',file,'[幻灯片 2]\n傅里叶变换与卷积定理');
    const saved=await getDocument(scope,'42');expect(saved?.file?.raw).not.toHaveProperty('url');expect(JSON.stringify(saved)).not.toContain('SECRET');
    const hits=await searchLibrary(scope,'傅里叶 卷积',new AbortController().signal);expect(hits).toHaveLength(1);expect(hits[0]).toMatchObject({page:2,courseId:'7',file:{id:'42'}});
    expect(await searchLibrary('["学生甲","2"]','傅里叶',new AbortController().signal)).toEqual([]);
    await indexFile(scope,'7',{...file,raw:{...file.raw,updatedAt:'2026-10-17'}},'[幻灯片 3]\n新内容');
    expect(await searchLibrary(scope,'傅里叶',new AbortController().signal)).toEqual([]);expect((await listDocuments(scope)).filter(d=>d.kind==='file')).toHaveLength(1);
    expect((await getDocument(scope,'42'))?.version).not.toBe(fileVersion(file));
  });
  it('stores searchable notes and lecture time references without authenticated URLs',async()=>{
    const scope='note-scope';await indexLecture(scope,recording,[{bg:2500,res:'微积分基本定理'}],[]);
    await saveNote({id:'note1',scope,courseId:'7',title:'积分疑问',body:'微积分推导为何成立',recording,positionMs:7000,updatedAt:0});
    const hits=await searchLibrary(scope,'微积分',new AbortController().signal);expect(hits.map(h=>h.timeMs).sort((a,b)=>a!-b!)).toEqual([2500,7000]);
    const notes=await listNotes(scope,recording);expect(notes[0].recording?.raw).toEqual({});
    await deleteNote('other','note1');expect(await listNotes(scope)).toHaveLength(1);await deleteNote(scope,'note1');expect(await listNotes(scope)).toEqual([]);
  });
  it('stops a cancelled search',async()=>{
    const c=new AbortController();c.abort();await expect(searchLibrary('note-scope','微积分',c.signal)).rejects.toThrow('取消');
  });
  it('keeps independent manually confirmed links for multiple course decks',()=>{
    saveLinks('student',recording,[{fileId:'42',fileName:'第一章.pptx',version:'v1',fromMs:1000,page:2},{fileId:'43',fileName:'第二章.pptx',version:'v2',fromMs:40000}]);
    expect(loadLinks('student',recording)).toHaveLength(2);expect(loadLinks('other',recording)).toEqual([]);
    expect(loadLinks('student',{...recording,id:'202'})).toEqual([]);
  });
});
