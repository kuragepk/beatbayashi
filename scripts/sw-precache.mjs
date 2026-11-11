// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

/**
 * Build step for public/sw.js (BB-T17). Vite copies public/sw.js into dist/
 * untouched, so on its own the worker only precached the page and the
 * manifest: the hashed JS and CSS under dist/assets were cached only after
 * a visit happened to request them, and the first offline reload could
 * miss them. After the bundle is written, this fills in the build's asset
 * list and a cache name derived from it, so every build has its own cache
 * and activate drops the previous one.
 *
 * Font files are left out of the precache list. The kit ships every
 * selectable typeface (about 58 MB in the 2026-11-08 build) and a visitor
 * uses one or two; the worker still caches each font the first time the page
 * requests it (stale-while-revalidate), so the font in use opens offline.
 * The cache name is derived from every file, fonts included.
 *
 * The files under dist/icons (the brand mark the page shows, the favicons
 * and the manifest icons, a few KB) come from public/ and have no hash in
 * their names, so they are precached too and their contents go into the
 * cache name: a changed icon still gives a new cache.
 *
 * public/sw.js keeps the two placeholder lines below; the dev server and
 * unit tests see them as they are ('dev', no assets).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const BUILD_ID_LINE = "const BUILD_ID = 'dev';";
export const BUILD_ASSETS_LINE = 'const BUILD_ASSETS = [];';

/** Every file under dir, as './assets/...' style paths relative to root, sorted. */
export function listAssets(root, dir = 'assets') {
  const start = path.join(root, dir);
  if (!existsSync(start)) return [];
  const out = [];
  const walk = (rel) => {
    for (const name of readdirSync(path.join(root, rel))) {
      const child = rel + '/' + name;
      if (statSync(path.join(root, child)).isDirectory()) walk(child);
      else out.push('./' + child);
    }
  };
  walk(dir);
  return out.sort();
}

/** Font files are cached on first use instead of up front (see the header). */
export function isPrecached(assetPath) {
  return !/\.(ttf|otf|woff2?)$/i.test(assetPath);
}

/**
 * A short id that changes whenever the list of hashed files changes. Vite
 * puts a content hash in every asset name, so a changed list means changed
 * content.
 */
export function buildIdFor(assets) {
  return createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
}

/**
 * Returns the worker source with the build's id and precache list filled in.
 * assets: every file under dist/assets (hashed names). shellFiles: unhashed
 * files to precache as well, with shellDigest a hash of their contents.
 * The precache list is every asset except fonts, then shellFiles.
 */
export function injectPrecache(source, assets, shellFiles = [], shellDigest = '') {
  if (!source.includes(BUILD_ID_LINE) || !source.includes(BUILD_ASSETS_LINE)) {
    throw new Error('sw.js no longer has the BUILD_ID / BUILD_ASSETS placeholder lines');
  }
  return source
    .replace(
      BUILD_ID_LINE,
      `const BUILD_ID = ${JSON.stringify(buildIdFor(shellDigest ? [...assets, shellDigest] : assets))};`
    )
    .replace(
      BUILD_ASSETS_LINE,
      `const BUILD_ASSETS = ${JSON.stringify([...assets.filter(isPrecached), ...shellFiles])};`
    );
}

/** sha256 over each file's path and contents, in the given order. */
export function digestFiles(root, files) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file + '\n');
    hash.update(readFileSync(path.join(root, file)));
  }
  return hash.digest('hex');
}

/** Vite plugin: rewrites <outDir>/sw.js once the bundle is on disk. */
export function swPrecache() {
  let outDir = 'dist';
  return {
    name: 'beatbayashi-sw-precache',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const swPath = path.join(outDir, 'sw.js');
      if (!existsSync(swPath)) return;
      const assets = listAssets(outDir);
      const icons = listAssets(outDir, 'icons');
      const source = readFileSync(swPath, 'utf8');
      writeFileSync(swPath, injectPrecache(source, assets, icons, digestFiles(outDir, icons)));
    },
  };
}
