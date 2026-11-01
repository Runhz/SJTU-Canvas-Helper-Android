// Local-only integration fixture; never forwards prompts or keys to an external service.
const http=require('node:http');
const chunks=['### 流式连接验证\n\n','首段已经到达，','后续文字正在继续显示。\n\n','行内公式 $a^2+b^2=c^2$。\n\n','$$\\int_0^1 x^2\\,dx=\\frac{1}{3}$$\n\n','**流式输出与公式排版完成。**'];
http.createServer((req,res)=>{
  if(req.url==='/v1/models'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:[{id:'fixture-math'},{id:'fixture-stream'},{id:'fixture-math'}]}));return;}
  if(req.url!=='/v1/chat/completions'){res.writeHead(404);res.end();return;}
  req.resume();req.on('end',()=>{res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});let i=0;const send=()=>{if(res.destroyed)return;if(i<chunks.length){res.write('data: '+JSON.stringify({choices:[{delta:{content:chunks[i++]}}]})+'\r\n\r\n');setTimeout(send,550);}else{res.end('data: [DONE]\n\n');}};setTimeout(send,100);});
}).listen(4891,'127.0.0.1',()=>console.log('Local model fixture listening on 127.0.0.1:4891'));
