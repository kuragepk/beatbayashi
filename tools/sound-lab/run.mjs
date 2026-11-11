#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Drives tools/sound-lab/index.html in headless Chromium and writes the
// numbers (JSON) and listening WAVs. Measurement only; does not touch the app.
//
//   node tools/sound-lab/run.mjs --label before --out <out-dir>/beatbayashi-sound \
//        --playwright C:/.../node_modules/playwright
//
// Output: <out>/<label>_metrics.json and <out>/<label>_voice_<category>_<preset>.wav,
// <label>_pattern_<id>.wav. Playwright is not a dependency of this app; pass
// --playwright (or SMOKE_PLAYWRIGHT_MODULE) the same way scripts/smoke.mjs does.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const label = opt('label', 'run');
const out = path.resolve(opt('out', path.join(root, '.out', 'sound-lab')));
const pwPath = opt('playwright', process.env.SMOKE_PLAYWRIGHT_MODULE);
const wavPatterns = (opt('patterns', 'house-bright,hiphop-bright,dnb-bright')).split(',');
const port = Number(opt('port', '5199'));

if (!pwPath) {
  console.error('pass --playwright <path to node_modules/playwright>');
  process.exit(2);
}
const { chromium } = require(path.resolve(pwPath));
const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);

mkdirSync(out, { recursive: true });
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { port, strictPort: true, host: '127.0.0.1' },
});
await server.listen();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/sound-lab/index.html`, { timeout: 180000 });
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 120000 });

  const catalog = await page.evaluate(() => window.lab.presetCatalog());
  const genres = await page.evaluate(() => window.lab.genres());
  console.log('start', new Date().toISOString());
  const result = { label, sampleRate: 44100, voices: [], cymbalBasis: [], patterns: [] };
  const save = (name, b64) => writeFileSync(path.join(out, name), Buffer.from(b64, 'base64'));

  for (const { cat, ids } of catalog) {
    for (const id of ids) {
      const seconds = cat === 'cymbal' ? 3 : 2;
      const r = await page.evaluate(([c, i, s]) => window.lab.renderVoice(c, i, {}, s, true), [cat, id, seconds]);
      save(`${label}_voice_${cat}_${id}.wav`, r.wav);
      delete r.wav;
      result.voices.push(r);
      console.log(label, 'voice', cat, id, 'lufs', r.lufs, 'centroid', r.centroidHz, 'd20', r.decay20, 'd40', r.decay40);
    }
  }
  for (const basis of ['theory', 'systematic', 'empirical', 'modern']) {
    for (const g of genres) {
      const r = await page.evaluate(([b, gg]) => window.lab.renderLaneBasis(b, gg, 'cymbal', 2), [basis, g]);
      result.cymbalBasis.push(r);
      if (basis === 'theory') {
        for (const lane of ['kick', 'tom', 'clap']) {
          const k = await page.evaluate(([b, gg, l]) => window.lab.renderLaneBasis(b, gg, l, 2), [basis, g, lane]);
          (result.laneBasis ??= []).push({ lane, ...k });
        }
      }
    }
  }
  console.log(label, 'cymbal basis rows', result.cymbalBasis.length, new Date().toISOString());
  const allPatternIds = [];
  for (const g of genres) {
    const ids = await page.evaluate((gg) => window.lab.patternsOf(gg), g);
    allPatternIds.push(ids.find((x) => x.endsWith('-bright')) ?? ids[0]);
  }
  for (const id of allPatternIds) {
    const g = genres[allPatternIds.indexOf(id)];
    const r = await page.evaluate(([gg, pid, w]) => window.lab.renderPattern('theory', gg, pid, w), [g, id, wavPatterns.includes(id)]);
    if (r.wav) save(`${label}_pattern_${id}.wav`, r.wav);
    delete r.wav;
    result.patterns.push(r);
    console.log(label, 'pattern', id, new Date().toISOString());
  }
  writeFileSync(path.join(out, `${label}_metrics.json`), JSON.stringify(result, null, 1));
  console.log('wrote', path.join(out, `${label}_metrics.json`));
} finally {
  await browser.close();
  await server.close();
}
