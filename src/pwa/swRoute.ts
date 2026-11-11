// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Route-matching logic for public/sw.js, extracted here so it has a unit
// test. public/sw.js is a plain, unbundled script (see its own header for
// why) and duplicates this function verbatim rather than importing it —
// keep the two in sync by hand if either changes.

/**
 * True for requests the service worker must never answer from cache or
 * intercept: calls to the pattern-save backend. Those always need a live
 * network round-trip, on or offline, so the app's "backend unreachable"
 * handling (useAPI.ts) sees a real network error instead of a stale
 * cached response.
 */
export function isApiRequest(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

/**
 * True for GET requests to same-origin, non-API URLs: the app shell and
 * its built assets. Everything else (POST/PUT, cross-origin, /api/) is
 * left to the network untouched by the cache.
 *
 * URLs with a query string are excluded even when they would otherwise
 * qualify: the precache list and Vite's content-hashed build assets never
 * carry one, so a query string only ever appears on a request this worker
 * has no bound on (e.g. an API-like or user-supplied URL on the same
 * origin) — caching those without limit would let the cache grow
 * unbounded on arbitrary input.
 */
export function isCacheableShellRequest(method: string, url: URL, origin: string): boolean {
  if (method !== 'GET') return false;
  if (url.origin !== origin) return false;
  if (isApiRequest(url.pathname)) return false;
  if (url.search !== '') return false;
  return true;
}

/**
 * True for the browser's top-level page navigations (the request for
 * index.html itself, including client-side route entry). These must go
 * network-first: Vite's built asset filenames are content-hashed, so a
 * cached index.html serving stale hashed <script>/<link> URLs would pin
 * a visitor to the first version they ever loaded and never update them.
 * The cache is only a fallback for when the network fetch fails
 * (offline), not the default source.
 */
export function isNavigationRequest(mode: string): boolean {
  return mode === 'navigate';
}

/**
 * True for a Cache Storage entry this app owns and may delete during
 * `activate`. Cache Storage is shared by the whole origin, so on a host
 * like GitHub Pages another app in a sibling subpath can register its own
 * service worker and its own caches there; deleting every cache that is
 * not today's exact name (the old logic) would wipe those too. Scoping the
 * check to a stable prefix this app's caches always share keeps cleanup to
 * caches this worker itself created, in any of its past versions.
 */
export function isOwnCache(name: string, prefix: string): boolean {
  return name.startsWith(prefix);
}

/**
 * True for a cache `activate` should delete: one of this app's own caches
 * (current prefix, or a prefix it used under an earlier product name) that
 * is not the cache the running worker uses. The legacy prefixes exist
 * because the product was renamed (2026-10-01 "Open Rhythm Box" `orb-shell-`
 * to KoinonBayashi `kb-shell-`; 2026-10-19 to BeatBayashi `bb-shell-`); without them the old
 * caches would sit in the visitor's browser forever.
 */
export function isStaleOwnCache(
  name: string,
  currentName: string,
  prefix: string,
  legacyPrefixes: readonly string[]
): boolean {
  if (name === currentName) return false;
  if (isOwnCache(name, prefix)) return true;
  return legacyPrefixes.some((p) => isOwnCache(name, p));
}
