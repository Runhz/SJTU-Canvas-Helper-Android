import { NATIVE, native } from './runtime';

export interface WaterHandle { setFill(value:number):void; impulse(value:number):void; dispose():void }
export interface WaterFrame { fill:number; roll:number; pitch:number; shock:number; time:number; dt:number; reduced:boolean }
export interface GravitySample { x:number; y:number; z:number; ax?:number; ay?:number; az?:number }
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
export const angleDelta=(target:number,current:number)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));
/** Sensor coordinates: right, screen top, out of the screen. No tilt clamp: inverted devices stay inverted. */
export function gravityAngles({x,y,z}:GravitySample){
  if(![x,y,z].every(Number.isFinite)||Math.hypot(x,y,z)<.2)return null;
  return {roll:-Math.atan2(x,y),pitch:Math.atan2(z,Math.hypot(x,y))};
}
export function orientationGravity(beta:number,gamma:number):GravitySample {
  const b=beta*Math.PI/180,g=gamma*Math.PI/180;
  return {x:-Math.sin(g)*9.81,y:Math.sin(b)*Math.cos(g)*9.81,z:Math.cos(b)*Math.cos(g)*9.81};
}
export class WaterDynamics {
  fill:number; targetFill:number; roll=0; pitch=0; rollVelocity=0; pitchVelocity=0; shock=0; time=0;
  private targetRoll=0; private targetPitch=0;
  constructor(fill:number){this.fill=this.targetFill=clamp(fill,0,1);}
  sample(sample:GravitySample){
    const angles=gravityAngles(sample);if(!angles)return;
    this.targetRoll=angles.roll;this.targetPitch=angles.pitch;
    const ax=clamp(sample.ax||0,-25,25),az=clamp(sample.az||0,-25,25),ay=clamp(sample.ay||0,-25,25);
    this.rollVelocity-=ax*.075;this.pitchVelocity+=az*.055;
    this.shock=Math.min(2.5,this.shock+Math.hypot(ax,ay,az)*.045);
  }
  touch(side:number){this.rollVelocity+=clamp(side,-.5,.5)*3;this.shock=Math.min(2.5,this.shock+.9);}
  step(dt:number,reduced=false):WaterFrame {
    dt=clamp(dt,0,.05);
    if(reduced){this.fill=this.targetFill;this.roll=this.pitch=this.shock=0;this.rollVelocity=this.pitchVelocity=0;}
    else {
      // Substeps keep the same spring response at 30, 45 and 60 fps.
      const steps=Math.max(1,Math.ceil(dt/.008)),h=dt/steps;
      for(let i=0;i<steps;i++){
        this.rollVelocity+=(angleDelta(this.targetRoll,this.roll)*100-this.rollVelocity*11)*h;
        this.pitchVelocity+=((this.targetPitch-this.pitch)*100-this.pitchVelocity*11)*h;
        this.roll+=clamp(this.rollVelocity,-16,16)*h;this.pitch+=clamp(this.pitchVelocity,-12,12)*h;
      }
      this.shock*=Math.exp(-dt*2);this.fill+=(this.targetFill-this.fill)*(1-Math.exp(-dt*4));this.time+=dt;
    }
    return {fill:this.fill,roll:this.roll,pitch:this.pitch,shock:this.shock,time:this.time,dt,reduced};
  }
}

/** One sensor owner per visible tank; native samples arrive at 20 Hz and animation interpolates them. */
function observeMotion(onSample:(sample:GravitySample)=>void){
  let timer:ReturnType<typeof setInterval>|undefined,active=false,generation=0,polling=false;
  const orient=(e:DeviceOrientationEvent)=>{if(active&&!NATIVE&&e.beta!==null&&e.gamma!==null)onSample(orientationGravity(e.beta,e.gamma));};
  const motion=(e:DeviceMotionEvent)=>{
    if(!active||NATIVE)return;
    const g=e.accelerationIncludingGravity,a=e.acceleration;
    if(g?.x!==null&&g?.x!==undefined&&g.y!==null&&g.z!==null)onSample({x:g.x,y:g.y,z:g.z,ax:a?.x||0,ay:a?.y||0,az:a?.z||0});
  };
  window.addEventListener('deviceorientation',orient);window.addEventListener('devicemotion',motion);
  const setActive=(value:boolean)=>{
    if(value===active)return;active=value;generation++;clearInterval(timer);
    if(!NATIVE)return;
    const ticket=generation;
    if(!value){void native('stopMotion').catch(()=>{});return;}
    void native('startMotion').then(()=>{
      if(!active||ticket!==generation)return;
      const poll=()=>{if(polling)return;polling=true;void native<GravitySample&{available:boolean;timestamp:number}>('motionState').then(s=>{
        if(active&&ticket===generation&&s.available&&s.timestamp>0)onSample(s);
      }).catch(()=>{}).finally(()=>{polling=false;});};
      poll();timer=setInterval(poll,50);
    }).catch(()=>{});
  };
  return {setActive,dispose(){setActive(false);window.removeEventListener('deviceorientation',orient);window.removeEventListener('devicemotion',motion);}};
}

export function animateWater(host:HTMLElement,fill:number,fps:number,draw:(frame:WaterFrame)=>void,onSample?:(sample:GravitySample)=>void,onTouch?:(side:number)=>void):WaterHandle {
  const dynamics=new WaterDynamics(fill),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const motion=observeMotion(sample=>{dynamics.sample(sample);onSample?.(sample);});
  let visible=true,disposed=false,raf=0,last=0,next=0;
  const tick=(stamp:number)=>{
    if(disposed||!visible||document.hidden)return;raf=requestAnimationFrame(tick);
    if(stamp<next-.5)return;
    const rate=reduced.matches?1:fps;next=Math.max(next+1000/rate,stamp-1000/rate);
    const dt=last?Math.min(.05,(stamp-last)/1000):1/rate;last=stamp;
    draw(dynamics.step(dt,reduced.matches));
  };
  const resume=()=>{cancelAnimationFrame(raf);last=next=0;const active=visible&&!document.hidden&&!disposed;motion.setActive(active&&!reduced.matches);if(active)raf=requestAnimationFrame(tick);};
  const io=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;resume();});io.observe(host);
  document.addEventListener('visibilitychange',resume);
  if(reduced.addEventListener)reduced.addEventListener('change',resume);else reduced.addListener(resume);
  resume();
  return {setFill(value){dynamics.targetFill=clamp(value,0,1);},impulse(side){if(!reduced.matches){dynamics.touch(side);onTouch?.(side);}},dispose(){disposed=true;cancelAnimationFrame(raf);motion.dispose();io.disconnect();document.removeEventListener('visibilitychange',resume);if(reduced.removeEventListener)reduced.removeEventListener('change',resume);else reduced.removeListener(resume);}};
}
