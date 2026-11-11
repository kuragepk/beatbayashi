#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Try slider/parameter values on one voice without editing the presets:
//   node tools/sound-lab/explore.mjs --playwright <dir> --specs specs.json
// specs.json: [["cymbal","metal_crash",{"resonance":3000},"label"], ...]
// Prints the same metrics as run.mjs for each spec (no WAVs).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, f) => (args.indexOf(`--${n}`) >= 0 ? args[args.indexOf(`--${n}`) + 1] : f);
const specs = JSON.parse(readFileSync(opt('specs'), 'utf8'));
const port = Number(opt('port', '5198'));
const { chromium } = require(path.resolve(opt('playwright', process.env.SMOKE_PLAYWRIGHT_MODULE)));
const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/tools/sound-lab/index.html`, { timeout: 180000 });
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 120000 });
  const line = (label, r) =>
    console.log(`${label.padEnd(30)} n${String(r.normDb ?? '').padStart(6)} pk${String(r.peakDbfs).padStart(7)} L${String(r.lufs).padStart(7)} c${String(r.centroidHz).padStart(6)} lo${String(r.pctBelow2k).padStart(6)} mid${String(r.pctLowMid200to2k).padStart(6)} hi${String(r.pctAbove6k).padStart(6)} d20 ${String(r.decay20).padStart(5)} d40 ${String(r.decay40).padStart(5)} click${String(r.clickToLowDb).padStart(7)} nodes${r.nodesPerHit} ms${r.renderMs16 ?? ''}`);
  for (const spec of specs) {
    if (spec[0] === 'lane') {
      // ["lane", basis, genre, lane, [[cat, id, patch], ...], label]
      const [, basis, genre, lane, patches, label] = spec;
      await page.reload();
      await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 120000 });
      for (const [c, i, p] of patches) await page.evaluate(([cc, ii, pp]) => window.lab.mutate(cc, ii, pp), [c, i, p]);
      const r = await page.evaluate(([b, g, l]) => window.lab.renderLaneBasis(b, g, l, 2), [basis, genre, lane]);
      line(label ?? `${lane} ${basis} ${genre}`, r);
      continue;
    }
    const [cat, id, ov, label] = spec;
    const r = await page.evaluate(([c, i, o]) => window.lab.renderVoice(c, i, o, 3, false), [cat, id, ov]);
    line(label ?? id, r);
  }
} finally {
  await browser.close();
  await server.close();
}
