import {describe,it,expect,vi,afterEach} from 'vitest';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,savedSettings:vi.fn(),configure:vi.fn(),restoreSession:vi.fn().mockResolvedValue(undefined),settleAll:async(p:Promise<unknown>[])=>Promise.all(p.map(value=>value.then(value=>({status:"fulfilled",value}),reason=>({status:"rejected",reason})))),saveSettings:vi.fn().mockResolvedValue(undefined),api:vi.fn(),mapCourse:(v:Course)=>v,mapAssignment:(id:string,v:unknown)=>v,loadFiles:vi.fn(),refreshReminders:vi.fn().mockResolvedValue(undefined),native:vi.fn().mockResolvedValue({tasks:[]})}));
import * as runtime from './runtime';
import {useLiveCanvas} from './useLiveCanvas';
import {mergeCourseFiles} from './courseCache';
import type {Course} from './domain';
import {ResourceCache,CACHE_TTL} from './ResourceCache';
const course:Course={id:'1',name:'课程',code:'CS',teacher:'',color:'blue',glyph:'network',files:[]};
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks()});
describe('课程资料缓存',()=>{
  it('普通同步只检查本学期，不遍历历史课程的作业',async()=>{
    const now=Date.now(),currentCourse={...course,term:{id:'current',name:'本学期',startAt:now-86400_000,endAt:now+86400_000}},oldCourse={...course,id:'2',term:{id:'old',name:'历史学期',startAt:now-400*86400_000,endAt:now-200*86400_000}};
    const config={accountId:'scope-fixture',identityId:'1',token:'not-real',cookie:'',modelKey:'',modelUrl:'',modelName:''};
    vi.mocked(runtime.savedSettings).mockResolvedValue({currentId:config.accountId,accounts:[config]});
    vi.mocked(runtime.api).mockImplementation(async(action:string)=>action==='courses'?[currentCourse,oldCourse]:[]);
    const {result}=renderHook(()=>useLiveCanvas());await waitFor(()=>expect(result.current.state.syncedAt).toBeGreaterThan(0));
    const requests=vi.mocked(runtime.api).mock.calls.filter(([action])=>action==='assignments');expect(requests.map(([,args])=>args?.courseId)).toEqual([1]);
  });
  it('重开账号先恢复缓存，不重复验证 Token 或重新请求新鲜的目录',async()=>{
    const config={accountId:'cache-fixture',identityId:'12',displayName:'缓存同学',token:'not-real',cookie:'',modelKey:'',modelUrl:'',modelName:''};
    vi.mocked(runtime.savedSettings).mockResolvedValue({currentId:config.accountId,accounts:[config]});
    const cache=new ResourceCache('canvas-resources-v2:cache-fixture:12');await cache.get('courses',CACHE_TTL.courses,async()=>[course]);
    await cache.get('files:1',CACHE_TTL.files,async()=>[{id:'9',name:'缓存.pptx',size:'2 MB',kind:'PPTX',updated:'今天'}]);
    vi.mocked(runtime.api).mockResolvedValue([]);
    const {result}=renderHook(()=>useLiveCanvas());await waitFor(()=>expect(result.current.courses).toHaveLength(1));
    expect(result.current.name).toBe('缓存同学');expect(result.current.courses[0].files[0].name).toBe('缓存.pptx');
    expect(runtime.configure).not.toHaveBeenCalled();expect(runtime.restoreSession).toHaveBeenCalledWith(config);
    await act(async()=>{await result.current.files(course)});expect(runtime.loadFiles).not.toHaveBeenCalled();
    expect(vi.mocked(runtime.api).mock.calls.some(([action])=>action==='courses')).toBe(false);
  });
  it('更新课程元数据时保留资料；删除的课程不会残留',()=>{
    const previous=[{...course,files:[{id:'9',name:'中文.pptx',size:'30 MB',kind:'PPTX',updated:'今天'}],filesLoaded:true}];
    const merged=mergeCourseFiles(previous,[{...course,name:'新名称'}]);expect(merged[0].name).toBe('新名称');expect(merged[0].files).toHaveLength(1);expect(mergeCourseFiles(previous,[])).toEqual([]);
  });
  it('实际定时同步链路不会清空已加载的课程资料，失败重试也保留旧列表',async()=>{
    const config={accountId:'fixture-only',token:'not-real',cookie:'',modelKey:'',modelUrl:'',modelName:''};vi.mocked(runtime.savedSettings).mockResolvedValue({currentId:config.accountId,accounts:[config]});vi.mocked(runtime.configure).mockResolvedValue({id:1,name:'测试'});
    vi.mocked(runtime.api).mockImplementation(async(action:string)=>action==="courses"?[course]:[]);
    const files=[{id:'9',name:'课件.pptx',size:'30 MB',kind:'PPTX',updated:'今天'}];vi.mocked(runtime.loadFiles).mockResolvedValue(files);
    const {result}=renderHook(()=>useLiveCanvas());await waitFor(()=>expect(result.current.courses).toHaveLength(1));
    await act(async()=>{await result.current.files(course)});await act(async()=>{await result.current.refresh()});expect(result.current.courses[0].files).toEqual(files);
    vi.mocked(runtime.loadFiles).mockRejectedValueOnce(new Error('offline'));await act(async()=>{try{await result.current.files(course,true)}catch{}});expect(result.current.courses[0].files).toEqual(files);expect(result.current.courses[0].fileError).toContain('offline');
  });
});
