export interface WorkspaceEnvelope<T=unknown>{version:1;scope:string;updatedAt:number;payload:T}

const DB_NAME='canvas-workspace-store';
const DB_VERSION=2;
const STORE='snapshots';
const RECORDS='records';
let database:Promise<IDBDatabase>|undefined;
let writes:Promise<void>=Promise.resolve();

function fallbackKey(scope:string){return `canvas-workspace-v1:${scope}`}
function recordFallbackKey(scope:string,kind:string,id:string){return `canvas-workspace-record-v1:${recordKey(scope,kind,id)}`}
function hasIndexedDb(){return typeof indexedDB!=='undefined'}
function localRead(key:string){try{return typeof localStorage==='undefined'?null:localStorage.getItem(key)}catch{return null}}
function localWrite(key:string,value:string){try{if(typeof localStorage!=='undefined')localStorage.setItem(key,value)}catch{/* Storage quota or access failure. */}}
function localRemove(key:string){try{if(typeof localStorage!=='undefined')localStorage.removeItem(key)}catch{/* Storage may be unavailable. */}}
function open(){
  if(!hasIndexedDb())return Promise.reject<IDBDatabase>(Error('IndexedDB unavailable'));
  if(!database)database=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'scope'});if(!request.result.objectStoreNames.contains(RECORDS)){const store=request.result.createObjectStore(RECORDS,{keyPath:'key'});store.createIndex('scopeKind',['scope','kind']);}};
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=undefined};resolve(request.result)};
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('工作区数据正在被其他窗口使用，请关闭其他窗口后重试'));
  }).catch(error=>{database=undefined;throw error});
  return database;
}
function parse<T>(value:string|null):T|undefined{if(!value)return undefined;try{return JSON.parse(value) as T}catch{return undefined}}

export async function readWorkspaceSnapshot<T>(scope:string,legacyKey?:string):Promise<T|undefined>{
  // A screen may reopen before its last queued write has reached IndexedDB.
  await writes.catch(()=>{});
  let stored:WorkspaceEnvelope<T>|undefined;
  if(hasIndexedDb()){
    try{
      const db=await open();
      stored=await new Promise<WorkspaceEnvelope<T>|undefined>((resolve,reject)=>{const request=db.transaction(STORE).objectStore(STORE).get(scope);request.onsuccess=()=>resolve(request.result as WorkspaceEnvelope<T>|undefined);request.onerror=()=>reject(request.error)});
    }catch{/* Fall through to the local fallback. */}
  }
  const fallback=parse<WorkspaceEnvelope<T>>(localRead(fallbackKey(scope)));
  const valid=(row:WorkspaceEnvelope<T>|undefined)=>row?.version===1&&row.scope===scope&&Number.isFinite(row.updatedAt);
  if(valid(fallback)&&(!valid(stored)||fallback!.updatedAt>stored!.updatedAt))return fallback!.payload;
  if(valid(stored))return stored!.payload;
  if(valid(fallback))return fallback!.payload;
  // The caller writes after hydration; migrating here could overwrite a concurrent update.
  return parse<T>(legacyKey?localRead(legacyKey):null);
}

export function writeWorkspaceSnapshot<T>(scope:string,payload:T):Promise<void>{
  const row:WorkspaceEnvelope<T>={version:1,scope,updatedAt:Date.now(),payload};
  writes=writes.catch(()=>{}).then(async()=>{
    if(hasIndexedDb()){
      try{const db=await open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(row);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});localRemove(fallbackKey(scope));return}catch{/* Use the local fallback below. */}
    }
    localWrite(fallbackKey(scope),JSON.stringify(row));
  });
  return writes;
}

export function deleteWorkspaceSnapshot(scope:string):Promise<void>{
  writes=writes.catch(()=>{}).then(async()=>{
    if(hasIndexedDb())try{const db=await open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(scope);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}catch{/* Continue with local cleanup. */}
    localRemove(fallbackKey(scope));
  });
  return writes;
}

