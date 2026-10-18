import type {AiPayload} from './chatHistory';
import {subtitleTime,type SubtitleLine} from './study';
export interface StudyTurn{id:string;messageIndex:number;payload:AiPayload;status:'open'|'understood'|'later';createdAt:number}
export interface StudySymbol{symbol:string;meaning:string;evidence:string;positionMs:number}
export interface AiPreset{id:string;label:string;prompt:string;favorite:boolean}
export const defaultPresets:AiPreset[]=[
  {id:'explain',label:'解释这一步',prompt:'请先用简短的话解释当前位置的关键一步，再说明必要的条件。',favorite:true},
  {id:'derive',label:'展开推导',prompt:'请逐步展开当前内容中省略的推导，说明每一步依据。',favorite:true},
  {id:'example',label:'举个例子',prompt:'请针对当前知识点举一个具体例子，并指出适用条件。',favorite:true},
  {id:'hint',label:'给我提示',prompt:'先给一个能让我继续思考的提示，不要一次讲完；等我回答后再继续。',favorite:false},
  {id:'check',label:'检查我的理解',prompt:'请根据我们刚才讨论的内容，给我一个很短的问题检查理解，等我回答后再解释。',favorite:false},
  {id:'prerequisite',label:'补前置知识',prompt:'请补充理解当前这一步必需的前置知识，再联系回本堂课。',favorite:false},
];
export function loadPresets(scope:string):AiPreset[]{try{const rows=JSON.parse(localStorage.getItem(`canvas-ai-presets-v1:${scope}`)||'null');if(Array.isArray(rows)){const valid=rows.filter(r=>typeof r.id==='string'&&typeof r.label==='string'&&r.label.trim()&&r.label.length<=40&&typeof r.prompt==='string'&&r.prompt.trim()&&r.prompt.length<=4000).map(r=>({id:r.id,label:r.label,prompt:r.prompt,favorite:r.favorite===true}));if(valid.length)return valid.slice(0,30)}}catch{}return defaultPresets.map(r=>({...r}))}
export function savePresets(scope:string,rows:AiPreset[]){localStorage.setItem(`canvas-ai-presets-v1:${scope}`,JSON.stringify(rows.slice(0,30)))}
export function nearbyLecture(lines:SubtitleLine[],positionMs:number){
  // Include complete preceding utterances, with a small backwards boundary allowance.
  const end=Math.max(0,positionMs),start=Math.max(0,end-150000);
  const selected=lines.filter(l=>l.bg<=end&&l.bg>=start);if(!selected.length){const last=lines.filter(l=>l.bg<=end).slice(-1);selected.push(...last)}
  return selected;
}
export function lecturePayload(title:string,resourceId:string,courseId:string,positionMs:number,lines:SubtitleLine[],screenshot?:string):AiPayload{
  const selected=nearbyLecture(lines,positionMs),points=[...new Set([...selected.map(l=>Math.floor(l.bg/1000)),Math.floor(Math.max(0,positionMs)/1000)])];
  return{mode:'materials',args:{title,resourceId,courseId,positionMs,positionLabel:subtitleTime(positionMs),studyAssist:true,contextLabel:selected.length?`${subtitleTime(selected[0].bg)}—${subtitleTime(positionMs)}`:'当前画面',text:selected.map(l=>`[${subtitleTime(l.bg)}](#video=${encodeURIComponent(resourceId)}&t=${Math.floor(l.bg/1000)}) ${l.res}`).join('\n'),timePoints:points,subtitleLines:selected,...(screenshot?{screenshot}:{})}};
}
const marker='<study_meta>';
export function visibleAnswer(raw:string){const at=raw.indexOf(marker);if(at>=0)return raw.slice(0,at).trimEnd();for(let n=marker.length-1;n>0;n--)if(raw.endsWith(marker.slice(0,n)))return raw.slice(0,-n).trimEnd();return raw;}
export function parseStudyAnswer(raw:string,payload:AiPayload){
  const answer=visibleAnswer(raw),at=raw.indexOf(marker);let questions:string[]=[],symbols:StudySymbol[]=[];
  if(at>=0)try{const end=raw.indexOf('</study_meta>',at);const meta=JSON.parse(raw.slice(at+marker.length,end>=0?end:undefined));
    if(Array.isArray(meta.questions))questions=Array.from(new Set<string>(meta.questions.filter((q:unknown)=>typeof q==='string'&&q.trim()&&q.length<=180))).slice(0,3);
    const source=String(payload.args.text||'');
    if(Array.isArray(meta.symbols))symbols=meta.symbols.filter((s:StudySymbol)=>typeof s.symbol==='string'&&s.symbol.length>0&&s.symbol.length<=60&&typeof s.meaning==='string'&&s.meaning.length<=400&&typeof s.evidence==='string'&&s.evidence.length>=4&&s.evidence.length<=300&&source.includes(s.evidence)).slice(0,12).map((s:StudySymbol)=>({...s,positionMs:Number(payload.args.positionMs)||0}));
  }catch{}
  return{answer,questions,symbols};
}
