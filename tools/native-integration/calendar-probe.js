(async()=>{
 const invoke=(method,args={})=>window.__TAURI_INTERNALS__.invoke('native_call',{method,args});
 const saved=await invoke('loadSettings');if(saved.accounts.length||saved.currentId)throw Error('Empty emulator required');
 const accountId='test-calendar-only',now=Date.now();
 try{
   await invoke('saveSettings',{settings:{currentId:accountId,accounts:[{accountId,token:'',cookie:'',modelKey:'',modelUrl:'',modelName:''}]}});
   await invoke('syncCalendar',{accountId,enabled:true,events:[{id:'test-event',title:'测试日程',startAt:now+15*60000+2000,endAt:now+16*60000,location:'测试教室',course:'测试课程',allDay:false}]});
   await new Promise(resolve=>setTimeout(resolve,16000));
   return {scheduled:true,accountFixture:true};
 }finally{await invoke('clearAccount',{accountId});await invoke('saveSettings',{settings:saved});}
})()
