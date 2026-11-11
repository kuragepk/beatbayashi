#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Vendored copy (2026-10-06, release-checklist audit item 9) of the desk's
// templates/ui-system/bin/check-text-size-layout.mjs (MIT, same authors),
// so the C9 layout claim can be reproduced from this repository. One change:
// the layout check is imported from this app's synced kit copy
// (../src/theme/kit/text-size-control.js) instead of ../web/. Only the
// --url mode is meant to be used here; the kit-demo mode (no --url) needs
// the desk's kit files and does not work from this copy.
//
// Run against a local preview of this app:
//   node scripts/check-text-size-layout.mjs --url http://127.0.0.1:4173/ //     --open-settings "[aria-label='Sound settings'], [aria-label='音の設定']" //     --open-settings "button:has-text('Appearance'), button:has-text('外観')" //     --storage-key bb-ui-settings-v1 --base-px 15 --widths 360,600,1280,1920 //     [--playwright <playwright module dir>]
/* Shiroko UI System -- real-browser check of the text-size control's layout rule
 * (STRUCTURE.md C9 / CHECKLIST.md B9): at 360/600/1280/1920 px widths, with 8 px
 * and 48 px samples, at normal and doubled page (root) text, the live preview must
 * sit beside the slider and the page must not overflow horizontally.
 * Talks to 127.0.0.1 only; installs nothing; screenshots never taken.
 * 来歴: 新規作成 (2026-10-04, シロコ委任エージェント)、本人の言葉 2026-10-04 に基づく。
 *   改訂 2026-10-04T09:18Z (UTC) / 18:18 JST: --url で実アプリのページも検査できるようにした
 *   (--open-settings / --storage-key / --settings-json / --base-px / --strict-root2)。
 *   キット単体の検査 (引数なし) の判定は従来どおり (ページ文字 2 倍も失敗扱い)。
 *   改訂 2026-10-04T09:48Z (UTC) / 18:48 JST: --open-settings を繰り返せるようにした (順に押す、
 *   押せるまで待ち、効くまで押し直す) と --wait-for。測定はページ内で eval を使わない形にした。
 *   CSP を外す切り替えは足していない (利用者が受け取るページと別物を検査することになるため)。
 *
 * Kit demo (no --url):
 *   node bin/check-text-size-layout.mjs [--playwright <path>]
 * Real app page:
 *   node bin/check-text-size-layout.mjs --url http://127.0.0.1:PORT/path
 *        [--open-settings "<selector>" ...] [--wait-for "<selector>"]
 *        [--storage-key <localStorage key> [--settings-json '{"theme":"8bit-game"}']]
 *        [--base-px N] [--strict-root2] [--widths 360,600,1280,1920] [--px 8,48]
 *        [--timeout ms] [--playwright <path>]
 *
 *   --url            page that hosts (or opens) the settings panel. Host must be 127.0.0.1;
 *                    every request to another host is aborted.
 *   --open-settings  one open step; repeat it for several, they run in the order given.
 *                    A Playwright selector (CSS, :has-text(), role=...) is clicked once it is
 *                    visible and enabled; if what should appear next (the next step's selector,
 *                    else --wait-for, else the control's slider) does not show, the click is
 *                    repeated until --timeout (covers a click that lands before the page's
 *                    handler is attached). "js:<snippet>" is evaluated in the page once (await
 *                    allowed); it needs a page whose CSP allows script evaluation -- prefer
 *                    selector steps, which work under any CSP. Omit when the control is visible
 *                    on load.
 *   --wait-for       after the steps, wait for this selector to be visible (then the slider).
 *   --storage-key    the app's ui-settings/1 localStorage key. text_px (and schema_minor 1) is
 *                    merged into the stored document before the page loads, with --settings-json
 *                    merged on top. Without it, the px is typed into the control's number input
 *                    (input + change events), i.e. the control drives the app.
 *   --base-px        the app's 標準 px; only printed (scale = px / base) for the report.
 *   --strict-root2   doubled root text cases fail too. By default (with --url) they are
 *                    informational: reported with "info", never counted as failures, because
 *                    root x2 on top of 48 px goes beyond the 48 px cap the rule is written for.
 *
 * Per case the check asserts: a [data-ui-text-size-control] exists with slider and preview
 * (data-ui-text-size-* attributes) and the preview is beside the slider on its side
 * (checkTextSizeControlLayout from web/text-size-control.js, injected into the page);
 * no page horizontal overflow; the slider shows the px; the computed font-size of the
 * preview sample equals the px.
 * Default Playwright: <desk>/projects/recensio/node_modules/playwright.
 * Exit 0 = all ok, 1 = failures, 2 = usage error.
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTextSizeControlLayout, textSizeLayoutCheck, TEXT_SIZE_CONTROL_ATTRS } from '../src/theme/kit/text-size-control.js';

const KIT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const DESK = path.resolve(KIT, '..', '..');

function usage(msg) {
  console.error(`check-text-size-layout: ${msg}`);
  process.exit(2);
}

/** Parses argv into options. Exported for tests. */
export function parseArgs(argv) {
  const o = { widths: [360, 600, 1280, 1920], pxs: [8, 48], strictRoot2: false, timeout: 10000, openSettings: [] };
  const takes = new Set(['--url', '--open-settings', '--wait-for', '--storage-key', '--settings-json', '--base-px', '--playwright', '--widths', '--px', '--timeout']);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--strict-root2') { o.strictRoot2 = true; continue; }
    if (!takes.has(a)) throw new Error(`unknown argument ${a}`);
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`${a} needs a value`);
    i += 1;
    if (a === '--url') o.url = v;
    else if (a === '--open-settings') {
      if (v.trim() === '' || v.trim() === 'js:') throw new Error('--open-settings needs a selector or js:<snippet>');
      o.openSettings.push(v);
    } else if (a === '--wait-for') {
      if (v.trim() === '') throw new Error('--wait-for needs a selector');
      o.waitFor = v;
    }
    else if (a === '--storage-key') o.storageKey = v;
    else if (a === '--settings-json') o.settingsJson = v;
    else if (a === '--base-px') o.basePx = Number(v);
    else if (a === '--playwright') o.playwright = path.resolve(v);
    else if (a === '--timeout') o.timeout = Number(v);
    else if (a === '--widths') o.widths = v.split(',').map(Number);
    else if (a === '--px') o.pxs = v.split(',').map(Number);
  }
  if (o.url !== undefined) {
    let u;
    try { u = new URL(o.url); } catch { throw new Error(`--url is not a URL: ${o.url}`); }
    if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1') throw new Error('--url must be http://127.0.0.1:PORT/... (127.0.0.1 only)');
  } else if (o.openSettings.length || o.waitFor || o.storageKey || o.settingsJson) {
    throw new Error('--open-settings / --wait-for / --storage-key / --settings-json need --url');
  }
  if (o.settingsJson !== undefined) {
    if (!o.storageKey) throw new Error('--settings-json needs --storage-key');
    let j;
    try { j = JSON.parse(o.settingsJson); } catch { throw new Error('--settings-json is not valid JSON'); }
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('--settings-json must be a JSON object');
    o.settingsExtra = j;
  }
  if (o.basePx !== undefined && !(Number.isFinite(o.basePx) && o.basePx > 0)) throw new Error('--base-px must be a positive number');
  for (const n of [...o.widths, ...o.pxs]) if (!Number.isInteger(n) || n <= 0) throw new Error('--widths / --px take positive integers');
  if (!(o.timeout > 0)) throw new Error('--timeout must be positive');
  return o;
}

