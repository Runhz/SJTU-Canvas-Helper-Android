import {searchLibrary,type StudyHit} from './studyLibrary';
function execute<T>(message:Record<string,unknown>,signal:AbortSignal,fallback:()=>Promise<T>):Promise<T>{
  if(signal.aborted)return Promise.reject(Error('已取消'));
  if(typeof Worker==='undefined')return fallback();
  return new Promise<T>((resolve,reject)=>{
    let worker:Worker;try{worker=new Worker(new URL('./librarySearch.worker.ts',import.meta.url),{type:'module'})}catch{void fallback().then(resolve,reject);return}
    const cleanup=()=>{worker.terminate();signal.removeEventListener('abort',abort)};
    const abort=()=>{cleanup();reject(Error('已取消'))};signal.addEventListener('abort',abort,{once:true});
    worker.onmessage=event=>{cleanup();event.data.error?reject(Error(event.data.error)):resolve(event.data.result)};
    worker.onerror=()=>{cleanup();if(signal.aborted)reject(Error('已取消'));else void fallback().then(resolve,reject)};
    try{worker.postMessage(message)}catch{cleanup();void fallback().then(resolve,reject)}
  });
}
export const searchOffThread=(scope:string,query:string,signal:AbortSignal)=>execute<StudyHit[]>({scope,query},signal,()=>searchLibrary(scope,query,signal));
