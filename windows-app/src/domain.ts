export function currentTerm<T extends {id:number;start_at?:string;end_at?:string}>(terms:T[],now=Date.now()):number {
  const known=terms.filter(t=>t.id>0);
  const ordered=[...known].sort((a,b)=>(b.start_at||'').localeCompare(a.start_at||'')||b.id-a.id);
  const active=ordered.find(t=>(!t.start_at||Date.parse(t.start_at)<=now)&&(!t.end_at||Date.parse(t.end_at)>=now));
  return (active||ordered.find(t=>!!t.start_at&&Date.parse(t.start_at)<=now)||ordered[0])?.id||0;
}
export function playbackUrl(raw:string,port:number,source:string){
  const url=new URL(raw);
  if(url.hostname==='videos.sjtu.edu.cn'&&url.pathname.startsWith('/vod/'))return `http://localhost:${port}/${source==='legacy'?'legacy-vod':'canvas-vod'}/${url.pathname.slice(5)}${url.search}`;
  if(url.hostname==='live.sjtu.edu.cn')return `http://localhost:${port}${url.pathname.startsWith('/vod/')?'':'/canvas-live'}${url.pathname}${url.search}`;
  if(!['https:','http:'].includes(url.protocol))throw new Error('平台返回了不支持的播放地址');
  return raw;
}
export function cleanAnswer(text:string){return text.replace(/<study_meta>[\s\S]*?(?:<\/study_meta>|$)/g,'').trim();}
