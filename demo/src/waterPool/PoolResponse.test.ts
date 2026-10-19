import {it,expect} from 'vitest';
import {PoolResponse,poolDragStrength} from './PoolResponse';
it('has visible recoil, reverses direction and eventually settles',()=>{
 const response=new PoolResponse();response.kick(.85,.32,1);let peak=0,reversed=false;for(let i=0;i<600;i++){response.step(1/60);peak=Math.max(peak,response.x);if(response.x<-.005)reversed=true}expect(peak).toBeGreaterThan(.12);expect(reversed).toBe(true);expect(Math.abs(response.x)+Math.abs(response.z)).toBeLessThan(.0001);
});
it('keeps rapid repeated inputs bounded and honors reduced motion',()=>{
 const response=new PoolResponse();response.kick(NaN,1,1);for(let i=0;i<2000;i++){response.kick(i%2?1:-1,1,10);response.step(i%2?1/30:1/60);expect(Number.isFinite(response.x+response.z)).toBe(true);expect(Math.abs(response.x)).toBeLessThanOrEqual(.22);expect(Math.abs(response.z)).toBeLessThanOrEqual(.22)}response.step(.03,true);expect(response.x).toBe(0);expect(response.z).toBe(0);
});
it('responds similarly at 30 and 60 fps and makes slow drags detectable',()=>{
 const result=(fps:number)=>{const r=new PoolResponse();r.kick(1,.5,.7);for(let i=0;i<fps;i++)r.step(1/fps);return r.x};expect(result(30)).toBeCloseTo(result(60),2);expect(poolDragStrength(1,904)).toBeGreaterThan(.018);expect(poolDragStrength(100,200)).toBe(.055);expect(poolDragStrength(3,0)).toBe(0);
});
