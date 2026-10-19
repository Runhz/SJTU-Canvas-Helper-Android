import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import type {Course} from './domain';
import type {AiPayload} from './chatHistory';
import {StudyMaterialPanel} from './StudyMaterialPanel';
type Open=(title:string,payload:AiPayload,onApi:(payload:AiPayload)=>void)=>void;
const Context=createContext<{open:Open;materials:Open}>({open:()=>{},materials:()=>{}});
export const useStudyAi=()=>useContext(Context);
export function StudyAiHub({scope,accountId,courses,loadFiles,children}:{scope:string;accountId?:string;courses:Course[];loadFiles:(course:Course,force?:boolean)=>Promise<unknown>;children:ReactNode}){
  type Selection={id:number;scope:string;title:string;payload:AiPayload;onApi:(payload:AiPayload)=>void};
  const active=useRef<Selection>(),sequence=useRef(0),currentScope=useRef(scope);currentScope.current=scope;
  const [selection,setSelection]=useState<Selection>();
  const handlers=useRef({open:((_title,payload,onApi)=>{onApi(payload);}) as Open,materials:((title,payload,onApi)=>{const next={id:++sequence.current,scope:currentScope.current,title,payload,onApi};active.current=next;setSelection(next);}) as Open});
  useEffect(()=>()=>{active.current=undefined},[scope]);
  const close=(request:Selection)=>{if(active.current!==request)return false;active.current=undefined;setSelection(undefined);return true};
  return <Context.Provider value={handlers.current}>{children}{selection?.scope===scope&&<StudyMaterialPanel key={selection.id} scope={scope} accountId={accountId} courses={courses} loadFiles={loadFiles} title={selection.title} payload={selection.payload} onClose={()=>close(selection)} onDone={result=>{if(currentScope.current===selection.scope&&close(selection)&&result.payload)selection.onApi(result.payload);}}/>}</Context.Provider>;
}
