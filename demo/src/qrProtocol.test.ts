import {describe,it,expect} from 'vitest';
import {readQrMessage} from './qrProtocol';
const uuid='12345678-1234-1234-1234-123456789abc';
describe('jAccount 扫码协议',()=>{
  it('只生成官方确认页，签名按参数编码',()=>{
    const result=readQrMessage(JSON.stringify({type:'UPDATE_QR_CODE',payload:{ts:123,sig:'a+b&c'}}),uuid);
    expect(result?.kind).toBe('code');
    if(result?.kind==='code'){const url=new URL(result.url);expect(url.origin).toBe('https://jaccount.sjtu.edu.cn');expect(url.pathname).toBe('/jaccount/confirmscancode');expect(url.searchParams.get('sig')).toBe('a+b&c');expect(url.searchParams.get('uuid')).toBe(uuid);}
  });
  it('登录事件仅触发服务端回查，不信任消息内携带的凭据',()=>{
    expect(readQrMessage('{"type":"login","payload":{"cookie":"untrusted"}}',uuid)).toEqual({kind:'login'});
  });
  it('忽略无效消息、标识和不完整签名',()=>{
    for(const value of ['null','{}','not-json','{"type":1}','{"type":"UPDATE_QR_CODE","payload":{"ts":123}}'])expect(readQrMessage(value,uuid)).toBeNull();
    expect(readQrMessage('{"type":"LOGIN"}','https://invalid.test')).toBeNull();
  });
});
