import * as runtime from './runtime';
import {prepareSource,seedSources,type StudySource} from './studyAttachments';
import {reuseDocumentPayload,type AiPayload} from './chatHistory';

export interface ReadDocument {id:string;courseId:string;name:string;text:string;preparedId?:string;version?:string;images?:{page:number;image:string}[];pages?:number;coverage:string}
export function requestedPdfPages(question:string,total:number){
 const pages=new Set<number>();const pattern=/第?\s*(\d{1,5})(?:\s*[-—~～至到]\s*(\d{1,5}))?\s*页|page\s+(\d{1,5})/gi;
 for(const match of question.matchAll(pattern)){const start=Number(match[1]||match[3]),end=Number(match[2]||start);if(start<1||end<start||end>total)throw Error(`PDF 页码范围为 1—${total}`);if(end-start>=3)throw Error('每次最多查看 3 页图像，请分段提问');for(let page=start;page<=end;page++)pages.add(page);}
 if(pages.size>3)throw Error('每次最多查看 3 页图像，请分段提问');return [...pages];
}
/** Reuse the account's download once, then parse locally. Never send a path or URL to the model. */
export async function readStudyFile(source:StudySource,scope:string,accountId:string|undefined,signal:AbortSignal,progress:(text:string)=>void):Promise<ReadDocument>{
 const item=await prepareSource(source,scope,accountId,signal,progress);
 const name=item.name||source.name;
 const check=()=>{if(signal.aborted)throw Error('已取消读取资料')};check();
 progress(`正在读取 ${source.name}…`);
 const staged=await runtime.native<{path:string}>('studyStageForAi',{scope,id:item.id});check();
 const requestId=`document-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 const cancel=()=>{void runtime.cancelAi(requestId).catch(()=>{})};signal.addEventListener('abort',cancel,{once:true});
 let text='';
 try{text=(await runtime.readPreparedFile(staged.path,name,requestId,progress)).text;}
 catch(e){if(!String(e).includes('[NO_TEXT]')||!name.toLowerCase().endsWith('.pdf'))throw e;}
 finally{signal.removeEventListener('abort',cancel)}check();
 const result:ReadDocument={id:source.resourceId,courseId:source.courseId,name,text,preparedId:item.id,version:source.key,coverage:'已读取文字正文；未识别嵌入图片'};
 if(name.toLowerCase().endsWith('.pdf')){
  try{
  const info=await runtime.native<{pages:number}>('documentInfo',{scope,id:item.id});check();result.pages=info.pages;
  // Render a bounded preview, including diagrams/scanned pages, without loading a whole PDF into WebView.
  const count=text.trim()?1:3;
  const indices=Array.from({length:Math.min(count,info.pages)},(_,i)=>i);
  result.images=[];
  for(const page of indices){progress(`正在读取 ${source.name} · 第 ${page+1}/${info.pages} 页…`);const image=await runtime.native<{image:string}>('documentPage',{scope,id:item.id,page,width:1000});check();result.images.push({page:page+1,image:image.image});}
  result.coverage=`文字${text?'正文已提取':'层为空'}；已提供第 ${indices.map(i=>i+1).join('、')} 页图像，共 ${info.pages} 页${info.pages>indices.length?'。其余页面图像尚未读取':''}`;
  }catch(e){check();if(!text.trim())throw e;result.images=[];result.coverage='已读取 PDF 文字正文；页面图像无法渲染，本次不能依据图片作答';}
 }
 if(!text.trim()&&!result.images?.length)throw Error(`${source.name} 没有可读取的内容`);
 return result;
}
export async function readQuestionMaterials(payload:AiPayload,scope:string,signal:AbortSignal,progress:(text:string)=>void,question=''):Promise<AiPayload>{
 payload=reuseDocumentPayload(payload);
 const sources=seedSources(String(payload.args.title||payload.args.fileName||'课程资料'),payload).filter(s=>s.kind==='file');
 if(!sources.length||!runtime.NATIVE)return payload;
 if(sources.length>6)throw Error('每次最多读取 6 个文件，请分批提问');
 let accountId:string|undefined;try{accountId=JSON.parse(scope)[0]}catch{}
 const previous=(Array.isArray(payload.args.documents)?payload.args.documents:[]) as ReadDocument[],documents:ReadDocument[]=[];
 for(const source of sources){
  const old=previous.find(d=>d.id===source.resourceId&&d.courseId===source.courseId);
  if(old)progress('正在使用已读资料…');
  let doc=old||await readStudyFile(source,scope,accountId,signal,progress);
  if(doc.preparedId&&doc.pages){const explicit=requestedPdfPages(question,doc.pages);const retained=Array.isArray(payload.args.documentPages)?payload.args.documentPages.find(p=>p.id===doc.id&&p.courseId===doc.courseId)?.pages:[];const pages:number[]=explicit.length?explicit:(Array.isArray(retained)?retained:[]);if(pages.some(p=>p<1||p>doc.pages!))throw Error(`PDF 页码范围为 1—${doc.pages}`);if(pages.length&&(explicit.length>0||pages.length!==doc.images?.length||pages.some((p,i)=>p!==doc.images?.[i]?.page))){
    const images=[];for(const page of pages){if(signal.aborted)throw Error('已取消读取资料');progress(`正在读取 ${doc.name} · 第 ${page} 页…`);const cached=doc.images?.find(i=>i.page===page);images.push(cached||{page,image:(await runtime.native<{image:string}>('documentPage',{scope,id:doc.preparedId,page:page-1,width:1000})).image});}
    doc={...doc,images,coverage:`文字${doc.text?'正文已提取':'层为空'}；本次图像为第 ${pages.join('、')} 页，共 ${doc.pages} 页，其余页图像未提供`};
  }}
  if(signal.aborted)throw Error('已取消读取资料');documents.push(doc);
 }
 if(documents.reduce((n,d)=>n+d.text.length,0)>2_000_000)throw Error('所选文件正文过多，请按章节或减少文件后提问');
 return{mode:payload.mode,args:{...payload.args,documents,documentPages:documents.filter(d=>d.images?.length).map(d=>({id:d.id,courseId:d.courseId,pages:d.images!.map(i=>i.page)}))}};
}
