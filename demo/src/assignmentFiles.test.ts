import {describe,it,expect} from 'vitest';
import {requirementFiles} from './assignmentFiles';
import {mapAssignment} from './runtime';
describe('assignment resources',()=>{
  it('keeps Canvas file identities from requirement links and deduplicates API and page links',()=>{
    const files=requirementFiles('<a href="/courses/7/files/42/download?download_frd=1" data-api-endpoint="https://oc.sjtu.edu.cn/api/v1/courses/7/files/42">实验要求.pdf</a><a href="/files/44">模板.pptx</a>');
    expect(files.map(f=>[f.id,f.name])).toEqual([['42','实验要求.pdf'],['44','模板.pptx']]);expect(JSON.stringify(files)).not.toContain('download_frd');
  });
  it('rejects foreign origins, script links and malformed identifiers',()=>{
    expect(requirementFiles('<a href="https://evil.test/files/42">bad</a><a href="javascript:alert(1)">bad</a><a href="https://oc.sjtu.edu.cn.evil.test/files/43">bad</a>')).toEqual([]);
  });
  it('keeps downloadable submitted files without treating a name as a file ID',()=>{
    const a=mapAssignment('7',{id:8,description:'<a href="/files/4">要求.pdf</a>',submission:{submitted_at:'2026-10-17T08:00:00Z',attachments:[{id:5,filename:'我的答案.pdf',size:1024},{display_name:'旧记录.pdf'}]}});
    expect(a.requirementFiles?.[0].raw?.id).toBe(4);expect(a.submittedFiles?.map(f=>f.id)).toEqual(['5']);expect(a.attachments).toEqual(['我的答案.pdf','旧记录.pdf']);
  });
});
