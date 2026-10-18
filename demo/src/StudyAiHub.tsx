import {createContext,useContext,useRef,useState,type ReactNode} from 'react';
import type {Course} from './domain';
import type {AiPayload} from './chatHistory';
import {StudyMaterialPanel} from './StudyMaterialPanel';
import {seedSources} from './studyAttachments';
type Open=(title:string,payload:AiPayload,onApi:(payload:AiPayload)=>void)=>void;
const Context=createContext<{open:Open;materials:Open}>({open:()=>{},materials:()=>{}});
export const useStudyAi=()=>useContext(Context);
export function StudyAiHub({scope,accountId,courses,loadFiles,children}:{scope:string;accountId?:string;courses:Course[];loadFiles:(course:Course,force?:boolean)=>Promise<unknown>;children:ReactNode}){
  const route=useRef<{title:string;payload:AiPayload;onApi:(payload:AiPayload)=>void}>({title:'学习助手',payload:{mode:'agent',args:{}},onApi:()=>{}});
  const [show,setShow]=useState(false);
  const handlers=useRef({open:((title,payload,onApi)=>{route.current={title,payload,onApi};onApi(payload);}) as Open,materials:((title,payload,onApi)=>{route.current={title,payload,onApi};setShow(true);}) as Open});
  return <Context.Provider value={handlers.current}>{children}{show&&<StudyMaterialPanel scope={scope} accountId={accountId} courses={courses} loadFiles={loadFiles} title={route.current.title} payload={route.current.payload} onClose={()=>setShow(false)} onDone={result=>{route.current.onApi(result.payload!);setShow(false);}}/>}</Context.Provider>;
}
