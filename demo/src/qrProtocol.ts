export const QR_REFRESH_MESSAGE=JSON.stringify({type:'UPDATE_QR_CODE'});
export type QrMessage={kind:'code';url:string}|{kind:'login'};
export function readQrMessage(raw:string,uuid:string):QrMessage|null{
  if(!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(uuid))return null;
  try{
    const value=JSON.parse(raw);
    if(typeof value.type!=='string')return null;
    if(value.type.toUpperCase()==='LOGIN')return {kind:'login'};
    if(value.type.toUpperCase()!=='UPDATE_QR_CODE')return null;
    const {ts,sig}=value.payload||{};
    if(!['string','number'].includes(typeof ts)||typeof sig!=='string'||!sig||sig.length>4096)return null;
    const params=new URLSearchParams({uuid,ts:String(ts),sig});
    return {kind:'code',url:`https://jaccount.sjtu.edu.cn/jaccount/confirmscancode?${params}`};
  }catch{return null;}
}
