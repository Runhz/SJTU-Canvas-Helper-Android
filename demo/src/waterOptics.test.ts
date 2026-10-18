import {describe,it,expect} from 'vitest';
import {waterDepth,waterPose} from './waterOptics';
import {waterLevel} from './waterQuality';
describe('continuous optical water',()=>{
  it('preserves spherical volume when turned upside down and toward the camera',()=>{
    for(const fraction of [0,.1,.35,.5,.85,1])for(const normal of [[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[.6,0,.8]]){
      let volume=0;const n=140,step=1.75/n;for(let i=0;i<n;i++)for(let j=0;j<n;j++)volume+=waterDepth(-.875+(i+.5)*step,-.875+(j+.5)*step,normal,waterLevel(fraction)*.875)*step*step;
      expect(volume/(4/3*Math.PI*.875**3)).toBeCloseTo(fraction,2);
    }
  });
  it('keeps surface normals normalized, bounds waves and removes waves for empty/full tanks',()=>{
    for(const fill of [0,.5,1])for(const roll of [0,Math.PI,80]){const pose=waterPose({fill,roll,pitch:Math.PI/2,shock:50,time:0,dt:.016,reduced:false});expect(Math.hypot(...pose.normal)).toBeCloseTo(1,3);expect(pose.amplitude).toBeLessThanOrEqual(.075);if(fill!==.5)expect(pose.amplitude).toBeCloseTo(0)}
  });
});
