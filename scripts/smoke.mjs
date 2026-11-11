#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

/**
 * Release smoke check (release checklist row F12), scripted.
 * Provenance: new file, 2026-10-02. Does not change the app; it drives the
 * built page the way a first visitor would and records what happened.
 *
 *   pnpm run smoke                      # http://127.0.0.1:4173/ (a running `vite preview --host 127.0.0.1`)
 *   pnpm run smoke --url https://<preview>.pages.dev/
 *
 * Steps: load the page; the brand mark image has loaded (naturalWidth > 0);
 * PLAY as the very first click, the way a first visitor starts (BB-T18:
 * nothing is clicked before it); while it plays ~2 s, the peak of what the
 * page sends to its audio output must be above -60 dBFS; STOP; change a
 * rhythm preset; Export -> WAV, and the downloaded file is a
 * RIFF/WAVE with a non-empty data chunk at the sample rate of the page's
 * audio context. Any console error, page error, failed request or HTTP
 * status >= 400 fails the run.
 *
 * Output: <out>/smoke/<timestamp>/, where <out> is $BEATBAYASHI_OUT_DIR or else
 * beatbayashi/.out (git-ignored); --out <dir> overrides it: report.json,
 * page-only screenshots (page.screenshot, never the desktop), the WAV.
 * Exit: 0 pass, 1 a check failed, 2 could not run (no Playwright, bad args).
 *
 * Playwright is not a dependency of this app. It is looked up in this order:
 * --playwright <module dir>, env SMOKE_PLAYWRIGHT_MODULE, the desk's
 * viewport_audit.json (playwright_module / chromium_executable, the same
 * setup `pnpm run audit:viewport` uses), then a plain require('playwright').
 *
 * When the target is a loopback address, requests to any other host are
 * blocked (and counted as failed), so a local run never leaves the machine.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = '[smoke]';
const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const opts = { url: 'http://127.0.0.1:4173/', out: null, playwright: null, chromium: null, headed: false, playMs: 2000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--url') opts.url = next();
    else if (a === '--out') opts.out = next();
    else if (a === '--playwright') opts.playwright = next();
    else if (a === '--chromium') opts.chromium = next();
    else if (a === '--play-ms') opts.playMs = Number(next());
    else if (a === '--headed') opts.headed = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    // pnpm passes a literal `--` through to the script (npm swallowed it).
    else if (a === '--') continue;
    else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

// Same lookup as projects/agent-parts/parts/viewport_audit_npm.mjs: walk up to
// the desk that holds viewport_audit.json.
function deskConfig() {
  let d = process.cwd();
  for (;;) {
    const c = path.join(d, 'viewport_audit.json');
    if (existsSync(c) && existsSync(path.join(d, 'projects', 'agent-parts'))) {
      try {
        return { dir: d, cfg: JSON.parse(readFileSync(c, 'utf8')) };
      } catch {
        return null;
      }
    }
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

function loadPlaywright(opts) {
  const tried = [];
  const desk = deskConfig();
  const cands = [];
  if (opts.playwright) cands.push(path.resolve(opts.playwright));
  if (process.env.SMOKE_PLAYWRIGHT_MODULE) cands.push(path.resolve(process.env.SMOKE_PLAYWRIGHT_MODULE));
  if (desk?.cfg?.playwright_module) cands.push(path.resolve(desk.dir, desk.cfg.playwright_module));
  cands.push('playwright');
  for (const c of cands) {
    try {
      const pw = require(c);
      if (pw?.chromium) {
        const exe = opts.chromium || desk?.cfg?.chromium_executable || null;
        return { pw, module: c, executablePath: exe };
      }
    } catch (e) {
      tried.push(`${c}: ${e.code || e.message}`);
    }
  }
  throw new Error(`Playwright not found. Tried:\n  ${tried.join('\n  ')}\nPass --playwright <path to node_modules/playwright>.`);
}

/** Minimal RIFF/WAVE reader: the fmt fields and the data chunk size. */
function inspectWav(buf) {
  const out = { bytes: buf.length, riff: false, wave: false };
  if (buf.length < 12) return out;
  out.riff = buf.toString('ascii', 0, 4) === 'RIFF';
  out.wave = buf.toString('ascii', 8, 12) === 'WAVE';
  let p = 12;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) {
      out.audioFormat = buf.readUInt16LE(body);
      out.channels = buf.readUInt16LE(body + 2);
      out.sampleRate = buf.readUInt32LE(body + 4);
      out.bitsPerSample = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      out.dataBytes = Math.min(size, buf.length - body);
      // Non-zero data: at least one byte of the samples is not 0.
      out.dataNonSilent = buf.subarray(body, body + out.dataBytes).some((b) => b !== 0);
    }
    p = body + size + (size % 2);
  }
  return out;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`${TAG} error: ${e.message}`);
    return 2;
  }
  if (opts.help) {
    console.log('usage: pnpm run smoke [--url <url>] [--out <dir>] [--playwright <dir>] [--chromium <exe>] [--headed] [--play-ms <ms>]');
    return 0;
  }
  let target;
  try {
    target = new URL(opts.url);
  } catch {
    console.error(`${TAG} error: not a URL: ${opts.url}`);
    return 2;
  }
  let pwInfo;
  try {
    pwInfo = loadPlaywright(opts);
  } catch (e) {
    console.error(`${TAG} error: ${e.message}`);
    return 2;
  }

  const outDir = path.resolve(opts.out || path.join(process.env.BEATBAYASHI_OUT_DIR || process.env.KOINON_OUT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.out'), 'smoke', stamp()));
  mkdirSync(outDir, { recursive: true });
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);

  const report = {
    schema: 'beatbayashi-smoke/1',
    url: target.href,
    startedAt: new Date().toISOString(),
    playwright: pwInfo.module,
    outDir,
    ok: false,
    checks: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    blockedRequests: [],
    wav: null,
    screenshots: [],
  };
  const check = (name, ok, detail) => {
    report.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
    console.log(`${TAG} ${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ` -- ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
    return Boolean(ok);
  };

  const launch = { headless: !opts.headed };
  if (pwInfo.executablePath) launch.executablePath = pwInfo.executablePath;
  const browser = await pwInfo.pw.chromium.launch(launch);
  let page;
  const shot = async (name) => {
    const file = path.join(outDir, `${String(report.screenshots.length + 1).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.screenshots.push(file);
  };

  try {
    // English UI: the app follows the browser language on a first visit
    // (owner 2026-10-06), and this script finds buttons by their English
    // names.
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    });
    if (loopback) {
      await context.route('**/*', (route) => {
        const u = new URL(route.request().url());
        if (u.protocol.startsWith('http') && u.host !== target.host) {
          report.blockedRequests.push(u.href);
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });
    }
    // BB-T18: measure what actually reaches the speakers. Every native
    // connect() into an AudioContext's destination also feeds a silent tap
    // (an AnalyserNode that goes nowhere), and the page keeps the running
    // peak of its samples in window.__smokePeak. It only listens; it does
    // not change the graph the app builds.
    await context.addInitScript(() => {
      const w = window;
      w.__smokePeak = 0;
      const taps = new Map();
      const tapFor = (ctx) => {
        let tap = taps.get(ctx);
        if (!tap) {
          tap = ctx.createAnalyser();
          tap.fftSize = 2048;
          const buf = new Float32Array(tap.fftSize);
          taps.set(ctx, tap);
          setInterval(() => {
            tap.getFloatTimeDomainData(buf);
            for (let i = 0; i < buf.length; i++) {
              const v = Math.abs(buf[i]);
              if (v > w.__smokePeak) w.__smokePeak = v;
            }
          }, 20);
        }
        return tap;
      };
      const original = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (target, ...rest) {
        const result = original.call(this, target, ...rest);
        if (target instanceof AudioDestinationNode && target.context) {
          try {
            original.call(this, tapFor(target.context));
          } catch {
            // A node that cannot feed an analyser is left alone.
          }
        }
        return result;
      };
    });
    page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') report.consoleErrors.push({ text: m.text(), location: m.location() });
    });
    page.on('pageerror', (e) => report.pageErrors.push(String(e?.stack || e)));
    page.on('requestfailed', (r) => report.failedRequests.push({ url: r.url(), error: r.failure()?.errorText || 'failed' }));
    page.on('response', (r) => {
      if (r.status() >= 400) report.failedRequests.push({ url: r.url(), status: r.status() });
    });

    // 1. Load.
    const resp = await page.goto(target.href, { waitUntil: 'load', timeout: 30000 });
    check('page loads', resp && resp.ok(), resp ? `HTTP ${resp.status()}` : 'no response');
    await page.locator('h1').first().waitFor({ timeout: 15000 });
    await shot('loaded');

    // 2. Brand mark image(s) decoded. Wait up to 10 s for them to finish
    // loading first: right after the heading appears they can still be in
    // flight, which made this check fail on a busy machine (seen once on
    // 2026-11-08). The check itself is unchanged.
    await page
      .waitForFunction(
        () => {
          const imgs = [...document.querySelectorAll('img[src*="beatbayashi-mark"]')];
          return imgs.length > 0 && imgs.every((i) => i.complete);
        },
        null,
        { timeout: 10000 }
      )
      .catch(() => {});
    const marks = await page.$$eval('img[src*="beatbayashi-mark"]', (imgs) =>
      imgs.map((i) => ({ src: i.currentSrc || i.src, complete: i.complete, naturalWidth: i.naturalWidth }))
    );
    check('brand mark loaded', marks.length > 0 && marks.every((m) => m.complete && m.naturalWidth > 0), marks);

    // 3. PLAY is the first thing clicked (BB-T18). It used to follow a click
    // on the title that no visitor makes; the PLAY click is now the user
    // gesture that has to start audio on its own.
    const play = page.getByRole('button', { name: /PLAY$/ });
    let audioReady = true;
    try {
      await play.waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /PLAY$/.test(b.textContent || '') && !b.disabled), null, { timeout: 15000 });
    } catch {
      audioReady = false;
    }
    check('PLAY is enabled before any click', audioReady);

    // 4. PLAY, wait, STOP.
    if (audioReady) {
      await play.click();
      const stopBtn = page.getByRole('button', { name: /STOP$/ });
      let playing = true;
      try {
        await stopBtn.waitFor({ state: 'visible', timeout: 5000 });
      } catch {
        playing = false;
      }
      check('PLAY switches to STOP (playing)', playing);
      await page.evaluate(() => {
        window.__smokePeak = 0;
      });
      await page.waitForTimeout(opts.playMs);
      const peak = await page.evaluate(() => window.__smokePeak);
      const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
      report.livePeakDbfs = Number.isFinite(peakDb) ? Number(peakDb.toFixed(1)) : null;
      check('sound came out while playing (live peak above -60 dBFS)', peakDb > -60, {
        peakDbfs: report.livePeakDbfs,
      });
      await shot('playing');
      if (playing) {
        await stopBtn.click();
        let stopped = true;
        try {
          await play.waitFor({ state: 'visible', timeout: 5000 });
        } catch {
          stopped = false;
        }
        check('STOP returns to PLAY', stopped);
      }
    }

    // 5. Change a preset: the first genre row that is not the active one, its
    // first mode. (The default pattern is itself a preset, so picking the
    // active row could be a no-op.) The grid must change too.
    // Step buttons carry aria-pressed and a "<lane>, bar N, step M" label.
    const gridFingerprint = () =>
      page.$$eval('button[aria-pressed]', (bs) =>
        bs
          .filter((b) => /, bar \d+, step \d+/.test(b.getAttribute('aria-label') || ''))
          .map((b) => `${b.getAttribute('aria-label')}=${b.getAttribute('aria-pressed')}`)
          .join('|')
      );
    const gridBefore = await gridFingerprint();
    const selects = page.locator('select[id^="preset-pick-"]');
    const count = await selects.count();
    let select = null;
    for (let i = 0; i < count; i++) {
      if ((await selects.nth(i).inputValue()) === '') {
        select = selects.nth(i);
        break;
      }
    }
    if (!select) {
      check('preset changes', false, 'no inactive preset row found');
    } else {
      const selectId = await select.getAttribute('id');
      await select.selectOption({ index: 1 });
      await page.waitForTimeout(200);
      const chosen = await select.inputValue();
      const label = (await page.locator(`label[for="${selectId}"]`).textContent()) || '';
      // The selected row's label carries the knot pixel icon (ui16 set, 2026-10-03; it was a text "▶ " before).
      const marked = (await page.locator(`label[for="${selectId}"] svg[data-icon="knot"]`).count()) > 0;
      const changed = (await gridFingerprint()) !== gridBefore;
      check('preset changes', chosen !== '' && marked && changed, { select: selectId, value: chosen, label: label.trim(), marked, gridChanged: changed });
    }
    await shot('preset');

    // 6. Export -> WAV.
    if (audioReady) {
      await page.getByTitle('Export pattern and audio').click();
      const wavBtn = page.getByRole('button', { name: /Export as WAV/ });
      await wavBtn.waitFor({ state: 'visible', timeout: 5000 });
      await shot('export-dialog');
      const expectedRate = await page.evaluate(async () => {
        const c = new AudioContext();
        const r = c.sampleRate;
        await c.close();
        return r;
      });
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), wavBtn.click()]);
      const name = download.suggestedFilename();
      const file = path.join(outDir, name);
      await download.saveAs(file);
      const info = inspectWav(readFileSync(file));
      report.wav = { file, suggestedFilename: name, expectedSampleRate: expectedRate, ...info };
      check('WAV is RIFF/WAVE', info.riff && info.wave, { riff: info.riff, wave: info.wave });
      check('WAV data chunk is non-zero', info.dataBytes > 0 && info.dataNonSilent, { dataBytes: info.dataBytes, nonSilent: info.dataNonSilent });
      check('WAV sample rate matches the audio context', info.sampleRate === expectedRate, { wav: info.sampleRate, expected: expectedRate });
      await page.waitForTimeout(300);
      await shot('after-export');
    } else {
      check('WAV export', false, 'skipped: audio never became ready');
    }

    check('no console errors', report.consoleErrors.length === 0, report.consoleErrors.length ? report.consoleErrors : undefined);
    check('no page errors', report.pageErrors.length === 0, report.pageErrors.length ? report.pageErrors : undefined);
    check('no failed requests', report.failedRequests.length === 0, report.failedRequests.length ? report.failedRequests : undefined);
  } catch (e) {
    check('run completed', false, String(e?.message || e));
    try {
      if (page) await shot('error');
    } catch {}
  } finally {
    await browser.close();
  }

  report.finishedAt = new Date().toISOString();
  report.ok = report.checks.length > 0 && report.checks.every((c) => c.ok);
  const reportFile = path.join(outDir, 'report.json');
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  const failed = report.checks.filter((c) => !c.ok).length;
  console.log(`${TAG} ${report.ok ? 'PASS' : 'FAIL'}: ${report.checks.length - failed}/${report.checks.length} checks passed; report ${reportFile}`);
  return report.ok ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(`${TAG} error: ${e?.stack || e}`);
    process.exitCode = 2;
  }
);