interface WorkspaceRecord<T=unknown>{key:string;scope:string;kind:string;id:string;updatedAt:number;value:T}
function recordKey(scope:string,kind:string,id:string){return JSON.stringify([scope,kind,id])}
export interface WorkspaceRecordValue<T=unknown>{id:string;updatedAt:number;value:T}
export async function readWorkspaceRecord<T>(scope:string,kind:string,id:string):Promise<T|undefined>{
  await writes.catch(()=>{});
  let stored:WorkspaceRecord<T>|undefined;
  if(hasIndexedDb())try{const db=await open();stored=await new Promise<WorkspaceRecord<T>|undefined>((resolve,reject)=>{const request=db.transaction(RECORDS).objectStore(RECORDS).get(recordKey(scope,kind,id));request.onsuccess=()=>resolve(request.result as WorkspaceRecord<T>|undefined);request.onerror=()=>reject(request.error)})}catch{/* Use the local fallback. */}
  const fallback=parse<WorkspaceRecord<T>>(localRead(recordFallbackKey(scope,kind,id)));
  const valid=(row:WorkspaceRecord<T>|undefined)=>row?.scope===scope&&row.kind===kind&&row.id===id&&Number.isFinite(row.updatedAt);
  if(valid(fallback)&&(!valid(stored)||fallback!.updatedAt>stored!.updatedAt))return fallback!.value;
  if(valid(stored))return stored!.value;
  if(valid(fallback))return fallback!.value;
  return undefined;
}
const recordTimes=new Map<string,number>();
export function writeWorkspaceRecord<T>(scope:string,kind:string,id:string,value:T):Promise<void>{
  const key=recordKey(scope,kind,id),updatedAt=Math.max(Date.now(),(recordTimes.get(key)||0)+1);recordTimes.set(key,updatedAt);
  const row:WorkspaceRecord<T>={key,scope,kind,id,updatedAt,value};
  writes=writes.catch(()=>{}).then(async()=>{
    if(hasIndexedDb())try{const db=await open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(RECORDS,'readwrite');tx.objectStore(RECORDS).put(row);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});localRemove(recordFallbackKey(scope,kind,id));return}catch{/* Use the local fallback. */}
    localWrite(recordFallbackKey(scope,kind,id),JSON.stringify(row));
  });return writes;
}

export async function listWorkspaceRecords<T>(scope:string,kind:string):Promise<WorkspaceRecordValue<T>[]> {
  await writes.catch(()=>{});
  const rows=new Map<string,WorkspaceRecord<T>>();
  if(hasIndexedDb())try{const db=await open();const stored=await new Promise<WorkspaceRecord<T>[]>((resolve,reject)=>{const request=db.transaction(RECORDS).objectStore(RECORDS).index('scopeKind').getAll(IDBKeyRange.only([scope,kind]));request.onsuccess=()=>resolve(request.result as WorkspaceRecord<T>[]);request.onerror=()=>reject(request.error)});for(const row of stored)rows.set(row.id,row);}catch{/* Merge local fallback records below. */}
  const prefix='canvas-workspace-record-v1:';
  if(typeof localStorage!=='undefined')for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index);if(!key?.startsWith(prefix))continue;const row=parse<WorkspaceRecord<T>>(localRead(key));if(row?.scope!==scope||row.kind!==kind)continue;const old=rows.get(row.id);if(!old||row.updatedAt>old.updatedAt)rows.set(row.id,row)}
  return [...rows.values()].sort((a,b)=>b.updatedAt-a.updatedAt).map(row=>({id:row.id,updatedAt:row.updatedAt,value:row.value}));
}

export function deleteWorkspaceRecord(scope:string,kind:string,id:string):Promise<void>{
  writes=writes.catch(()=>{}).then(async()=>{
    if(hasIndexedDb())try{const db=await open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(RECORDS,'readwrite');tx.objectStore(RECORDS).delete(recordKey(scope,kind,id));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}catch{/* Continue with local cleanup. */}
    localRemove(recordFallbackKey(scope,kind,id));
  });return writes;
}

export function deleteWorkspaceRecords(scope:string,kind:string):Promise<void>{
  writes=writes.catch(()=>{}).then(async()=>{
    if(hasIndexedDb())try{
      const db=await open();
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction(RECORDS,'readwrite'),store=tx.objectStore(RECORDS);
        const request=store.index('scopeKind').openKeyCursor(IDBKeyRange.only([scope,kind]));
        request.onsuccess=()=>{const cursor=request.result;if(cursor){store.delete(cursor.primaryKey);cursor.continue()}};
        tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });
    }catch{/* Still remove local fallback copies. */}
    const prefix='canvas-workspace-record-v1:';
    if(typeof localStorage!=='undefined')for(let index=localStorage.length-1;index>=0;index--){
      const key=localStorage.key(index);if(!key?.startsWith(prefix))continue;
      const row=parse<WorkspaceRecord>(localRead(key));if(row?.scope===scope&&row.kind===kind)localRemove(key);
    }
  });return writes;
}

export function deleteWorkspaceRecordsForScopePrefixes(prefixes:string[],kind:string):Promise<void>{
  if(!prefixes.length)return Promise.resolve();
  writes=writes.catch(()=>{}).then(async()=>{
    const matches=(scope:string)=>prefixes.some(prefix=>scope===prefix||scope.startsWith(prefix.endsWith(':')?prefix:prefix+':'));
    if(hasIndexedDb())try{
      const db=await open();
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction(RECORDS,'readwrite'),store=tx.objectStore(RECORDS),request=store.openCursor();
        request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const row=cursor.value as WorkspaceRecord;if(row.kind===kind&&matches(row.scope))store.delete(cursor.primaryKey);cursor.continue()};
        tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });
    }catch{/* Local fallback cleanup still applies. */}
    const prefix='canvas-workspace-record-v1:';
    if(typeof localStorage!=='undefined')for(let index=localStorage.length-1;index>=0;index--){const key=localStorage.key(index);if(!key?.startsWith(prefix))continue;const row=parse<WorkspaceRecord>(localRead(key));if(row?.kind===kind&&matches(row.scope))localRemove(key)}
  });return writes;
}
