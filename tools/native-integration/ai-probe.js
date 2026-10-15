(async()=>{
 const bridge=window.__TAURI_INTERNALS__,invoke=(method,args={})=>bridge.invoke('native_call',{method,args});
 const saved=await invoke('loadSettings');if(saved.accounts.length||saved.currentId)throw Error('Empty emulator required');
 const config={accountId:'test-ai-local',token:'test-local-only',cookie:'',modelKey:'test-local-only',modelUrl:'http://127.0.0.1:4892/v1',modelName:'fixture-vision'};
 const callbacks=[],result={};
 const channel=fn=>{const id=bridge.transformCallback(message=>{if(!('end' in message))fn(message.message)});callbacks.push(id);return '__CHANNEL__:'+id;};
 try{
   await bridge.invoke('restore_session',{config});
   const chunks=[],phases=[];let finished=false,firstBeforeEnd=false;
   result.capabilities=await bridge.invoke('model_capabilities',{url:config.modelUrl,key:config.modelKey,model:config.modelName});
   const answer=bridge.invoke('ai_chat',{mode:'materials',args:{title:'测试课堂',text:'课堂测试字幕：公式与推导。\n'.repeat(4000),screenshot:'data:image/jpeg;base64,/9j/2Q==',positionLabel:'00:02:00'},messages:[{role:'user',content:'解释当前画面的公式'}],onChunk:channel(text=>{if(!finished)firstBeforeEnd=true;chunks.push(text)}),onPhase:channel(text=>phases.push(text)),requestId:'test-local-050'});
   result.answer=await answer;finished=true;result.chunks=chunks.length;result.firstBeforeEnd=firstBeforeEnd;result.adapted=phases.includes('正在调整资料范围…');
   await bridge.invoke('restore_session',{config:{...config,modelName:'fixture-text'}});
   try{await bridge.invoke('ai_chat',{mode:'materials',args:{title:'测试课堂',text:'课堂测试字幕',screenshot:'data:image/jpeg;base64,/9j/2Q=='},messages:[{role:'user',content:'解释截图'}],onChunk:channel(()=>{}),onPhase:channel(()=>{}),requestId:'test-local-050-text'});}catch(error){result.textModelRejectedImage=String(error).includes('不支持图片');}
 }finally{callbacks.forEach(id=>bridge.unregisterCallback(id));await bridge.invoke('clear_session');await invoke('saveSettings',{settings:saved});}
 result.finalAccounts=(await invoke('loadSettings')).accounts.length;return result;
})()
