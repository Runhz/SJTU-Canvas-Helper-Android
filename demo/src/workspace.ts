import {decodePage,type Tab} from './pageMemory';
export type WorkspaceSide='left'|'right';
export interface WorkspaceState{enabled:boolean;left:Tab;right:Tab;active:WorkspaceSide}
export interface WorkspaceDevice{smallestWidthDp:number;landscape:boolean}
// Size the layout to the current app window, including Android system split-screen.
// Keep the device orientation separate so an open keyboard cannot enable phone split.
export function workspaceDisplay(width:number,height:number,device?:WorkspaceDevice){
  const tablet=width>=600;
  const tabletDevice=(device?.smallestWidthDp??Math.min(width,height))>=600;
  const landscape=device?.landscape??width>height;
  // 76px rail + 33px gutters + two phone panes of at least 325px.
  return{tablet,canSplit:width>=(tabletDevice?800:840)&&height>=360&&(tabletDevice||landscape)};
}
export const workspacePages:[Tab,string][]=[['dashboard','总览'],['courses','课程'],['recordings','录播'],['assistant','助手'],['downloads','下载'],['profile','我的']];
export function decodeWorkspace(value:unknown):WorkspaceState{const row=value as Partial<WorkspaceState>|null;return{enabled:row?.enabled===true,active:row?.active==='right'?'right':'left',left:workspacePages.some(([id])=>id===row?.left)?row!.left!:'dashboard',right:workspacePages.some(([id])=>id===row?.right)?row!.right!:'assistant'};}
export function shouldSplit(width:number,state:WorkspaceState,height=800,device?:WorkspaceDevice){return state.enabled&&workspaceDisplay(width,height,device).canSplit;}
export function toggleWorkspace(state:WorkspaceState):WorkspaceState{if(state.enabled)return{...state,enabled:false};const other=state.active==='left'?'right':'left';return{...state,enabled:true,...(state.left===state.right?{[other]:state[state.active]==='assistant'?'recordings':'assistant'}:{})};}
export function navigateWorkspace(state:WorkspaceState,tab:Tab):WorkspaceState{return{...state,[state.active]:tab};}
export function initialWorkspace(scope:string):WorkspaceState{try{return{enabled:false,active:'left',left:decodePage(JSON.parse(localStorage.getItem(`canvas-page-v1:${scope}`)||'null')).tab,right:'assistant'};}catch{return{enabled:false,active:'left',left:'dashboard',right:'assistant'};}}

export function phoneRotation(state:WorkspaceState,device:WorkspaceDevice|undefined){return device&&device.smallestWidthDp<600&&!device.landscape&&state.enabled?{...state,enabled:false}:state;}