/** Selector of the control's slider: what the open steps finally wait for. */
export const CONTROL_SLIDER_SELECTOR = `[${TEXT_SIZE_CONTROL_ATTRS.control}] [${TEXT_SIZE_CONTROL_ATTRS.slider}]`;

/**
 * Turns the parsed options into the ordered open steps. Exported for tests.
 * Each --open-settings is one step, run in the order given. A step's `until` is what shows
 * that it worked: the next step's selector (for a click step), or else --wait-for, or else the
 * control's slider. A click step is retried while `until` stays hidden (click before the
 * page's handler was attached); a js: step runs once. `final` is waited for at the end.
 */
export function planOpenSteps(o) {
  const final = o.waitFor ?? CONTROL_SLIDER_SELECTOR;
  const steps = (o.openSettings ?? []).map((s, i, all) => {
    const next = all[i + 1];
    const until = next !== undefined && !next.startsWith('js:') ? next : final;
    return s.startsWith('js:') ? { kind: 'js', code: s.slice(3), until } : { kind: 'click', selector: s, until };
  });
  return { steps, final };
}

/**
 * Runs the open steps on a Playwright page. Each click waits for its target to be visible,
 * enabled and stable (locator.click), then up to the deadline for `until` to show; when it
 * does not, the click is repeated (waits 300, 600, 1200 ... ms between tries). js: steps are
 * evaluated in the page and need a page whose CSP allows it (see CHECKLIST.md B9).
 * Exported for tests (a fake page is enough).
 */
