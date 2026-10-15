import {useEffect,useRef,useState} from 'react';
import {QRCodeCanvas} from 'qrcode.react';
import {ArrowDownToLine,CheckCircle2,ExternalLink,LoaderCircle,RefreshCw} from 'lucide-react';
import * as runtime from './runtime';
import {QR_REFRESH_MESSAGE,readQrMessage} from './qrProtocol';

export function QrLogin({acceptCookie,openOfficial,notify,onDone}:{acceptCookie:(cookie:string)=>Promise<unknown>;openOfficial:(url:string)=>Promise<unknown>;notify:(message:string)=>void;onDone:()=>void}){
  const [url,setUrl]=useState(''),[message,setMessage]=useState('正在获取 jAccount 二维码…'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null),socket=useRef<WebSocket|null>(null),uuid=useRef(''),generation=useRef(0),verifying=useRef(false),paused=useRef(false),finished=useRef(false);
  const callbacks=useRef({acceptCookie,openOfficial,notify,onDone});callbacks.current={acceptCookie,openOfficial,notify,onDone};
  const payloadTimeout=useRef<ReturnType<typeof setTimeout>|null>(null);
  async function complete(){
    if(!uuid.current||verifying.current||finished.current)return;
    const ticket=generation.current;verifying.current=true;setBusy(true);setError('');setMessage('正在回查官方认证结果…');
    try{
      const result=await runtime.finishQrLogin(uuid.current);
      if(ticket!==generation.current)return;
      await callbacks.current.acceptCookie(result.cookie);
      if(ticket!==generation.current)return;
      finished.current=true;socket.current?.close();callbacks.current.notify('扫码认证已通过官方接口验证');callbacks.current.onDone();
    }catch(e){if(ticket===generation.current){setError(String(e));setMessage('可确认后重新检查，或刷新二维码');}}
    finally{verifying.current=false;if(ticket===generation.current)setBusy(false);}
  }
  async function begin(){
    const ticket=++generation.current;const old=uuid.current;uuid.current='';socket.current?.close();paused.current=false;finished.current=false;setSaved(false);setBusy(false);setUrl('');setError('');setMessage('正在获取 jAccount 二维码…');
    if(payloadTimeout.current)clearTimeout(payloadTimeout.current);
    try{
      if(old)await runtime.invokeCancelQr(old);
      const session=await runtime.startQrLogin();
      if(ticket!==generation.current){await runtime.invokeCancelQr(session.uuid);return;}
      uuid.current=session.uuid;
      const expected=`wss://jaccount.sjtu.edu.cn/jaccount/sub/${session.uuid}`;
      if(session.websocketUrl!==expected)throw new Error('二维码服务地址无效');
      const ws=new WebSocket(expected);socket.current=ws;
      ws.onopen=()=>{if(ticket===generation.current){ws.send(QR_REFRESH_MESSAGE);payloadTimeout.current=setTimeout(()=>{if(ticket===generation.current)setError('二维码响应超时，请刷新或使用官方网页登录');},12000);}};
      ws.onmessage=event=>{
        if(ticket!==generation.current)return;
        const parsed=readQrMessage(String(event.data),session.uuid);
        if(parsed?.kind==='code'){if(payloadTimeout.current)clearTimeout(payloadTimeout.current);setUrl(parsed.url);setError('');setMessage('等待在官方页面确认');}
        if(parsed?.kind==='login')void complete();
      };
      ws.onerror=()=>{if(ticket===generation.current)setError('无法连接 jAccount 扫码服务，可刷新或使用官方网页登录');};
      ws.onclose=()=>{if(ticket===generation.current&&!finished.current&&!verifying.current)setError('二维码连接已断开，请刷新二维码后重试');};
    }catch(e){if(ticket===generation.current)setError(String(e));}
  }
  useEffect(()=>{
    void begin();
    const refresh=setInterval(()=>{if(!document.hidden&&!paused.current&&!verifying.current&&socket.current?.readyState===WebSocket.OPEN)socket.current.send(QR_REFRESH_MESSAGE);},25000);
    const resume=()=>{if(!document.hidden&&paused.current&&!finished.current)void complete();};
    document.addEventListener('visibilitychange',resume);
    return()=>{++generation.current;clearInterval(refresh);if(payloadTimeout.current)clearTimeout(payloadTimeout.current);document.removeEventListener('visibilitychange',resume);socket.current?.close();if(uuid.current)void runtime.invokeCancelQr(uuid.current).catch(()=>{});};
  },[]);
  async function save(){
    if(!canvas.current)return;setBusy(true);setError('');paused.current=true;
    try{await runtime.native('saveQrImage',{base64:canvas.current.toDataURL('image/png').split(',')[1]});setSaved(true);setMessage('已保存，请立即在微信扫一扫中从相册识别');}
    catch(e){setError(String(e));paused.current=false;}finally{setBusy(false);}
  }
  async function openHere(){if(!url)return;setBusy(true);paused.current=true;setError('');try{await callbacks.current.openOfficial(url);finished.current=true;socket.current?.close();callbacks.current.notify('本机认证已通过官方接口验证');callbacks.current.onDone();}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <div className="qr-login">
    <div className="qr-art">{url?<QRCodeCanvas ref={canvas} value={url} size={256} level="M" marginSize={4}/>:<LoaderCircle size={32} className="spin"/>}</div>
    <p className="qr-state">{busy?<LoaderCircle size={14} className="spin"/>:<CheckCircle2 size={14}/>} {message}</p>
    <p className="paragraph">和 Windows 版使用同一套 jAccount 扫码认证。<br/>同一台手机：保存二维码 → 打开微信 → 扫一扫 → 相册 → 识别并确认 → 返回本应用。</p>
    {error&&<div className="notice amber" role="alert">{error}</div>}
    <div className="button-row"><button className="button primary" disabled={!url||busy} onClick={save}><ArrowDownToLine size={16}/>保存二维码到相册</button><button className="button secondary" disabled={!saved||busy} onClick={()=>void runtime.native('openWeChat').catch(e=>setError(String(e)))}>打开微信</button></div>
    <button className="button secondary full" disabled={!url||busy} onClick={openHere}><ExternalLink size={16}/>在本机官方页面确认</button>
    <div className="button-row"><button className="text-button" disabled={busy} onClick={()=>void begin()}><RefreshCw size={14}/>刷新二维码</button><button className="text-button" disabled={busy||!url} onClick={()=>void complete()}>我已确认，重新检查</button></div>
    <p className="form-caption">确认结果会自动回查；保存后请立即识别。过期时刷新二维码即可，Token 不会被清除。</p>
  </div>;
}
