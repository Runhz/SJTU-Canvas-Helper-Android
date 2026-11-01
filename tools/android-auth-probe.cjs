// Local emulator diagnostics. Credentials arrive on stdin, never in arguments, files or output.
const fs=require('node:fs');
async function main(){
  const input=JSON.parse(fs.readFileSync(0,'utf8'));
  const pages=await(await fetch('http://127.0.0.1:9229/json')).json();
  const page=pages.find(p=>p.url==='http://tauri.localhost/');
  if(!page)throw new Error('Android debug page is unavailable');
  const ws=new WebSocket(page.webSocketDebuggerUrl);let sequence=0;const pending=new Map();
  ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(new Error('Android debug connection failed'));});
  const evaluate=expression=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>reject(new Error('Android evaluation timed out')),24000);pending.set(id,m=>{clearTimeout(timer);if(m.result?.exceptionDetails||m.error)reject(new Error('Android evaluation failed'));else resolve(m.result.result.value);});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
  try{
    let expression;
    if(input.mode==='openForm'){
      expression=`(()=>{Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='连接账号')?.click();return {opened:true}})()`;
    }else if(input.mode==='connect'){
      expression=`(async()=>{const find=s=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===s);find('连接账号')?.click();await new Promise(r=>setTimeout(r,50));const field=document.querySelector('input[aria-label="Canvas Token"]');if(!field)return {error:'Token form unavailable'};const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(field,${JSON.stringify(input.token)});field.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,50));find('验证并连接本部账号')?.click();const end=Date.now()+21000;while(Date.now()<end){if(document.querySelector('.auth-step small')?.textContent.includes('已连接'))return {connected:true,progressVisible:document.body.textContent.includes('Token 认证与课程同步分别进行')};const error=document.querySelector('.native-form [role="alert"]')?.textContent;if(error)return {connected:false,error};await new Promise(r=>setTimeout(r,150));}return {connected:false,pending:true};})()`;
    }else if(input.mode==='qr'){
      expression=`(async()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='扫码认证');if(!b||b.disabled)return {error:'QR entry is unavailable'};b.click();const end=Date.now()+21000;while(Date.now()<end){const canvas=document.querySelector('.qr-art canvas');if(canvas)return {qrReady:true,width:canvas.width,saveAvailable:Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('保存二维码到相册')&&!b.disabled)};const error=document.querySelector('.qr-login [role="alert"]')?.textContent;if(error)return {qrReady:false,error};await new Promise(r=>setTimeout(r,150));}return {qrReady:false,pending:true};})()`;
    }else if(input.mode==='diag'){
      expression=`window.__TAURI_INTERNALS__.invoke('native_call',{method:'diagnoseCanvas',args:{}})`;
    }else if(input.mode==='invalidToken'){
      expression=`(async()=>{try{await window.__TAURI_INTERNALS__.invoke('configure_session',{config:{accountId:'invalid-probe',token:'invalid-test-token',cookie:'',modelKey:'',modelUrl:'https://api.deepseek.com/v1',modelName:'deepseek-flash'}});return {unexpectedSuccess:true};}catch(e){return {rejected:true,message:String(e)}}})()`;
    }else if(input.mode==='pendingQr'){
      expression=`(async()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='我已确认，重新检查');if(!b||b.disabled)return {error:'Pending QR entry unavailable'};b.click();const end=Date.now()+20000;while(Date.now()<end){const error=document.querySelector('.qr-login [role="alert"]')?.textContent;if(error)return {confirmed:false,message:error};await new Promise(r=>setTimeout(r,150));}return {pending:true};})()`;
    }else if(input.mode==='saveQr'){
      expression=`(async()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='保存二维码到相册');if(!b||b.disabled)return {saved:false};b.click();const end=Date.now()+15000;while(Date.now()<end){if(document.querySelector('.qr-state')?.textContent.includes('已保存'))return {saved:true};const error=document.querySelector('.qr-login [role="alert"]')?.textContent;if(error)return {saved:false,error};await new Promise(r=>setTimeout(r,150));}return {saved:false,pending:true};})()`;
    }else if(input.mode==='summary'){
      expression=`({native:!!window.__TAURI_INTERNALS__,connected:document.querySelector('.auth-step small')?.textContent.includes('已连接'),hasError:!!document.querySelector('[role="alert"]'),syncMessage:document.querySelector('.live-ribbon')?.firstChild?.nextSibling?.textContent})`;
    }else if(input.mode==='syncSummary'){
      expression=`(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('canvas-cache:'));const data=key?JSON.parse(localStorage.getItem(key)):null;return {snapshotSaved:!!data?.syncedAt,assignmentCount:data?.assignments?.length||0,syncFailed:!!document.querySelector('.app-shell > .notice[role="alert"]'),message:document.querySelector('.app-shell > .notice[role="alert"]')?.textContent||'',progress:document.querySelector('.live-ribbon')?.textContent};})()`;
    }else throw new Error('Unknown diagnostic mode');
    // API 29 emulator ships Chromium 74; debug expressions need the same syntax target as the app.
    const compiled=require('../demo/node_modules/esbuild').transformSync(expression,{target:'chrome74'}).code;
    const result=await evaluate(compiled);console.log(JSON.stringify(result));
  }finally{input.token=null;ws.close();}
}
main().catch(error=>{console.log(JSON.stringify({error:'Local Android diagnostic failed',reason:error.message}));process.exitCode=1;});