export async function runOpenSteps(page, o, { now = () => Date.now() } = {}) {
  const { steps, final } = planOpenSteps(o);
  const deadline = now() + o.timeout;
  const left = () => Math.max(1, deadline - now());
  for (const step of steps) {
    if (step.kind === 'js') {
      await page.evaluate(`(async () => { ${step.code} })()`);
      continue;
    }
    let wait = 300;
    for (;;) {
      await page.locator(step.selector).first().click({ timeout: left() });
      const shown = await page.locator(step.until).first()
        .waitFor({ state: 'visible', timeout: Math.min(wait, left()) })
        .then(() => true, () => false);
      if (shown) break;
      if (now() >= deadline) throw new Error(`open step "${step.selector}" did not show "${step.until}" within ${o.timeout} ms`);
      wait = Math.min(wait * 2, 4000);
    }
  }
  await page.locator(final).first().waitFor({ state: 'visible', timeout: left() });
  if (final !== CONTROL_SLIDER_SELECTOR) await page.locator(CONTROL_SLIDER_SELECTOR).first().waitFor({ state: 'visible', timeout: left() });
}

/** In-page source of the kit's layout check (no module import needed in the app). */
export const IN_PAGE_CHECK = `(() => {
  const TEXT_SIZE_CONTROL_ATTRS = ${JSON.stringify(TEXT_SIZE_CONTROL_ATTRS)};
  ${textSizeLayoutCheck.toString()}
  ${checkTextSizeControlLayout.toString()}
  return { TEXT_SIZE_CONTROL_ATTRS, checkTextSizeControlLayout };
})()`;

