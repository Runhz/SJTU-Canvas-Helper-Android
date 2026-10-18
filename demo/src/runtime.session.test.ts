import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn(),isTauri:()=>true,Channel:class{}}));
import {invoke} from '@tauri-apps/api/core';
import {api,restoreSession} from './runtime';
const config={accountId:'student',token:'token',cookie:'JAAuthCookie=stored',modelUrl:'',modelKey:'',modelName:''};
beforeEach(()=>vi.clearAllMocks());
describe('official web session restoration',()=>{
  it('restores account-bound official cookies before any course request',async()=>{
    let release!:(v:unknown)=>void;
    vi.mocked(invoke).mockImplementation(async(command,args:any)=>command==='native_call'?new Promise(r=>release=r):command==='canvas_request'?['courses']:{});
    const restored=restoreSession(config),read=api('courses');expect(invoke).not.toHaveBeenCalledWith('canvas_request',expect.anything());
    release({webCookies:{'https://oc.sjtu.edu.cn/':'session=renewed'}});await restored;expect(await read).toEqual(['courses']);
    expect(invoke).toHaveBeenCalledWith('restore_session',{config:{...config,webCookies:{'https://oc.sjtu.edu.cn/':'session=renewed'}}});
  });
  it('keeps token access usable if no matching official web session exists',async()=>{
    vi.mocked(invoke).mockImplementation(async command=>{if(command==='native_call')throw Error('No matching session');return {}});
    await restoreSession(config);expect(invoke).toHaveBeenCalledWith('restore_session',{config:{...config,webCookies:{}}});
  });
});
