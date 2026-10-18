import {beforeEach,describe,it,expect} from 'vitest';
import {lecturePayload,nearbyLecture,parseStudyAnswer,visibleAnswer,loadPresets,savePresets} from './studyAssist';
beforeEach(()=>localStorage.clear());
describe('question context and assistant metadata',()=>{
  it('uses already-played nearby subtitles, preserving real timestamps and avoiding future spoilers',()=>{
    const lines=[{bg:1000,ed:2000,res:'早期内容'},{bg:80000,ed:83000,res:'前置条件'},{bg:190000,ed:191000,res:'当前推导'},{bg:210000,ed:213000,res:'未来结论'}];
    expect(nearbyLecture(lines,195000).map(l=>l.res)).toEqual(['前置条件','当前推导']);const p=lecturePayload('电路','canvas:1','7',195000,lines,'data:image/jpeg;base64,YQ==');expect(p.args.text).toContain('t=190');expect(p.args.text).not.toContain('未来结论');expect(p.args.positionMs).toBe(195000);expect(p.args.timePoints).toEqual([80,190,195]);
    expect(nearbyLecture(lines,0)).toEqual([]);
  });
  it('hides incremental metadata and accepts suggestions and only verbatim source-supported symbol evidence',()=>{
    expect(visibleAnswer('回答\n<study_m')).toBe('回答');const raw='说明\n<study_meta>'+JSON.stringify({questions:['还有什么条件？','还有什么条件？','能举例吗？'],symbols:[{symbol:'L',meaning:'电感',evidence:'L 表示电感'},{symbol:'R',meaning:'电阻',evidence:'R 表示电阻'}]})+'</study_meta>';
    const result=parseStudyAnswer(raw,{mode:'materials',args:{text:'这里 L 表示电感，单位 H',positionMs:9000}});expect(result.answer).toBe('说明');expect(result.questions).toEqual(['还有什么条件？','能举例吗？']);expect(result.symbols).toEqual([{symbol:'L',meaning:'电感',evidence:'L 表示电感',positionMs:9000}]);
    expect(parseStudyAnswer('正常回答<study_meta>broken',{mode:'agent',args:{}}).questions).toEqual([]);
  });
  it('keeps custom presets isolated by account and rejects invalid stored prompts',()=>{
    savePresets('a',[{id:'mine',label:'我的习惯',prompt:'先直觉，再公式',favorite:true}]);expect(loadPresets('a')[0].prompt).toBe('先直觉，再公式');expect(loadPresets('b')[0].id).toBe('explain');localStorage.setItem('canvas-ai-presets-v1:a',JSON.stringify([{id:'x',label:'x',prompt:12}]));expect(loadPresets('a')[0].id).toBe('explain');
  });
});
