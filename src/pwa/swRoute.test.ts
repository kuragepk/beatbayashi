// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  isApiRequest,
  isCacheableShellRequest,
  isNavigationRequest,
  isOwnCache,
  isStaleOwnCache,
} from './swRoute';

describe('isApiRequest', () => {
  it('matches /api/ paths', () => {
    expect(isApiRequest('/api/patterns')).toBe(true);
    expect(isApiRequest('/api/sequencer/play')).toBe(true);
  });

  it('does not match the app shell', () => {
    expect(isApiRequest('/')).toBe(false);
    expect(isApiRequest('/index.html')).toBe(false);
    expect(isApiRequest('/assets/main-abc123.js')).toBe(false);
    expect(isApiRequest('/apiary')).toBe(false); // prefix, not substring
  });
});

describe('isCacheableShellRequest', () => {
  const origin = 'https://example.test';

  it('caches same-origin GET requests outside /api/', () => {
    expect(isCacheableShellRequest('GET', new URL('https://example.test/index.html'), origin)).toBe(
      true
    );
    expect(
      isCacheableShellRequest('GET', new URL('https://example.test/assets/app.js'), origin)
    ).toBe(true);
  });

  it('never caches /api/ requests, backend on any port', () => {
    expect(
      isCacheableShellRequest('GET', new URL('https://example.test/api/patterns'), origin)
    ).toBe(false);
    expect(
      isCacheableShellRequest('GET', new URL('http://localhost:8080/api/patterns'), origin)
    ).toBe(false);
  });

  it('never caches non-GET requests', () => {
    expect(isCacheableShellRequest('POST', new URL('https://example.test/index.html'), origin)).toBe(
      false
    );
    expect(
      isCacheableShellRequest('DELETE', new URL('https://example.test/api/patterns'), origin)
    ).toBe(false);
  });

  it('never caches cross-origin requests', () => {
    expect(
      isCacheableShellRequest('GET', new URL('https://other.test/index.html'), origin)
    ).toBe(false);
  });

  it('never caches same-origin GETs with a query string (unbounded input)', () => {
    expect(
      isCacheableShellRequest('GET', new URL('https://example.test/assets/app.js?v=1'), origin)
    ).toBe(false);
    expect(
      isCacheableShellRequest(
        'GET',
        new URL('https://example.test/share?text=hello%20world'),
        origin
      )
    ).toBe(false);
  });
});

describe('isOwnCache', () => {
  const prefix = 'bb-shell-';

  it('matches caches this app created, including past versions', () => {
    expect(isOwnCache('bb-shell-v1', prefix)).toBe(true);
    expect(isOwnCache('bb-shell-v2', prefix)).toBe(true);
  });

  it('does not match another app sharing the same origin (e.g. a GitHub Pages sibling)', () => {
    expect(isOwnCache('other-app-shell-v1', prefix)).toBe(false);
    expect(isOwnCache('workbox-precache-v2', prefix)).toBe(false);
  });
});

describe('isNavigationRequest', () => {
  it('matches top-level navigations only', () => {
    expect(isNavigationRequest('navigate')).toBe(true);
    expect(isNavigationRequest('cors')).toBe(false);
    expect(isNavigationRequest('no-cors')).toBe(false);
    expect(isNavigationRequest('same-origin')).toBe(false);
  });
});

describe('isStaleOwnCache (rename cleanup, 2026-10-01)', () => {
  const current = 'bb-shell-v1';
  const prefix = 'bb-shell-';
  const legacy = ['orb-shell-', 'kb-shell-'];

  it('deletes caches left under the pre-rename orb-shell- prefix', () => {
    expect(isStaleOwnCache('orb-shell-v1', current, prefix, legacy)).toBe(true);
    expect(isStaleOwnCache('orb-shell-v7', current, prefix, legacy)).toBe(true);
    // KoinonBayashi-era prefix, renamed to bb-shell- on 2026-10-19.
    expect(isStaleOwnCache('kb-shell-v2', current, prefix, legacy)).toBe(true);
  });

  it('deletes older caches under the current prefix but keeps the current one', () => {
    expect(isStaleOwnCache('bb-shell-v0', current, prefix, legacy)).toBe(true);
    expect(isStaleOwnCache(current, current, prefix, legacy)).toBe(false);
  });

  it('never deletes another app sharing the origin', () => {
    expect(isStaleOwnCache('other-app-shell-v1', current, prefix, legacy)).toBe(false);
    expect(isStaleOwnCache('workbox-precache-v2', current, prefix, legacy)).toBe(false);
    expect(isStaleOwnCache('orbit-shell-v1', current, prefix, legacy)).toBe(false);
  });

  it('public/sw.js uses the same prefixes and calls the same check', () => {
    const sw = readFileSync(
      fileURLToPath(new URL('../../public/sw.js', import.meta.url)),
      'utf8'
    );
    expect(sw).toContain("const CACHE_PREFIX = 'bb-shell-';");
    expect(sw).toContain("const LEGACY_CACHE_PREFIXES = ['orb-shell-', 'kb-shell-'];");
    expect(sw).toMatch(/isStaleOwnCache\(n, CACHE_NAME, CACHE_PREFIX, LEGACY_CACHE_PREFIXES\)/);
    expect(sw).not.toMatch(/isOwnCache\(n, CACHE_PREFIX\) && n !== CACHE_NAME/);
  });
});
