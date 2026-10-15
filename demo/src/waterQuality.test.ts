import { describe, expect, it, afterEach } from 'vitest';
import { waterLevel, readWaterQuality, saveWaterQuality, WATER_QUALITY_KEY, waterPresets } from './waterQuality';
afterEach(() => localStorage.removeItem(WATER_QUALITY_KEY));
describe('water tank', () => {
  it('maps completion to volume rather than a misleading linear height', () => {
    for (const fraction of [0, .05, .25, .5, .9, 1]) { const h = waterLevel(fraction) + 1; expect(h * h * (3 - h) / 4).toBeCloseTo(fraction, 8); }
    expect(waterLevel(.1)).toBeGreaterThan(-.8);
    expect(waterLevel(-1)).toBeCloseTo(-1); expect(waterLevel(NaN)).toBeCloseTo(-1);
  });
  it('defaults to high and preserves a manual selection', () => {
    expect(readWaterQuality()).toBe('high'); saveWaterQuality('eco'); expect(readWaterQuality()).toBe('eco');
    localStorage.setItem(WATER_QUALITY_KEY, 'obsolete'); expect(readWaterQuality()).toBe('high');
    expect(waterPresets.eco.fps).toBeLessThan(waterPresets.high.fps);
  });
});
