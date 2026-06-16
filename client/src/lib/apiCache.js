// Lightweight client-side cache for GET requests.
//
// The app has no shared fetch layer — every screen does its own fetch() in a
// useEffect, so navigating away and back refetches the same data from scratch,
// and React StrictMode (dev) fires each effect twice. This utility fixes both
// without pulling in React Query / SWR:
//
//   1. In-flight de-duplication — identical concurrent GETs share ONE network
//      call. This alone collapses StrictMode's double-fire and any "two
//      components want the same data at once" burst.
//   2. Short TTL — a recent response is served from memory, so bouncing back to
//      a screen within a few seconds doesn't hit the network again.
//
// Cache key = the URL. Only GETs go through here; mutations should call
// invalidate() for the affected URL(s) so the next read re-fetches. The cache
// is per-tab memory (cleared on logout) — nothing is persisted.

const DEFAULT_TTL_MS = 30_000;

const cache = new Map(); // url -> { ts, data }
const inflight = new Map(); // url -> Promise<data|null>

// Cached GET returning parsed JSON, or null on non-2xx / parse / network error
// (matches the app's existing "safeJson" convention so call sites stay simple:
// `cachedGet(url).then(d => { if (d) setX(d); })`).
//
// Options:
//   headers — passed straight to fetch (e.g. the Bearer sentinel header).
//   force   — bypass the fresh-cache check (still de-dupes in-flight + recaches).
//   ttl     — freshness window in ms (default 30s).
export function cachedGet(url, { headers, force = false, ttl = DEFAULT_TTL_MS } = {}) {
  if (!force) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.ts < ttl) return Promise.resolve(hit.data);
  }

  const pending = inflight.get(url);
  if (pending) return pending;

  const p = fetch(url, { headers })
    .then((r) => (r.ok ? r.json().catch(() => null) : null))
    .then((data) => {
      if (data != null) cache.set(url, { ts: Date.now(), data });
      return data;
    })
    .catch(() => null)
    .finally(() => inflight.delete(url));

  inflight.set(url, p);
  return p;
}

// Drop cached entries so the next cachedGet re-fetches. No argument clears
// everything; a substring clears any URL that contains it
// (e.g. invalidate('/api/nutrition/meal-schedules')).
export function invalidate(substr) {
  if (!substr) {
    cache.clear();
    return;
  }
  for (const url of cache.keys()) {
    if (url.includes(substr)) cache.delete(url);
  }
}

// Never serve one account's cached data to the next. AuthContext.logout()
// dispatches 'am-logout'; clear everything (cache + any in-flight) on it.
if (typeof window !== 'undefined') {
  window.addEventListener('am-logout', () => {
    cache.clear();
    inflight.clear();
  });
}
