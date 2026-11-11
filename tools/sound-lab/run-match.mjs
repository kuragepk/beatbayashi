#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// The web side of the web-versus-phone loudness match (owner request
// 2026-10-29). Renders the web preset that stands for each phone voice, alone
// and with its own normalisation gain, several times, and writes the numbers
// (JSON) and one listening WAV per voice (mono, 44.1 kHz, 16-bit).
//
//   node tools/sound-lab/run-match.mjs --out <out-dir>/beatbayashi-sound/match-16/web \
//        --playwright C:/.../node_modules/playwright [--runs 6]
//
// Compare with the phone's WAVs by beatbayashi-mobile/scripts/compare-web-mobile.js.
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
const out = path.resolve(opt('out', path.join(root, '.out', 'match-16', 'web')));
const pwPath = opt('playwright', process.env.SMOKE_PLAYWRIGHT_MODULE);
const runs = Number(opt('runs', '6'));
const port = Number(opt('port', '5198'));
if (!pwPath) {
  console.error('pass --playwright <path to node_modules/playwright>');
  process.exit(2);
}

// The phone voice -> the web preset that stands for it.
const VOICES = {
  kick: ['kick', 'membrane_808'],
  snare: ['clap', 'noise_snare'],
  hat: ['cymbal', 'metal_closed'],
  clap: ['clap', 'noise_clap'],
  hat_open: ['cymbal', 'metal_open'],
  ride: ['cymbal', 'metal_ride'],
  crash: ['cymbal', 'metal_crash'],
};

const { chromium } = require(path.resolve(pwPath));
const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);
mkdirSync(out, { recursive: true });
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/sound-lab/index.html`, { timeout: 180000 });
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 120000 });
  const result = { runs, voices: {} };
  for (const [name, [cat, id]] of Object.entries(VOICES)) {
    const r = await page.evaluate(([c, i, n]) => window.lab.renderMatch(c, i, n, true), [cat, id, runs]);
    writeFileSync(path.join(out, `${name}.wav`), Buffer.from(r.wav, 'base64'));
    delete r.wav;
    result.voices[name] = r;
    console.log(name, `${cat}/${id}`, 'norm', r.normDb, 'lufs', r.lufs.join(' '), 'tp', r.truePeakDbfs.join(' '));
  }
  writeFileSync(path.join(out, 'web_metrics.json'), JSON.stringify(result, null, 1));
  console.log('wrote', path.join(out, 'web_metrics.json'));
} finally {
  await browser.close();
  await server.close();
}
