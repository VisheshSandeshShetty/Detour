// A tiny in-memory cache with an expiry time per entry.
//
// Why: OSRM, Overpass and Photon are free public services with fair-use limits.
// If two people (or one person pressing "retry") ask for the same thing, we answer
// from memory instead of calling the service again.
//
// Limitation: the cache is emptied when the server restarts and is not shared between
// several server processes. For a college project that is perfectly fine.

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const MAX_ENTRIES = 500;
const store = new Map<string, CacheEntry>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown, ttlSeconds: number): void {
  if (store.size >= MAX_ENTRIES) {
    // Make room: drop expired entries first, then the oldest one (Map keeps insertion order)
    const now = Date.now();
    for (const [existingKey, entry] of store) {
      if (entry.expiresAt < now) store.delete(existingKey);
    }
    if (store.size >= MAX_ENTRIES) {
      const oldestKey = store.keys().next().value;
      if (oldestKey !== undefined) store.delete(oldestKey);
    }
  }
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function cacheClear(): void {
  store.clear();
}
