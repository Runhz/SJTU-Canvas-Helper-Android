import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {deleteWorkspaceRecords,deleteWorkspaceRecordsForScopePrefixes,deleteWorkspaceSnapshot,readWorkspaceRecord,readWorkspaceSnapshot,writeWorkspaceRecord,writeWorkspaceSnapshot} from './workspaceStore';

beforeEach(async()=>{localStorage.clear();await new Promise<void>(resolve=>{const request=indexedDB.deleteDatabase('canvas-workspace-store');request.onsuccess=request.onerror=request.onblocked=()=>resolve()})});
afterEach(()=>localStorage.clear());

describe('workspace store',()=>{
  it('persists a versioned account snapshot and reads it back',async()=>{
    const value={version:1,assignments:[{id:'a1'}]};await writeWorkspaceSnapshot('student:one',value);expect(await readWorkspaceSnapshot('student:one')).toEqual(value);
  });
  it('migrates an existing legacy key on first read',async()=>{
    const value={version:1,assignments:[{id:'old'}]};localStorage.setItem('canvas-ui-v2:student:one',JSON.stringify(value));expect(await readWorkspaceSnapshot('student:one','canvas-ui-v2:student:one')).toEqual(value);await writeWorkspaceSnapshot('student:one',value);expect(await readWorkspaceSnapshot('student:one')).toEqual(value);
  });
  it('deletes the account snapshot without affecting another account',async()=>{
    await writeWorkspaceSnapshot('student:one',{value:1});await writeWorkspaceSnapshot('student:two',{value:2});await deleteWorkspaceSnapshot('student:one');expect(await readWorkspaceSnapshot('student:one')).toBeUndefined();expect(await readWorkspaceSnapshot('student:two')).toEqual({value:2});
  });
  it('prefers a newer fallback after an earlier IndexedDB write failed',async()=>{
    await writeWorkspaceSnapshot('student:one',{value:'old'});
    localStorage.setItem('canvas-workspace-v1:student:one',JSON.stringify({version:1,scope:'student:one',updatedAt:Date.now()+10000,payload:{value:'new'}}));
    expect(await readWorkspaceSnapshot('student:one')).toEqual({value:'new'});
  });
  it('clears records by account and kind without deleting unrelated data',async()=>{
    await writeWorkspaceRecord('student:one','documentEvidence','a',{value:1});
    await writeWorkspaceRecord('student:one','other','b',{value:2});
    await writeWorkspaceRecord('student:two','documentEvidence','c',{value:3});
    await deleteWorkspaceRecords('student:one','documentEvidence');
    expect(await readWorkspaceRecord('student:one','documentEvidence','a')).toBeUndefined();
    expect(await readWorkspaceRecord('student:one','other','b')).toEqual({value:2});
    expect(await readWorkspaceRecord('student:two','documentEvidence','c')).toEqual({value:3});
  });
  it('waits for a queued write before reopening the snapshot',async()=>{
    const pending=writeWorkspaceSnapshot('student:pending',{value:'latest'});
    expect(await readWorkspaceSnapshot('student:pending')).toEqual({value:'latest'});
    await pending;
  });
  it('persists UI records and waits for a queued record write before reading',async()=>{
    const pending=writeWorkspaceRecord('ui:account-a','uiState','page',{tab:'recordings'});
    expect(await readWorkspaceRecord('ui:account-a','uiState','page')).toEqual({tab:'recordings'});
    await pending;
  });
  it('falls back to account-scoped local records when IndexedDB is unavailable',async()=>{
    const available=indexedDB;vi.stubGlobal('indexedDB',undefined);
    try{
      await writeWorkspaceRecord('ui:one','uiState','page',{tab:'courses'});
      await writeWorkspaceRecord('ui:two','uiState','page',{tab:'recordings'});
      expect(await readWorkspaceRecord('ui:one','uiState','page')).toEqual({tab:'courses'});
      await deleteWorkspaceRecords('ui:one','uiState');
      expect(await readWorkspaceRecord('ui:one','uiState','page')).toBeUndefined();
      expect(await readWorkspaceRecord('ui:two','uiState','page')).toEqual({tab:'recordings'});
    }finally{vi.stubGlobal('indexedDB',available);vi.unstubAllGlobals();}
  });
  it('deletes UI records in account-prefixed subscopes only',async()=>{
    await writeWorkspaceRecord('canvas-lecture-v1:account-a:right','uiState','value',{recording:'old'});
    await writeWorkspaceRecord('canvas-chat-window-v2:account-a:dock','uiState','value',{width:440});
    await writeWorkspaceRecord('canvas-lecture-v1:account-b:right','uiState','value',{recording:'other'});
    await deleteWorkspaceRecordsForScopePrefixes(['canvas-lecture-v1:account-a','canvas-chat-window-v2:account-a:'],'uiState');
    expect(await readWorkspaceRecord('canvas-lecture-v1:account-a:right','uiState','value')).toBeUndefined();
    expect(await readWorkspaceRecord('canvas-chat-window-v2:account-a:dock','uiState','value')).toBeUndefined();
    expect(await readWorkspaceRecord('canvas-lecture-v1:account-b:right','uiState','value')).toEqual({recording:'other'});
  });
});
