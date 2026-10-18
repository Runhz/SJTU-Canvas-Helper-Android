import {waterLevel} from './waterQuality';
import type {WaterFrame} from './waterMotion';
export function waterPose(frame:WaterFrame){
  const x=Math.sin(frame.roll)*Math.cos(frame.pitch),y=Math.cos(frame.roll)*Math.cos(frame.pitch),z=Math.sin(frame.pitch);
  return {normal:[x,y*.966-z*.259,y*.259+z*.966] as const,level:waterLevel(frame.fill)*.875,amplitude:Math.min(.075,.0015+frame.shock*.025)*Math.sin(Math.PI*Math.max(0,Math.min(1,frame.fill)))};
}
/** Exact water length along an orthographic ray through the filled spherical segment. */
export function waterDepth(x:number,y:number,normal:readonly number[],level:number){
  const square=.875**2-x*x-y*y;if(square<=0)return 0;const z=Math.sqrt(square),d=normal[0]*x+normal[1]*y-level;
  if(Math.abs(normal[2])<1e-7)return d<=0?2*z:0;
  const cut=Math.max(-z,Math.min(z,-d/normal[2]));return normal[2]>0?cut+z:z-cut;
}
