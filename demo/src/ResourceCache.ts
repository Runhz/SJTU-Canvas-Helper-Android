interface Entry<T> { data: T; fetchedAt: number }
/** Account-scoped metadata only. Files are fetched separately, when requested. */
export class ResourceCache {
  private entries = new Map<string, Entry<unknown>>();
  private pending = new Map<string, Promise<unknown>>();
  private closed = false;
  constructor(private namespace: string, private now = Date.now) {
    try { const value = JSON.parse(localStorage.getItem(namespace) || 'null'); if (value?.version === 1) for (const [key, entry] of Object.entries(value.entries || {})) {
      const e = entry as Entry<unknown>; if (Number.isFinite(e.fetchedAt) && e.data !== undefined) this.entries.set(key, e);
    } } catch { /* A corrupt cache is replaceable. */ }
  }
  peek<T>(key: string): T | undefined { return this.entries.get(key)?.data as T | undefined; }
  isFresh(key: string, ttl: number) { const entry = this.entries.get(key); return !!entry && this.now() - entry.fetchedAt >= 0 && this.now() - entry.fetchedAt < ttl; }
  async get<T>(key: string, ttl: number, load: () => Promise<T>, force = false): Promise<T> {
    if (this.closed) throw new Error('账号已切换');
    const running = this.pending.get(key); if (running) return running as Promise<T>;
    if (!force && this.isFresh(key, ttl)) return this.peek<T>(key)!;
    const task = load().then(data => {
      if (this.closed) throw new Error('账号已切换');
      const old = this.peek<T>(key); const stable = old !== undefined && JSON.stringify(old) === JSON.stringify(data) ? old : data;
      this.entries.set(key, { data: stable, fetchedAt: this.now() }); this.persist(); return stable;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, task); return task;
  }
  close() { this.closed = true; this.pending.clear(); }
  private persist() {
    try { localStorage.setItem(this.namespace, JSON.stringify({ version: 1, entries: Object.fromEntries(this.entries) })); } catch { /* Quota failure keeps the in-memory cache. */ }
  }
}
export const CACHE_TTL = { courses: 15 * 60_000, assignments: 3 * 60_000, files: 10 * 60_000, recordings: 10 * 60_000, materials: 60 * 60_000, calendar: 5 * 60_000 };
