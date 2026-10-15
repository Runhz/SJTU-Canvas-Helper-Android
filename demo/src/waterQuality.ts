export type WaterQuality = 'eco' | 'balanced' | 'high';
export const WATER_QUALITY_KEY = 'canvas-water-quality';
export const WATER_QUALITY_EVENT = 'canvas-water-quality-change';
export const waterPresets = {
  eco: { label: '省电', detail: '30 帧 · 轻量流体', fps: 30, pixelRatio: 1, resolution: 28, pressure: 18, surfaceSize: 64 },
  balanced: { label: '均衡', detail: '45 帧 · 细腻流体', fps: 45, pixelRatio: 2, resolution: 36, pressure: 28, surfaceSize: 96 },
  high: { label: '高清', detail: '60 帧 · 精细流体', fps: 60, pixelRatio: 3, resolution: 44, pressure: 40, surfaceSize: 128 },
} as const;
export function readWaterQuality(): WaterQuality {
  try { const value = localStorage.getItem(WATER_QUALITY_KEY); return value === 'eco' || value === 'balanced' ? value : 'high'; }
  catch { return 'high'; }
}
export function saveWaterQuality(value: WaterQuality) {
  try { localStorage.setItem(WATER_QUALITY_KEY, value); } catch { /* In-memory selection remains usable. */ }
  window.dispatchEvent(new CustomEvent(WATER_QUALITY_EVENT, { detail: value }));
}
/** Height of a sphere segment with the requested volume, for a unit sphere. */
export function waterLevel(fraction: number): number {
  const ratio = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  let low = 0, high = 2;
  for (let i = 0; i < 36; i++) { const h = (low + high) / 2; if (h * h * (3 - h) / 4 < ratio) low = h; else high = h; }
  return (low + high) / 2 - 1;
}
