import {describe,expect,it} from 'vitest';
import {angleDelta,gravityAngles,orientationGravity,WaterDynamics} from './waterMotion';
const advance=(water:WaterDynamics,seconds:number,fps=60)=>{for(let i=0;i<seconds*fps;i++)water.step(1/fps);return water;};
describe('water gravity and inertia',()=>{
  it('supports upright, inverted and face-up gravity without a small-angle clamp',()=>{
    expect(gravityAngles({x:0,y:9.81,z:0})?.roll).toBeCloseTo(0);
    expect(Math.abs(gravityAngles({x:0,y:-9.81,z:0})!.roll)).toBeCloseTo(Math.PI);
    expect(gravityAngles({x:0,y:0,z:9.81})?.pitch).toBeCloseTo(Math.PI/2);
    expect(gravityAngles({x:NaN,y:0,z:0})).toBeNull();
    expect(gravityAngles({x:0,y:0,z:0})).toBeNull();
  });
  it('responds promptly to inversion and settles without losing water volume',()=>{
    const water=new WaterDynamics(.35);water.sample({x:0,y:-9.81,z:0});
    advance(water,.2);expect(Math.abs(water.roll)).toBeGreaterThan(1.5);
    advance(water,2);expect(Math.abs(angleDelta(Math.PI,water.roll))).toBeLessThan(.002);
    expect(water.fill).toBeCloseTo(.35);
  });
  it('crosses the angle seam by the short path instead of spinning a full turn',()=>{
    expect(angleDelta(-Math.PI+.04,Math.PI-.04)).toBeCloseTo(.08);
    const water=new WaterDynamics(.5);water.roll=Math.PI-.04;
    water.sample({x:.04,y:-1,z:0});advance(water,1);
    expect(Math.abs(water.roll-(Math.PI-.04))).toBeLessThan(.12);
  });
  it('uses both tilt axes and preserves a brief shake between animation frames',()=>{
    const water=new WaterDynamics(.5);water.sample({x:0,y:5,z:8,ax:15,az:8});
    expect(water.rollVelocity).toBeLessThan(0);expect(water.shock).toBeGreaterThan(.5);
    advance(water,2);expect(water.pitch).toBeGreaterThan(.9);expect(water.shock).toBeLessThan(.04);
  });
  it('keeps the spring response consistent across quality frame rates',()=>{
    const poses=[30,45,60].map(fps=>{const w=new WaterDynamics(.4);w.sample({x:7,y:3,z:2});return advance(w,.4,fps);});
    expect(Math.abs(poses[0].roll-poses[2].roll)).toBeLessThan(.025);
    expect(Math.abs(poses[1].pitch-poses[2].pitch)).toBeLessThan(.025);
  });
  it('maps browser orientation to the same inverted gravity and honors reduced motion',()=>{
    expect(orientationGravity(-90,0).y).toBeCloseTo(-9.81);
    const water=new WaterDynamics(.2);water.targetFill=.8;water.sample(orientationGravity(-90,0));water.touch(.5);
    expect(water.step(.03,true)).toMatchObject({fill:.8,roll:0,pitch:0,shock:0,reduced:true});
  });
});
