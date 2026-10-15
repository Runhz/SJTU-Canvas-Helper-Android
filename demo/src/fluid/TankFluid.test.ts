import { describe, expect, it } from 'vitest';
import { TankFluid } from './TankFluid';
const advance=(fluid:TankFluid,seconds:number,fps=60)=>{for(let i=0;i<seconds*fps;i++)fluid.advance(1/fps);};
const meanY=(fluid:TankFluid)=>{let y=0;for(let i=0;i<fluid.numParticles;i++)y+=fluid.particlePos[2*i+1]-1;return y/fluid.numParticles;};
const energy=(fluid:TankFluid)=>{let k=0;for(let i=0;i<fluid.numParticles*2;i++)k+=fluid.particleVel[i]**2;return k/fluid.numParticles;};

describe('tank fluid', () => {
  it('keeps particles inside the circular vessel after a strong impulse', () => {
    const fluid = new TankFluid('balanced', .55);
    const before = fluid.numParticles;
    fluid.kick(1);
    for (let i = 0; i < 180; i++) fluid.advance(1 / 60);
    expect(fluid.numParticles).toBe(before);
    for (let i = 0; i < fluid.numParticles; i++) {
      const x = fluid.particlePos[2 * i] - 1;
      const y = fluid.particlePos[2 * i + 1] - 1;
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(fluid.radius - fluid.particleRadius + 1e-4);
    }
  });

  it('changes volume by changing particle count without creating NaNs', () => {
    const fluid = new TankFluid('eco', .2);
    const low = fluid.numParticles;
    fluid.setFill(.8);
    expect(fluid.numParticles).toBeGreaterThan(low);
    fluid.kick(-1);
    for (let i = 0; i < 60; i++) fluid.advance(1 / 60);
    for (let i = 0; i < fluid.numParticles * 2; i++) expect(Number.isFinite(fluid.particlePos[i])).toBe(true);
  });

  it('settles below a horizontal surface and flows to the opposite side when inverted',()=>{
    const fluid=new TankFluid('balanced',.4);advance(fluid,2);
    expect(meanY(fluid)).toBeLessThan(-.35);
    expect(energy(fluid)).toBeLessThan(.12);
    fluid.sample({x:0,y:-9.81,z:0});advance(fluid,3);
    expect(meanY(fluid)).toBeGreaterThan(.3);
  });

  it('splashes above the initial surface, detaches droplets, and settles again',()=>{
    const fluid=new TankFluid('balanced',.4);advance(fluid,3);fluid.kick(1);
    let top=-1,detached=0;
    for(let frame=0;frame<60;frame++){
      fluid.advance(1/60);
      for(let i=0;i<fluid.numParticles;i++){
        const x=fluid.particlePos[2*i],y=fluid.particlePos[2*i+1];top=Math.max(top,y-1);
        if(y<1.05)continue;
        let neighbors=0;
        for(let j=0;j<fluid.numParticles;j++)if(i!==j&&Math.hypot(x-fluid.particlePos[2*j],y-fluid.particlePos[2*j+1])<fluid.particleRadius*4)neighbors++;
        if(neighbors<2)detached++;
      }
    }
    expect(top).toBeGreaterThan(.35);expect(detached).toBeGreaterThan(0);
    advance(fluid,10);expect(meanY(fluid)).toBeLessThan(-.35);expect(energy(fluid)).toBeLessThan(.12);
  });

  it('uses the same simulation timeline at 30, 45 and 60 display frames',()=>{
    const states=[30,45,60].map(fps=>{const fluid=new TankFluid('eco',.4);fluid.kick(1);advance(fluid,2,fps);return meanY(fluid);});
    expect(states[0]).toBeCloseTo(states[1],6);expect(states[1]).toBeCloseTo(states[2],6);
  });

  it('preserves zero, full and fractional amounts for every quality',()=>{
    for(const quality of ['eco','balanced','high'] as const){
      const fluid=new TankFluid(quality,1),full=fluid.numParticles;
      fluid.setFill(.37);expect(fluid.numParticles/full).toBeCloseTo(.37,2);
      fluid.setFill(0);advance(fluid,.1);expect(fluid.numParticles).toBe(0);
      fluid.setFill(1);fluid.sample({x:12,y:4,z:3,ax:30,ay:-30,az:20});advance(fluid,.5);
      for(let i=0;i<fluid.numParticles*2;i++)expect(Number.isFinite(fluid.particlePos[i])).toBe(true);
      expect(fluid.numParticles).toBe(full);
    }
  });
});