/** Pass/fail of one measured case. Exported for tests. */
export function judgeCase(out, px, rootScale, { strictRoot2 = false } = {}) {
  const reasons = [];
  if (!out.found) reasons.push('no text-size control found');
  else {
    if (!out.ok) reasons.push(...out.controls.filter((c) => !c.ok).flatMap((c) => c.reasons));
    if (out.pageOverflow) reasons.push(`page overflows horizontally (scrollWidth ${out.scrollWidth} > ${out.clientWidth})`);
    if (out.sliderValue !== String(px)) reasons.push(`slider shows ${out.sliderValue}, expected ${px}`);
    if (out.sampleFont !== `${px}px`) reasons.push(`sample computed ${out.sampleFont}, expected ${px}px`);
  }
  const informational = rootScale !== 1 && !strictRoot2;
  return { ok: reasons.length === 0, reasons, informational, counts: reasons.length > 0 && !informational };
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/web/themes.css">
<style>body{margin:0;padding:0 16px;background:var(--ui-app);color:var(--ui-text-body);font-family:var(--ui-font)}</style></head>
<body data-theme="modern"><main id="m"></main>
<script type="module">
import { mountTextSizeControl } from '/web/text-size-control.js';
import { DEFAULT_SETTINGS, textPreviewFonts } from '/web/theme-kit.js';
const cat = await (await fetch('/web/themes-catalogue.json')).json();
const fonts = textPreviewFonts(cat.themes, '8bit-game', { ...DEFAULT_SETTINGS, theme: '8bit-game' }, [{ name: 'Mono', family: 'ui-monospace, monospace' }]);
window.handles = ['right', 'left'].map((side) => mountTextSizeControl(document.getElementById('m'), {
  settings: structuredClone(DEFAULT_SETTINGS), basePx: 11, previewSide: side, fonts, samples: ['あいう アイウ 漢字 ABC abc 0123', '再生 停止 保存 Settings'] , idPrefix: 'ts-' + side }));
window.ready = true;
</script></body></html>`;

function startKitServer() {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
    const f = path.join(KIT, u);
    if (!f.startsWith(KIT) || !existsSync(f)) { res.writeHead(404); return res.end(); }
    const type = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/json';
    res.writeHead(200, { 'content-type': type }); res.end(readFileSync(f));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// Runs in the page: doubles the root font-size, measures. Args: [px, rootScale], kit (IN_PAGE_CHECK's value).
async function measure([px, rootScale], kit) {
  if (rootScale !== 1) {
    const base = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    document.documentElement.style.fontSize = `${base * rootScale}px`;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const { TEXT_SIZE_CONTROL_ATTRS: A, checkTextSizeControlLayout: check } = kit;
  const control = document.querySelector(`[${A.control}]`);
  if (!control) return { found: false };
  const r = check(document);
  const slider = control.querySelector(`[${A.slider}]`);
  const sample = control.querySelector(`[${A.preview}] .ui-text-size-sample`);
  return {
    found: true, ...r,
    sliderValue: slider ? slider.value : null,
    sampleFont: sample ? getComputedStyle(sample).fontSize : null,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  };
}

/**
 * One expression that carries the kit check inline and calls measure: no eval() runs in the
 * page, so a page whose CSP forbids 'unsafe-eval' is measured as users get it. Exported for tests.
 */
export function measureExpression(px, rootScale) {
  return `(${measure.toString()})(${JSON.stringify([px, rootScale])}, ${IN_PAGE_CHECK})`;
}

async function runApp(browser, o) {
  let fail = 0;
  let info = 0;
  const origin = new URL(o.url).origin;
  for (const width of o.widths) {
    for (const px of o.pxs) {
      for (const rootScale of [1, 2]) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        await ctx.route('**/*', (route) => {
          const u = route.request().url();
          if (u.startsWith(`${origin}/`) || u === origin || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
          return route.abort();
        });
        if (o.storageKey) {
          await ctx.addInitScript(([key, v, extra]) => {
            let doc = {};
            try { doc = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { doc = {}; }
            localStorage.setItem(key, JSON.stringify({ ...doc, ...extra, schema_minor: 1, text_px: v }));
          }, [o.storageKey, px, o.settingsExtra ?? {}]);
        }
        const page = await ctx.newPage();
        let out;
        try {
          await page.goto(o.url, { waitUntil: 'load', timeout: o.timeout });
          await runOpenSteps(page, o);
          const sel = `[${TEXT_SIZE_CONTROL_ATTRS.control}]`;
          if (!o.storageKey) {
            await page.evaluate(([numSel, v]) => {
              const n = document.querySelector(numSel);
              n.value = String(v);
              n.dispatchEvent(new Event('input', { bubbles: true }));
              n.dispatchEvent(new Event('change', { bubbles: true }));
            }, [`${sel} [${TEXT_SIZE_CONTROL_ATTRS.number}]`, px]);
          }
          out = await page.evaluate(measureExpression(px, rootScale));
        } catch (e) {
          out = { found: false, error: String(e.message ?? e).split('\n')[0] };
        }
        const j = judgeCase(out, px, rootScale, o);
        const scale = o.basePx ? ` (x${+(px / o.basePx).toFixed(3)} of ${o.basePx})` : '';
        const tag = j.ok ? 'ok' : j.informational ? 'info' : 'FAIL';
        const detail = out.found
          ? `computed=${out.sampleFont} slider=${out.sliderValue} overflow=${out.pageOverflow} ${out.controls.map((c) => `${c.side}:${c.ok ? 'ok' : 'x'}`).join(' ')}`
          : (out.error ?? 'control not found');
        console.log(`${tag.padEnd(4)} ${width}px  px=${px}${scale}  root=x${rootScale}  ${detail}${j.ok ? '' : `  -- ${j.reasons.join('; ')}`}`);
        if (j.counts) fail += 1;
        else if (!j.ok) info += 1;
        await ctx.close();
      }
    }
  }
  return { fail, info };
}

async function runKit(browser, o) {
  const server = await startKitServer();
  const port = server.address().port;
  let fail = 0;
  try {
    for (const width of o.widths) {
      for (const px of o.pxs) {
        for (const pageScale of [1, 2]) { // 2 = largest page text (root font-size doubled)
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          await page.goto(`http://127.0.0.1:${port}/`);
          await page.waitForFunction(() => window.ready === true);
          const out = await page.evaluate(async ([px, pageScale]) => {
            if (pageScale !== 1) document.documentElement.style.fontSize = `${16 * pageScale}px`;
            for (const h of window.handles) { const s = h.elements.slider; s.value = String(px); s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); }
            const { checkTextSizeControlLayout } = await import('/web/text-size-control.js');
            const r = checkTextSizeControlLayout(document);
            const fs = getComputedStyle(window.handles[0].elements.rows[0].sample).fontSize;
            return { ...r, sampleFont: fs, scrollWidth: document.documentElement.scrollWidth };
          }, [px, pageScale]);
          console.log(`${width}px  sample=${px}px  pageText=x${pageScale}  ok=${out.ok}  pageOverflow=${out.pageOverflow}  computed=${out.sampleFont}  ${out.controls.map((c) => c.side + ':' + (c.ok ? 'ok' : c.reasons.join(';'))).join(' ')}`);
          if (!out.ok || out.sampleFont !== `${px}px`) fail += 1;
          await page.close();
        }
      }
    }
  } finally {
    server.close();
  }
  return { fail, info: 0 };
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { usage(e.message); }
  const pw = o.playwright ?? path.join(DESK, 'projects/recensio/node_modules/playwright');
  const require = createRequire(import.meta.url);
  const { chromium } = require(pw);
  const browser = await chromium.launch();
  let res;
  try {
    res = o.url ? await runApp(browser, o) : await runKit(browser, o);
  } finally {
    await browser.close();
  }
  const infoNote = res.info ? ` (${res.info} informational root x2 case(s) not counted; --strict-root2 to count them)` : '';
  console.log(res.fail === 0 ? `ALL OK${infoNote}` : `FAILURES: ${res.fail}${infoNote}`);
  process.exit(res.fail === 0 ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
