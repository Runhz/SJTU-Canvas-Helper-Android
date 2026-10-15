(async()=>{
 const invoke=(method,args={})=>window.__TAURI_INTERNALS__.invoke('native_call',{method,args});
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const find=label=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===label);
 const until=Date.now()+8000;while(!find('我的')&&Date.now()<until)await wait(50);
 const saved=await invoke('loadSettings');if(saved.accounts.length||saved.currentId)throw Error('Probe requires empty emulator account');
 const result={native:true,realAccounts:0,overflow:document.documentElement.scrollWidth>innerWidth,nav:document.querySelectorAll('.bottom-nav button').length,webglFallback:!!document.querySelector('.water-tank-fallback')};
 find('我的').click();await wait(100);
 const eco=Array.from(document.querySelectorAll('button')).find(button=>button.textContent.startsWith('省电'));
 eco.click();await wait(100);result.quality=localStorage.getItem('canvas-water-quality');
 const high=Array.from(document.querySelectorAll('button')).find(button=>button.textContent.startsWith('高清'));high.click();await wait(100);
 find('总览').click();await wait(100);
 document.querySelector('[aria-label="学期筛选"]').click();await wait(100);result.customPicker=!!document.querySelector('[role="dialog"]')&&!document.querySelector('[role="dialog"]').closest('[aria-hidden="true"]');document.querySelector('[aria-label="关闭弹窗"]').click();
 result.sensor=await invoke('startMotion');await wait(100);result.motion=await invoke('motionState');await invoke('stopMotion');
 await invoke('saveSettings',{settings:{currentId:'test-native-only',accounts:[{accountId:'test-native-only',token:'',cookie:'',modelKey:'',modelName:'',modelUrl:''}]}});
 try{
   const rect={left:20,top:90,width:innerWidth-40,height:(innerWidth-40)*9/16,viewportWidth:innerWidth,clipTop:90,clipBottom:90+(innerWidth-40)*9/16};
   const track={url:'https://storage.googleapis.com/exoplayer-test-media-1/mp4/android-screens-10s.mp4',headers:{}};
   await invoke('embedPlayer',{tracks:[track,track],title:'Media3 public test sample',resourceId:'test-public-sample',rect});
   let status;for(let i=0;i<14;i++){await wait(600);status=await invoke('playerStatus');if(status.playing&&status.state===3)break;}result.player=status;
   await invoke('playerControl',{action:'speed',resourceId:'test-public-sample',speed:1.5});
   await invoke('playerControl',{action:'seek',resourceId:'test-public-sample',positionMs:2000});await wait(400);
   result.control=await invoke('playerStatus');
   try{for(let i=0;i<8;i++){if((await invoke('playerStatus')).state===3)break;await wait(500);}const frame=await invoke('capturePlayer');result.capture={resourceId:frame.resourceId,positionMs:frame.positionMs,jpeg:frame.image?.startsWith('data:image/jpeg;base64,'),bytes:frame.image?.length};}catch(e){result.captureError=String(e);}
   await invoke('playerControl',{action:'dual',resourceId:'test-public-sample'});await wait(300);result.dual=await invoke('playerStatus');
 }finally{await invoke('playerControl',{action:'close',resourceId:'test-public-sample'});await invoke('clearAccount',{accountId:'test-native-only'});await invoke('saveSettings',{settings:saved});}
 result.finalAccounts=(await invoke('loadSettings')).accounts.length;return result;
})()
