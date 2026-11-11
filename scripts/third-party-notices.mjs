// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Writes the package part of THIRD-PARTY-NOTICES.txt from what the web build
// actually bundles, or (with --check) fails when the file is out of date.
//
// The bundled set comes from Vite itself: an in-memory production build
// (write: false) lists every module in every chunk. Each module under a
// node_modules folder, or under the shared music-kit packages, is mapped to
// its package.json, and the package's own LICENSE file is copied verbatim.
// The fonts section below the package sections is hand-maintained (its
// sources are on the desk, not in node_modules) and is kept as it is.
//
//   node scripts/third-party-notices.mjs          # rewrite the file
//   node scripts/third-party-notices.mjs --check  # exit 1 if stale or a bundled package is missing
//
// Needs beatbayashi/node_modules installed (including the file: links to
// music-kit).

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { appRoot } from './lib/app-root.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const webApp = appRoot(repoRoot);
const noticesPath = join(repoRoot, 'THIRD-PARTY-NOTICES.txt');
const RULE = '-'.repeat(74);
const FONTS_HEADING = 'Bundled fonts (theme kit, ui-system)';

async function bundledModuleIds() {
  const require = createRequire(join(webApp, 'package.json'));
  const vite = await import(pathToFileURL(require.resolve('vite')).href);
  const build = vite.build ?? vite.default?.build;
  const out = await build({
    root: webApp,
    configFile: join(webApp, 'vite.config.ts'),
    logLevel: 'silent',
    build: { write: false, sourcemap: false },
  });
  const outputs = Array.isArray(out) ? out : [out];
  const ids = new Set();
  for (const o of outputs) {
    for (const item of o.output) {
      if (item.type === 'chunk') for (const id of Object.keys(item.modules)) ids.add(id);
    }
  }
  return ids;
}

function packageDirOf(id) {
  const file = id.replace(/^\0/, '').split('?')[0];
  if (!file.includes('node_modules') && !file.includes('music-kit')) return null;
  let dir = dirname(resolve(file));
  while (dir !== dirname(dir)) {
    const pj = join(dir, 'package.json');
    if (existsSync(pj)) {
      const p = JSON.parse(readFileSync(pj, 'utf8'));
      // Some packages ship nested package.json files ({"type":"module"}) without a name.
      if (p.name) return dir;
    }
    dir = dirname(dir);
  }
  return null;
}

function licenceText(dir) {
  const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n));
  if (!f) return null;
  return readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim();
}

async function collect() {
  const dirs = new Set();
  for (const id of await bundledModuleIds()) {
    const d = packageDirOf(id);
    if (d && !resolve(d).startsWith(resolve(webApp) + sep + 'src')) dirs.add(d);
  }
  const pkgs = [];
  for (const dir of dirs) {
    const p = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (p.name === 'beatbayashi') continue;
    const repo = typeof p.repository === 'string' ? p.repository : p.repository?.url;
    pkgs.push({
      name: p.name,
      version: p.version,
      licence: p.license ?? 'UNKNOWN',
      repo: repo ? repo.replace(/^git\+/, '').replace(/\.git$/, '') : p.homepage ?? '',
      text: licenceText(dir),
    });
  }
  pkgs.sort((a, b) => a.name.localeCompare(b.name));
  return pkgs;
}

function render(pkgs, fontsPart) {
  const head = [
    'Third-party notices for BeatBayashi',
    '========================================',
    '',
    'This project bundles no audio recordings, but its web build does bundle code',
    'from the packages below. The list is the set of packages Vite puts into the',
    'production bundle; each licence text is copied verbatim from the package\'s',
    'own LICENSE file at the installed version. Regenerate with',
    '`node scripts/third-party-notices.mjs`; CI-style check: add `--check`.',
    '(See docs/dependency-licenses.csv for the full dependency ledger.)',
    '',
  ];
  const body = [];
  for (const p of pkgs) {
    body.push(RULE, `${p.name} ${p.version} (${p.licence})${p.repo ? ` ${p.repo}` : ''}`, RULE, '');
    body.push(p.text ?? `No licence file in the package. Declared licence: ${p.licence}.`, '');
  }
  return [...head, ...body].join('\n') + '\n' + fontsPart;
}

function fontsPartOf(current) {
  const lines = current.replace(/\r\n/g, '\n').split('\n');
  const i = lines.indexOf(FONTS_HEADING);
  if (i < 1) throw new Error(`"${FONTS_HEADING}" section not found in THIRD-PARTY-NOTICES.txt`);
  return lines.slice(i - 1).join('\n');
}

const check = process.argv.includes('--check');
const current = readFileSync(noticesPath, 'utf8');
const pkgs = await collect();
const missingText = pkgs.filter((p) => !p.text).map((p) => p.name);
const next = render(pkgs, fontsPartOf(current));

let failed = false;
for (const p of pkgs) {
  if (!current.includes(`\n${p.name} ${p.version} (`)) {
    if (check) console.error(`  MISSING  ${p.name} ${p.version} is bundled but not in THIRD-PARTY-NOTICES.txt`);
    failed = true;
  }
}
if (missingText.length) console.error(`  note: no licence file in ${missingText.join(', ')}`);

if (check) {
  if (current.replace(/\r\n/g, '\n') !== next) {
    console.error('THIRD-PARTY-NOTICES.txt is out of date. Run: node scripts/third-party-notices.mjs');
    process.exit(1);
  }
  console.log(`THIRD-PARTY-NOTICES.txt lists all ${pkgs.length} bundled packages.`);
} else {
  writeFileSync(noticesPath, next);
  console.log(`wrote THIRD-PARTY-NOTICES.txt (${pkgs.length} packages${failed ? ', some were missing before' : ''})`);
}
