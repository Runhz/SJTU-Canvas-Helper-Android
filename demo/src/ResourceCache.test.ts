import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceCache } from './ResourceCache';
beforeEach(() => localStorage.clear());
describe('resource cache', () => {
  it('restores metadata, deduplicates requests and refreshes only after expiry', async () => {
    let time = 1000; const load = vi.fn(async () => [{ id: '课件' }]); const cache = new ResourceCache('one', () => time);
    const [a, b] = await Promise.all([cache.get('files', 100, load), cache.get('files', 100, load)]);
    expect(a).toBe(b); expect(load).toHaveBeenCalledTimes(1);
    expect(await new ResourceCache('one', () => time).get('files', 100, load)).toEqual(a); expect(load).toHaveBeenCalledTimes(1);
    time += 101; expect(await cache.get('files', 100, load)).toBe(a); expect(load).toHaveBeenCalledTimes(2);
  });
  it('retains previous contents on failure and never leaks across accounts', async () => {
    const one = new ResourceCache('one'); await one.get('courses', 100, async () => ['course-one']);
    await expect(one.get('courses', 100, async () => { throw Error('offline'); }, true)).rejects.toThrow('offline');
    expect(one.peek('courses')).toEqual(['course-one']); expect(new ResourceCache('two').peek('courses')).toBeUndefined();
  });
  it('rejects late writes after switching accounts', async () => {
    const cache = new ResourceCache('one'); let finish!: (value: string[]) => void;
    const request = cache.get('courses', 100, () => new Promise<string[]>(resolve => { finish = resolve; })); cache.close(); finish(['old']);
    await expect(request).rejects.toThrow('账号已切换'); expect(new ResourceCache('one').peek('courses')).toBeUndefined();
  });
});
