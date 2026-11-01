export interface WaterHandle {setFill(value:number):void;impulse(value:number):void;dispose():void}
export interface GravitySample {x:number;y:number;z:number;ax?:number;ay?:number;az?:number}
export const angleDelta=(target:number,current:number)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));
export function animateWater(host:HTMLElement,initial:number,fps:number,draw:(f:{fill:number;roll:number;pitch:number;shock:number;time:number;dt:number;reduced:boolean})=>void,_onSample?:(sample:GravitySample)=>void):WaterHandle {
  let fill=initial,target=initial,time=0,raf=0,last=0,next=0,visible=true,disposed=false,shock=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function frame(now:number){
    if(disposed||!visible||document.hidden)return;
    raf=requestAnimationFrame(frame);if(now<next)return;
    const dt=last?Math.min((now-last)/1000,.04):1/fps;last=now;next=now+1000/(reduced.matches?2:fps);
    fill+=(target-fill)*(1-Math.exp(-dt*4));time+=dt;shock*=Math.exp(-dt*3);
    draw({fill,roll:0,pitch:0,shock,time,dt,reduced:reduced.matches});
  }
  function resume(){cancelAnimationFrame(raf);last=next=0;if(!disposed&&visible&&!document.hidden)raf=requestAnimationFrame(frame);}
  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;resume();});observer.observe(host);
  document.addEventListener('visibilitychange',resume);reduced.addEventListener('change',resume);resume();
  return {setFill(value){if(Number.isFinite(value))target=Math.max(0,Math.min(1,value));},impulse(value){shock=Math.min(2,Math.abs(value));},dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',resume);reduced.removeEventListener('change',resume);}};
}
