import {it,expect} from 'vitest';
import {poolLevel} from './WaterPool';
it('maps progress to a pool with freeboard and clamps invalid values',()=>{
 expect(poolLevel(0)).toBe(-1);expect(poolLevel(1)).toBeCloseTo(.88);expect(poolLevel(.5)).toBeCloseTo(-.06);
 expect(poolLevel(-3)).toBe(-1);expect(poolLevel(NaN)).toBe(-1);expect(poolLevel(Infinity)).toBe(-1);expect(poolLevel(2)).toBeCloseTo(.88);
});
