import {it,expect} from 'vitest';
import {completionTransition} from './CompletionSummary';
import {createAssignments} from './domain';
it('celebrates only an actual final submission, never initial loading, filters, or empty lists',()=>{
  const before=createAssignments(Date.now()).map((a,i)=>({...a,submission:(i===0?'unsubmitted':'submitted') as 'unsubmitted'|'submitted'})),done=before.map(a=>({...a,submission:'submitted' as const}));
  expect(completionTransition(before,done)).toBe(true);expect(completionTransition(undefined,done)).toBe(false);expect(completionTransition([],[])).toBe(false);expect(completionTransition(done,done)).toBe(false);expect(completionTransition(before,done.slice(1))).toBe(false);expect(completionTransition(before,done.map((a,i)=>i===0?{...a,id:'another'}:a))).toBe(false);
});
