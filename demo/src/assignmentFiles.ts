import type {CourseFile} from './domain';
export function assignmentFile(value:Record<string,any>,fallback='作业附件'):CourseFile|undefined{
  const id=Number(value.id);if(!Number.isSafeInteger(id)||id<=0)return;
  const name=String(value.display_name||value.filename||fallback),size=Number(value.size)||0;
  return{id:String(id),name,kind:name.split('.').pop()?.toUpperCase()||'FILE',size:value.size===undefined?'':size>=1048576?`${(size/1048576).toFixed(1)} MB`:`${Math.ceil(size/1024)} KB`,updated:'',raw:{id,size,updatedAt:value.updated_at,mime:value['content-type']||value.mime}};
}
export function requirementFiles(html:unknown,attachments:unknown=[]):CourseFile[]{
  const files=new Map<string,CourseFile>();
  if(Array.isArray(attachments))for(const raw of attachments){const file=assignmentFile(raw);if(file)files.set(file.id,file)}
  const doc=new DOMParser().parseFromString(typeof html==='string'?html:'','text/html');
  for(const el of doc.querySelectorAll('a[href],a[data-api-endpoint],img[data-api-endpoint]'))for(const name of ['data-api-endpoint','href']){
    try{const raw=el.getAttribute(name);if(!raw)continue;const url=new URL(raw,'https://oc.sjtu.edu.cn');if(url.origin!=='https://oc.sjtu.edu.cn')continue;
      const match=url.pathname.match(/^(?:\/api\/v1)?\/(?:courses\/\d+\/)?files\/(\d+)(?:\/|$)/);if(!match)continue;
      const id=match[1];if(!files.has(id)){const title=el.getAttribute('title')||el.textContent?.trim()||`作业附件 ${files.size+1}`;const file=assignmentFile({id,display_name:title});if(file)files.set(id,file)}
    }catch{}
  }return [...files.values()];
}
