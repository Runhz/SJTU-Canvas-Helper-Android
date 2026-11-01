import {describe,expect,it} from 'vitest';
import {searchConversations} from './globalSearch';
import type {Conversation} from './chatHistory';

const row=(id:string,title:string,content:string,updatedAt:number):Conversation=>({id,scope:'student',source:'agent',title,payload:{mode:'agent',args:{}},messages:[{role:'user',content},{role:'assistant',content:'回答'}],draft:'',readMode:'relevant',createdAt:updatedAt-10,updatedAt,interrupted:false});

describe('global conversation search',()=>{
  it('matches title and message text while preserving recent-first order',()=>{
    const rows=[row('old','第一堂课','采样定理的基本概念',10),row('new','第二堂课','这里讨论采样定理的频率范围',20)];
    const hits=searchConversations(rows,'采样定理');
    expect(hits.map(hit=>hit.conversationId)).toEqual(['new','old']);
    expect(hits[0]).toMatchObject({kind:'conversation',title:'第二堂课',snippet:expect.stringContaining('采样定理')});
  });

  it('does not search an empty query or return unrelated conversations',()=>{
    const rows=[row('one','课堂提问','解释傅里叶变换',1)];
    expect(searchConversations(rows,'')).toEqual([]);
    expect(searchConversations(rows,'不存在')).toEqual([]);
  });
});
