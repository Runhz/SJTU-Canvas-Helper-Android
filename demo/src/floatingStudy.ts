export interface FloatingBox{x:number;y:number;width:number;height:number}
export function clampFloating(box:FloatingBox,width:number,height:number):FloatingBox{
  const w=Math.min(Math.max(Math.min(280,width-16),Number.isFinite(box.width)?box.width:380),Math.max(1,width-16));
  const h=Math.min(Math.max(Math.min(220,height-16),Number.isFinite(box.height)?box.height:320),Math.max(1,height-16));
  return{width:w,height:h,x:Math.max(8,Math.min(Number.isFinite(box.x)?box.x:8,width-w-8)),y:Math.max(8,Math.min(Number.isFinite(box.y)?box.y:8,height-h-8))};
}
