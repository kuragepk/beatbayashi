// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// BeatBayashi service worker: caches the built app shell for offline
// use. Copied verbatim into dist/ by Vite (it lives in public/, so it is
// never bundled or hashed) and registered only in production builds, see
// src/main.tsx.
//
// Strategy:
//  - navigations (request.mode === 'navigate', i.e. index.html itself):
//    network-first, falling back to the cached copy only when the
//    network fetch fails. Vite's asset filenames are content-hashed, so
//    serving a cached index.html by default would pin a visitor to the
//    <script>/<link> URLs from the first version they ever loaded and
//    they would never see an update.
//  - other same-origin GETs (the hashed JS/CSS/icon files index.html
//    points at): stale-while-revalidate — serve the cached copy
//    immediately if there is one, and refresh the cache in the
//    background. Safe here because a hashed filename never changes
//    meaning; there is nothing to go stale.
//  - /api/ (mock-backend.js or the Spring service): left alone,
//    network-only — a cached API response would silently disagree with
//    the app's own "backend reachable" state.
// The route logic below mirrors src/pwa/swRoute.ts, which has the unit
// tests; keep both in sync by hand, since this file is intentionally not
// built by Vite.

// Every cache name this app has ever used starts with this prefix (see
// isOwnCache below). Cache Storage is shared by the whole origin, so on a
// host like GitHub Pages a sibling app in another subpath can have its own
// caches there; activate must only ever delete caches under this prefix.
const CACHE_PREFIX = 'bb-shell-';
// The two lines below are filled in by scripts/sw-precache.mjs after each
// production build: BUILD_ID from the list of hashed files, BUILD_ASSETS
// with every file under dist/assets except fonts (fonts are cached when the
// page first asks for one, by the fetch handler below). Each build therefore gets its own
// cache (bb-shell-<id>), and activate drops the previous build's one,
// including the old fixed name bb-shell-v1. Left as they are here, the dev
// server sees 'dev' and no assets. Do not reformat these two lines; the
// build step matches them exactly.
const BUILD_ID = 'dev';
const BUILD_ASSETS = [];
const CACHE_NAME = CACHE_PREFIX + BUILD_ID;
// Prefixes this app used under earlier product names. Caches under them are
// this app's own and are always stale now: 'orb-shell-' was "Open Rhythm
// Box", renamed to KoinonBayashi on 2026-10-01; 'kb-shell-' was
// KoinonBayashi, renamed to BeatBayashi on 2026-10-06. Keep entries here so a
// visitor who skipped versions still gets cleaned up.
const LEGACY_CACHE_PREFIXES = ['orb-shell-', 'kb-shell-'];
const PRECACHE = ['./', './index.html', './manifest.webmanifest', ...BUILD_ASSETS];

function isApiRequest(pathname) {
  return pathname.startsWith('/api/');
}

function isCacheableShellRequest(method, url, origin) {
  if (method !== 'GET') return false;
  if (url.origin !== origin) return false;
  if (isApiRequest(url.pathname)) return false;
  // The precache list and Vite's content-hashed build assets never carry a
  // query string; anything that does is unbounded input this worker has no
  // limit on, so it is left to the network rather than cached.
  if (url.search !== '') return false;
  return true;
}

function isOwnCache(name, prefix) {
  return name.startsWith(prefix);
}

function isStaleOwnCache(name, currentName, prefix, legacyPrefixes) {
  if (name === currentName) return false;
  if (isOwnCache(name, prefix)) return true;
  return legacyPrefixes.some((p) => isOwnCache(name, p));
}

function isNavigationRequest(mode) {
  return mode === 'navigate';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => isStaleOwnCache(n, CACHE_NAME, CACHE_PREFIX, LEGACY_CACHE_PREFIXES))
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!isCacheableShellRequest(event.request.method, url, self.location.origin)) return;

  if (isNavigationRequest(event.request.mode)) {
    // Network-first: only fall back to the cache (index.html) once the
    // network fetch itself fails, e.g. while offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.match(event.request).then((m) => m || cache.match('./index.html')))
        )
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // ignoreVary: the page loads its JS and CSS with `crossorigin`, so the
      // request carries an Origin header, and servers answer with
      // `Vary: Origin` (vite preview does). The precached copy was fetched
      // without one and would never match. A hashed filename has one content
      // whatever the Origin, so Vary carries nothing here.
      const cached = await cache.match(event.request, { ignoreVary: true });
      const fetchAndUpdate = fetch(event.request)
        .then((response) => {
          if (response && response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached); // offline and not cached yet: surface the failed fetch upstream
      return cached || fetchAndUpdate;
    })
  );
});
