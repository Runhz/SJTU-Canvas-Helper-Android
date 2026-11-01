import 'fake-indexeddb/auto';
import {beforeEach,describe,expect,it} from 'vitest';
import {listConversations,newConversation} from './chatHistory';
import {readWorkspaceRecord} from './workspaceStore';

beforeEach(()=>localStorage.clear());
describe('conversation workspace migration',()=>{
 it('migrates old IndexedDB conversations into the shared store',async()=>{
  const row=newConversation('legacy-indexeddb','旧库课堂',{mode:'materials',args:{resourceId:'canvas:legacy',text:'旧库正文'}});
  const request=indexedDB.open('canvas-chat-history',1),database=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('conversations',{keyPath:'id'});store.createIndex('scope','scope')}});
  await new Promise<void>((resolve,reject)=>{const tx=database.transaction('conversations','readwrite');tx.objectStore('conversations').put(row);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
  expect((await listConversations(row.scope)).map(item=>item.id)).toEqual([row.id]);
  expect(await readWorkspaceRecord(row.scope,'conversation',row.id)).toMatchObject({id:row.id,title:'旧库课堂'});
  database.close();
 });
});
