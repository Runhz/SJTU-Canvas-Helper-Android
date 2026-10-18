import {searchLibrary} from './studyLibrary';
self.onmessage=async(event:MessageEvent)=>{
  const {scope,query}=event.data;
  try{self.postMessage({result:await searchLibrary(scope,query,new AbortController().signal)})}
  catch{self.postMessage({error:'本地资料读取失败，请重试'})}
};
