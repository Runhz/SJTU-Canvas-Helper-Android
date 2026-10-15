// Development-only, local emulator harness. Input and results contain no real credentials.
const fs=require('node:fs');
async function main(){
  const input=JSON.parse(fs.readFileSync(0,'utf8'));
  const pages=await(await fetch('http://127.0.0.1:9229/json')).json();
  const page=pages.find(p=>p.url==='http://tauri.localhost/');if(!page)throw new Error('Native page unavailable');
  const ws=new WebSocket(page.webSocketDebuggerUrl);let seq=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  try{
    const code=require('../demo/node_modules/esbuild').transformSync(fs.readFileSync(input.script,'utf8'),{target:'chrome74'}).code;
    const result=await new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(new Error('Evaluation timed out')),25000);pending.set(id,m=>{clearTimeout(timer);if(m.error||m.result.exceptionDetails){reject(new Error(JSON.stringify(m.result?.exceptionDetails||m.error)))}else resolve(m.result.result.value)});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression:code,awaitPromise:true,returnByValue:true}}))});
    console.log(JSON.stringify(result));
  }finally{ws.close()}
}
main().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exitCode=1});
