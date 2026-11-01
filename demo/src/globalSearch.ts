import type {Conversation} from './chatHistory';
import {matchSnippet,type StudyHit} from './studyLibrary';

/**
 * Search persisted conversations without opening a model request. The result
 * keeps the conversation id so the caller can restore the exact history.
 */
export function searchConversations(rows:Conversation[],query:string,limit=24):StudyHit[]{
  const value=query.trim();
  if(!value)return[];
  const hits:StudyHit[]=[];
  for(const row of rows){
    if(hits.length>=limit)break;
    const body=[row.title,...row.messages.filter(Boolean).map(message=>message.content)].join('\n');
    const snippet=matchSnippet(body,value);
    if(!snippet)continue;
    hits.push({id:`conversation:${row.id}`,conversationId:row.id,title:row.title,courseId:'',kind:'conversation',snippet,updatedAt:row.updatedAt});
  }
  return hits.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
}
