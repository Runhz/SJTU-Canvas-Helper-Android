import type {StudySource} from './studyAttachments';
import type {ReadDocument} from './studyFileReader';
import {deleteWorkspaceRecords,readWorkspaceRecord,writeWorkspaceRecord} from './workspaceStore';

export const evidenceKey=(scope:string,source:Pick<StudySource,'resourceId'|'key'|'courseId'>)=>JSON.stringify([scope,source.courseId,source.resourceId,source.key]);

export async function readDocumentEvidence(scope:string,source:Pick<StudySource,'resourceId'|'key'|'courseId'>):Promise<ReadDocument|undefined>{
  return readWorkspaceRecord<ReadDocument>(scope,'documentEvidence',evidenceKey(scope,source));
}

/** Best-effort cache: a storage quota failure must never block a question. */
export async function writeDocumentEvidence(scope:string,source:Pick<StudySource,'resourceId'|'key'|'courseId'>,document:ReadDocument){
  await writeWorkspaceRecord(scope,'documentEvidence',evidenceKey(scope,source),document);
}

export async function clearDocumentEvidence(scope:string){
  await deleteWorkspaceRecords(scope,'documentEvidence');
}
