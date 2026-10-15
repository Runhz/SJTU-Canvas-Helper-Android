import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn(),isTauri:()=>true,Channel:class{}}));
import {invoke} from '@tauri-apps/api/core';
import {loadDashboard,normalizeCanvasToken,settleAll,ai,materialText} from './runtime';
beforeEach(()=>vi.clearAllMocks());
describe('连接与同步隔离',()=>{
  it('课堂问答携带连续历史而不跨课复用上下文',async()=>{
    vi.mocked(invoke).mockResolvedValue('回答');
    await ai('materials',{text:'课堂一字幕'},'请继续解释',()=>{},[{role:'user',content:'先前问题'},{role:'assistant',content:'先前回答'}]);
    const args=vi.mocked(invoke).mock.calls[0][1] as any;
    expect(args.messages.map((m:any)=>m.content)).toEqual(['先前问题','先前回答','请继续解释']);
    expect(args.args.text).toBe('课堂一字幕');
  });
  it('无字幕和 OCR 时不把课堂标题当作可总结资料',async()=>{
    vi.mocked(invoke).mockImplementation(async(_command,args:any)=>args.action==='videoInfo'?{courId:10}:args.action==='slides'?[]:{});
    const result=await materialText({id:'1',title:'空课堂',courseId:'9',source:'canvas',materialsId:10,raw:{}});
    expect(result.text).toBe('');expect(result.lines).toHaveLength(0);
  });
  it('旧 WebView 没有 allSettled 时仍能隔离失败任务',async()=>{
    const original=Promise.allSettled;
    try{Object.defineProperty(Promise,'allSettled',{value:undefined,configurable:true,writable:true});expect(await settleAll([Promise.resolve(1),Promise.reject('offline')])).toEqual([{status:'fulfilled',value:1},{status:'rejected',reason:'offline'}]);}
    finally{Object.defineProperty(Promise,'allSettled',{value:original,configurable:true,writable:true});}
  });
  it('处理手机粘贴的前缀、换行和不可见字符，拒绝说明文字',()=>{
    expect(normalizeCanvasToken(' Bearer demo\nToken\u200b123 ')).toBe('demoToken123');
    expect(()=>normalizeCanvasToken('demoToken这里是令牌')).toThrow('Token 格式');
    expect(()=>normalizeCanvasToken('')).toThrow('Token 格式');
  });
  it('先交付课程，单门作业失败不会丢失其他课程结果',async()=>{
    vi.mocked(invoke).mockImplementation(async(_command,args:any)=>{
      if(args.action==='courses')return [{id:1,name:'课程一'},{id:2,name:'课程二'}];
      if(args.args.courseId===2)throw new Error('permission denied');
      return [{id:11,name:'中文作业',submission:{workflow_state:'unsubmitted'}}];
    });
    const received=vi.fn();const result=await loadDashboard(received);
    expect(received.mock.calls[0][0]).toHaveLength(2);
    expect(result.assignments.map(a=>a.id)).toEqual(['1:11']);
    expect(result.failedCourseIds).toEqual(['2']);
  });
});
