import {describe,it,expect,vi} from 'vitest';
import {VideoSession} from './videoSession';
describe('recording service session',()=>{
  it('restores a fresh native client, merges concurrent login and never persists a success marker',async()=>{
    let release!:()=>void;const login=vi.fn(()=>new Promise<void>(r=>release=r)),read=vi.fn().mockResolvedValue('lecture');const session=new VideoSession(login);
    const first=session.request(read),second=session.request(read);expect(login).toHaveBeenCalledTimes(1);release();expect(await Promise.all([first,second])).toEqual(['lecture','lecture']);await session.request(read);expect(login).toHaveBeenCalledTimes(1);
    session.reset();const afterRestart=session.request(read);expect(login).toHaveBeenCalledTimes(2);release();await afterRestart;
  });
  it('silently restores lost service cookies once and still exposes truly expired credentials',async()=>{
    const login=vi.fn().mockResolvedValue({}),read=vi.fn().mockRejectedValueOnce(Error('登录已过期或无访问权限')).mockResolvedValue('ok');const session=new VideoSession(login);
    expect(await session.request(read)).toBe('ok');expect(login).toHaveBeenCalledTimes(2);
    read.mockRejectedValue(Error('403'));await expect(session.request(read)).rejects.toThrow('403');expect(read).toHaveBeenCalledTimes(4);
  });
  it('does not retry network failures or run an old identity request after switching accounts',async()=>{
    let release!:()=>void;const read=vi.fn(),session=new VideoSession(()=>new Promise<void>(r=>release=r));const pending=session.request(read);session.reset();release();await expect(pending).rejects.toThrow('切换');expect(read).not.toHaveBeenCalled();
    const login=vi.fn().mockResolvedValue({}),network=new VideoSession(login);await expect(network.request(()=>Promise.reject(Error('network timeout')))).rejects.toThrow('network timeout');expect(login).toHaveBeenCalledTimes(1);
  });
});
