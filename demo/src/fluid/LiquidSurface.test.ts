import {describe,expect,it} from 'vitest';
import {LiquidSurface} from './LiquidSurface';
import {TankFluid} from './TankFluid';

function holes(surface:LiquidSurface,threshold=128){
  const n=surface.size,seen=new Uint8Array(n*n),queue:number[]=[];
  const water=(p:number)=>surface.pixels[p*4]>=threshold;
  for(let p=0;p<n*n;p++)if(!water(p)&&(p<n||p>=n*(n-1)||p%n===0||p%n===n-1)){seen[p]=1;queue.push(p);}
  for(let head=0;head<queue.length;head++){
    const p=queue[head],x=p%n;
    for(const at of [x>0?p-1:-1,x<n-1?p+1:-1,p>=n?p-n:-1,p<n*(n-1)?p+n:-1])if(at>=0&&!seen[at]&&!water(at)){seen[at]=1;queue.push(at);}
  }
  let count=0;for(let p=0;p<n*n;p++)if(!water(p)&&!seen[p])count++;
  return count;
}
function area(surface:LiquidSurface){return surface.mask.reduce((sum,v)=>sum+v,0)/(Math.PI*(surface.radius*surface.size/2)**2);}

describe('continuous liquid rendering',()=>{
  it('fills interior sampling gaps rather than lighting every particle boundary',()=>{
    const fluid=new TankFluid('high',.4),positions:number[]=[];
    for(let i=0;i<fluid.numParticles;i++){
      const x=fluid.particlePos[i*2],y=fluid.particlePos[i*2+1];
      if(Math.hypot(x-1,y-.55)>.09&&i%4!==0)positions.push(x,y);
    }
    const surface=new LiquidSurface(128);
    surface.update(new Float32Array(positions),positions.length/2,fluid.particleRadius,.4);
    expect(surface.sample(.5,.275)).toBeGreaterThan(.8);
    expect(holes(surface)).toBe(0);
    expect(Math.abs(area(surface)-.4)).toBeLessThan(.025);
  });
  it('renders a full tank as a continuous interior in every quality',()=>{
    for(const [quality,size]of [['eco',64],['balanced',96],['high',128]]as const){
      const fluid=new TankFluid(quality,1),surface=new LiquidSurface(size);
      surface.update(fluid.particlePos,fluid.numParticles,fluid.particleRadius,1);
      expect(holes(surface)).toBe(0);
      for(let y=.25;y<.8;y+=.05)for(let x=.25;x<.8;x+=.05)if(Math.hypot(x-.5,y-.5)<.3)expect(surface.sample(x,y)).toBeGreaterThan(.9);
    }
  });
  it('preserves the amount of water and avoids pinholes during repeated strong impulses',()=>{
    for(const [quality,size]of [['eco',64],['balanced',96],['high',128]]as const){
      const fluid=new TankFluid(quality,.4),surface=new LiquidSurface(size);
      for(let frame=0;frame<100;frame++){
        if(frame%25===0)fluid.kick(frame%50===0?1:-1,2);
        fluid.advance(1/60);surface.update(fluid.particlePos,fluid.numParticles,fluid.particleRadius,.4);
        if(frame%10===0){
          for(const threshold of [123,128,133])expect(holes(surface,threshold)).toBe(0);
          expect(Math.abs(area(surface)-.4)).toBeLessThan(.025);
        }
      }
    }
  });
  it('leaves no liquid in an empty tank',()=>{
    const surface=new LiquidSurface(64);surface.update(new Float32Array(),0,.02,0);
    expect(area(surface)).toBe(0);expect(surface.sample(.5,.5)).toBeLessThan(.1);
  });
});
