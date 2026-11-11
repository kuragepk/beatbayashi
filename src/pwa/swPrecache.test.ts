// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// BB-T17: the build step that fills public/sw.js with the hashed assets.
// The real-browser offline check is in the PR, not here; this covers the
// text rewrite and that the placeholders still exist in the shipped file.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILD_ASSETS_LINE,
  BUILD_ID_LINE,
  buildIdFor,
  digestFiles,
  injectPrecache,
  isPrecached,
  listAssets,
} from '../../scripts/sw-precache.mjs';

const swSource = readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');

describe('sw precache build step', () => {
  it('public/sw.js still carries both placeholder lines exactly once', () => {
    expect(swSource.split(BUILD_ID_LINE)).toHaveLength(2);
    expect(swSource.split(BUILD_ASSETS_LINE)).toHaveLength(2);
    expect(swSource).toContain('const CACHE_NAME = CACHE_PREFIX + BUILD_ID;');
    expect(swSource).toContain('...BUILD_ASSETS]');
  });

  it('matches cached assets regardless of Vary, so crossorigin loads find the precached copy', () => {
    // vite preview answers `Vary: Origin`; the page's module script and
    // stylesheet send an Origin header the precache request did not.
    expect(swSource).toContain('cache.match(event.request, { ignoreVary: true })');
  });

  it('fills in every asset and a cache id that follows the asset list', () => {
    const assets = ['./assets/index-abc123.js', './assets/index-def456.css'];
    const out = injectPrecache(swSource, assets);
    expect(out).toContain(`const BUILD_ASSETS = ${JSON.stringify(assets)};`);
    expect(out).toContain(`const BUILD_ID = "${buildIdFor(assets)}";`);
    expect(out).not.toContain(BUILD_ID_LINE);

    const nextBuild = ['./assets/index-zzz999.js', './assets/index-def456.css'];
    expect(buildIdFor(nextBuild)).not.toBe(buildIdFor(assets));
    expect(buildIdFor([...assets])).toBe(buildIdFor(assets));
  });

  it('leaves font files to first use but still counts them in the cache id', () => {
    const assets = ['./assets/index-abc123.js', './assets/NotoSansJP-x1.ttf', './assets/f-2.woff2'];
    const out = injectPrecache(swSource, assets);
    expect(out).toContain('const BUILD_ASSETS = ["./assets/index-abc123.js"];');
    expect(isPrecached('./assets/logo-9.png')).toBe(true);
    expect(isPrecached('./assets/a.OTF')).toBe(false);
    expect(buildIdFor(assets)).not.toBe(buildIdFor(['./assets/index-abc123.js']));
  });

  it('precaches the unhashed icons and lets their contents change the cache id', () => {
    const assets = ['./assets/index-abc123.js'];
    const icons = ['./icons/mark-32.png'];
    const a = injectPrecache(swSource, assets, icons, 'digest-a');
    const b = injectPrecache(swSource, assets, icons, 'digest-b');
    expect(a).toContain('const BUILD_ASSETS = ["./assets/index-abc123.js","./icons/mark-32.png"];');
    expect(a.match(/const BUILD_ID = .*/)![0]).not.toBe(b.match(/const BUILD_ID = .*/)![0]);
  });

  it('refuses a worker whose placeholder lines were reformatted', () => {
    expect(() => injectPrecache(swSource.replace(BUILD_ID_LINE, 'const BUILD_ID = "dev";'), [])).toThrow(
      /placeholder/
    );
  });

  it('lists nested files under assets as sorted ./assets/ paths', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'bb-sw-'));
    try {
      mkdirSync(path.join(root, 'assets', 'fonts'), { recursive: true });
      writeFileSync(path.join(root, 'assets', 'b-2.js'), '');
      writeFileSync(path.join(root, 'assets', 'a-1.css'), '');
      writeFileSync(path.join(root, 'assets', 'fonts', 'f-3.woff2'), '');
      writeFileSync(path.join(root, 'index.html'), '');
      expect(listAssets(root)).toEqual(['./assets/a-1.css', './assets/b-2.js', './assets/fonts/f-3.woff2']);
      expect(listAssets(path.join(root, 'missing'))).toEqual([]);

      const before = digestFiles(root, ['./assets/b-2.js']);
      writeFileSync(path.join(root, 'assets', 'b-2.js'), 'changed');
      expect(digestFiles(root, ['./assets/b-2.js'])).not.toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
