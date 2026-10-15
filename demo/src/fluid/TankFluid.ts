import { FlipFluid } from './FlipFluid';
import type { GravitySample } from '../waterMotion';
import { waterPresets, type WaterQuality } from '../waterQuality';

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const STEP=1/120;
/** FLIP free-surface simulation. Coordinates are in a fixed, two-metre square. */
export class TankFluid extends FlipFluid {
  readonly radius=.88;
  private pressure:number;
  private fill=-1;
  private gx=0; private gy=-9.81;
  private ax=0; private ay=0;
  private accumulator=0;
  private seed: number[]=[];

  constructor(quality:WaterQuality,fill:number){
    const config=waterPresets[quality],h=2/config.resolution,r=.3*h;
    super(1000,2,2,h,r,Math.ceil(Math.PI*.9*.9/(2*r*r*Math.sqrt(3))));
    this.pressure=config.pressure;
    for(let i=0;i<this.fNumX;i++)for(let j=0;j<this.fNumY;j++){
      this.s[i*this.fNumY+j]=Math.hypot((i+.5)*this.h-1,(j+.5)*this.h-1)<this.radius?1:0;
    }
    const dx=r*2,dy=dx*Math.sqrt(3)/2,limit=this.radius-r;
    for(let row=0,y=1-limit;y<=1+limit;y+=dy,row++)for(let x=1-limit+(row%2)*r;x<=1+limit;x+=dx){
      if(Math.hypot(x-1,y-1)<=limit)this.seed.push(x,y);
    }
    this.setFill(fill);
    // Establish rest density before the first acceleration sample.
    this.transferVelocities(true,.94);this.updateParticleDensity();
  }

  setFill(value:number){
    value=clamp(Number.isFinite(value)?value:0,0,1);
    if(Math.abs(value-this.fill)<.0001)return;
    const old=this.numParticles;
    const count=Math.round(this.seed.length/2*value);
    // Keep existing moving particles; add/remove only the difference when a submission changes.
    if(this.fill<0){
      this.particlePos.set(this.seed.slice(0,count*2));
    }else if(count>old){
      for(let n=old;n<count;n++){
        const i=(n*2)%this.seed.length;
        this.particlePos[n*2]=this.seed[i];this.particlePos[n*2+1]=this.seed[i+1];
        this.particleVel[n*2]=this.particleVel[n*2+1]=0;
      }
    }
    this.numParticles=count;this.fill=value;
    if(!count){this.particleRestDensity=0;this.particleVel.fill(0);this.u.fill(0);this.v.fill(0);}
  }

  sample(s:GravitySample){
    if(![s.x,s.y,s.z].every(Number.isFinite))return;
    // Keep screen-plane gravity magnitude: a flat phone does not invent sideways gravity.
    this.gx=clamp(-s.x,-12,12);this.gy=clamp(-s.y,-12,12);
    this.ax=clamp(-(s.ax||0)*1.35,-35,35);
    this.ay=clamp(-(s.ay||0)*1.35,-35,35);
    // Motion perpendicular to the screen creates a radial impulse in this 2D projection.
    if(Math.abs(s.az||0)>3)this.kick(s.az||0,Math.min(.3,Math.abs(s.az||0)/65));
  }

  kick(side:number,strength=1){
    const direction=side<0?-1:1;
    for(let i=0;i<this.numParticles;i++){
      const x=this.particlePos[i*2]-1,y=this.particlePos[i*2+1]-1;
      // Nonuniform impulse drives a travelling wave, not rigid rotation of a water mesh.
      this.particleVel[i*2]+=strength*direction*(.8+.8*(y+this.radius));
      this.particleVel[i*2+1]+=strength*(direction*x*2.7+.35);
    }
  }

  advance(dt:number){
    this.accumulator+=clamp(dt,0,.05);
    while(this.accumulator>=STEP){
      this.accumulator-=STEP;
      if(this.numParticles){
        this.simulate(STEP,this.gx+this.ax,this.gy+this.ay,.94,this.pressure,2,1.8,true,true,Math.exp(-STEP*.32));
        this.handleParticleCollisions();
        // CFL safety for sudden sensor spikes; bound travel to less than one grid cell.
        const maxSpeed=this.h/STEP*.65;
        for(let i=0;i<this.numParticles;i++){
          const vx=this.particleVel[2*i],vy=this.particleVel[2*i+1],speed=Math.hypot(vx,vy);
          if(speed>maxSpeed){this.particleVel[2*i]*=maxSpeed/speed;this.particleVel[2*i+1]*=maxSpeed/speed;}
        }
      }
      this.ax*=Math.exp(-STEP*18);this.ay*=Math.exp(-STEP*18);
    }
  }

  override handleParticleCollisions(){
    const max=this.radius-this.particleRadius;
    for(let i=0;i<this.numParticles;i++){
      const p=i*2,x=this.particlePos[p]-1,y=this.particlePos[p+1]-1,d=Math.hypot(x,y);
      if(d<=max)continue;
      const nx=x/d,ny=y/d;
      this.particlePos[p]=1+nx*max;this.particlePos[p+1]=1+ny*max;
      const normal=this.particleVel[p]*nx+this.particleVel[p+1]*ny;
      // Slip tangentially along glass; avoid the sticky wall/clumping of a high-viscosity fluid.
      if(normal>0){this.particleVel[p]-=normal*nx*1.05;this.particleVel[p+1]-=normal*ny*1.05;}
    }
  }
}
