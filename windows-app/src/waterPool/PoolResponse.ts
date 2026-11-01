const clamp=(value:number,max:number)=>Math.max(-max,Math.min(max,value));
export function poolDragStrength(distance:number,width:number){return Number.isFinite(distance)&&Number.isFinite(width)&&distance>0&&width>0?Math.min(.055,.018+distance/width*.8):0}
/** A bounded damped slosh mode adds broad recoil beneath the local GPU ripples. */
export class PoolResponse {
  x=0;z=0;private vx=0;private vz=0;
  kick(x:number,z:number,strength:number){if(![x,z,strength].every(Number.isFinite))return;this.vx=clamp(this.vx+x*strength*5,3);this.vz=clamp(this.vz+z*strength*5,3)}
  step(dt:number,reduced=false){if(reduced){this.x=this.z=this.vx=this.vz=0;return}if(!Number.isFinite(dt)||dt<=0)return;const seconds=Math.min(dt,.05),steps=Math.ceil(seconds/.008),h=seconds/steps;for(let i=0;i<steps;i++){this.vx+=(-38*this.x-4.4*this.vx)*h;this.vz+=(-38*this.z-4.4*this.vz)*h;this.x=clamp(this.x+this.vx*h,.22);this.z=clamp(this.z+this.vz*h,.22)}}
}
