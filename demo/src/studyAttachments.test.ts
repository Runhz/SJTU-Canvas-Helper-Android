import {describe,it,expect,vi} from 'vitest';
vi.mock('./runtime',()=>({NATIVE:false,native:vi.fn()}));
import {apiPayload,linesInRange,parseTime,rangedSource,seedSources} from './studyAttachments';
describe('study attachment selection',()=>{
  it('keeps original timestamps and crossing subtitle lines in a time excerpt',()=>{
    const lines=[{bg:1000,ed:4000,res:'第一句'},{bg:5000,ed:8000,res:'第二句'},{bg:9000,ed:10000,res:'第三句'}];
    expect(linesInRange(lines,3000,6000)).toEqual(lines.slice(0,2));
    const source=seedSources('课堂',{mode:'materials',args:{resourceId:'canvas:7',text:'正文',subtitleLines:lines}})[0];
    const srt=rangedSource(source,3000,6000,'srt');expect(srt.text).toContain('00:00:01,000 --> 00:00:04,000');expect(srt.text).not.toContain('第三句');
    expect(()=>rangedSource(source,11000,12000,'txt')).toThrow('没有字幕');
  });
  it('validates entered times without silently accepting malformed ranges',()=>{
    expect(parseTime('02:03')).toBe(123000);expect(parseTime('01:02:03')).toBe(3723000);expect(parseTime('01:99')).toBeNull();expect(parseTime('garbage')).toBeNull();
    expect(()=>linesInRange([],5000,1000)).toThrow();
  });
  it('does not transmit an unchecked image or old classroom text to the API',async()=>{
    const original={mode:'materials',args:{text:'不得发送的旧字幕',screenshot:'data:image/jpeg;base64,OLD',timePoints:[999],resourceId:'canvas:1'}};
    const source={key:'new',name:'选定字幕.txt',kind:'subtitle' as const,courseId:'1',resourceId:'canvas:1',mime:'text/plain',text:'选定字幕',lines:[{bg:1000,ed:2000,res:'选定字幕'}]};
    const result=await apiPayload([source],original,'demo');expect(result.args.screenshot).toBeUndefined();expect(result.args.excludePreviousImage).toBe(true);expect(result.args.text).not.toContain('旧字幕');expect(result.args.timePoints).toEqual([1]);expect(result.args.text).toContain('#video=canvas%3A1&t=1');
  });
  it('retains the original single-file assistant and sends stable IDs for multiple files',async()=>{
    const files=seedSources('课件.pptx',{mode:'file',args:{file:{id:42},courseId:'7'}});
    const one=await apiPayload(files,{mode:'agent',args:{}},'demo');expect(one.mode).toBe('file');expect(one.args.file).toMatchObject({id:42});
    const two=await apiPayload([...files,{...files[0],resourceId:'43',key:'second'}],{mode:'agent',args:{}},'demo');expect((two.args.files as {id:number}[]).map(f=>f.id)).toEqual([42,43]);
  });
  it('rejects multiple screenshots without suggesting a removed website',async()=>{
    const image={key:'image',name:'截图.jpg',kind:'image' as const,courseId:'1',resourceId:'class',mime:'image/jpeg',image:'data:image/jpeg;base64,TEST'};
    await expect(apiPayload([image,{...image,key:'second'}],{mode:'agent',args:{}},'demo')).rejects.toThrow('分开提问');
  });
});
