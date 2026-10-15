// Local integration fixture. Prompts, images and keys stay on this machine.
const http=require('node:http');
const stats=[];
http.createServer((req,res)=>{
  if(req.url==='/summary'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(stats));return;}
  if(req.url==='/v1/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'fixture-vision',context_length:32000,architecture:{input_modalities:['text','image']}},{id:'fixture-text',context_length:16000,architecture:{input_modalities:['text']}}]}));return;}
  if(req.url!=='/v1/chat/completions'){res.writeHead(404).end();return;}
  let data='';req.on('data',value=>{data+=value;if(data.length>4_000_000)req.destroy();});req.on('end',()=>{
    const body=JSON.parse(data),system=body.messages[0]?.content||'',content=body.messages.at(-1)?.content;
    const image=Array.isArray(content)?content.find(value=>value.type==='image_url')?.image_url?.url:'';
    stats.push({model:body.model,systemChars:system.length,hasImage:image?.startsWith('data:image/jpeg;base64,')||false,context:system.includes('课堂测试字幕'),stream:body.stream});
    if(system.length>12000){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'context_length_exceeded',message:'maximum context length exceeded'}}));return;}
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
    res.write('data: '+JSON.stringify({choices:[{delta:{content:'截图与字幕已收到。'}}]})+'\n\n');
    setTimeout(()=>res.end('data: '+JSON.stringify({choices:[{delta:{content:'\n\n$a^2+b^2=c^2$'}}]})+'\n\ndata: [DONE]\n\n'),400);
  });
}).listen(4892,'127.0.0.1',()=>console.log('Local fixture ready on 4892'));
