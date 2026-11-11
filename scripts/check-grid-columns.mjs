#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// 来歴: 新規作成 (2026-10-07)。本人決定「360 px で 16 列すべて見える（ラベルをアイコンだけにする）」。
// リリース点検 F7 が 360 px で 15・16 列目が枠の外に出ていたのを拾えなかったため、その検査を足した。
// 机上の viewport_audit (projects/agent-parts) は設定ファイル側の作業ツリーを検査するので、
// この検査は本アプリの scripts/ に置き、--url で任意のプレビューに向ける。
//
// Real-browser check: at each width (and optional text sizes), every `[data-cell]`
// (main step pads) must lie fully inside the document's client width and inside
// the grid's own client box (no column hidden by the grid's inner scroll), and
// the page must not scroll sideways. Talks to 127.0.0.1 only.
//
//   vite preview --host 127.0.0.1 --port 4173
//   node scripts/check-grid-columns.mjs --url http://127.0.0.1:4173/ \
//        [--widths 360,420,600,1280] [--text-px 11,48] [--storage-key bb-ui-settings-v1] \
//        [--playwright <playwright module dir>]
//
// Exit 0 pass / 1 failure / 2 usage or environment error. --text-px needs --storage-key.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Default Playwright: the desk's projects/recensio/node_modules/playwright, found by
// walking up from this file (the app lives at different depths in a worktree).
function findDefaultPlaywright() {
  let d = HERE;
  for (;;) {
    const c = path.join(d, 'projects', 'recensio', 'node_modules', 'playwright');
    if (existsSync(c)) return c;
    const up = path.dirname(d);
    if (up === d) return path.join(HERE, 'node_modules', 'playwright');
    d = up;
  }
}

function usage(msg) {
  console.error(`check-grid-columns: ${msg}`);
  console.error('usage: node scripts/check-grid-columns.mjs --url http://127.0.0.1:PORT/ [--widths 360,600] [--text-px 11,48 --storage-key KEY] [--playwright DIR]');
  process.exit(2);
}

function parseArgs(argv) {
  const o = { widths: [360, 420, 600, 1280], textPx: [null], height: 800 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--url') { o.url = v; i++; }
    else if (a === '--widths') { o.widths = v.split(',').map(Number); i++; }
    else if (a === '--text-px') { o.textPx = v.split(',').map(Number); i++; }
    else if (a === '--storage-key') { o.storageKey = v; i++; }
    else if (a === '--playwright') { o.playwright = path.resolve(v); i++; }
    else usage(`unknown argument ${a}`);
  }
  if (!o.url) usage('--url is required');
  if (new URL(o.url).hostname !== '127.0.0.1') usage('only 127.0.0.1 is allowed');
  if (o.widths.some((n) => !(n > 0)) || o.textPx.some((n) => n !== null && !(n >= 8 && n <= 48))) usage('bad --widths / --text-px');
  if (o.textPx.some((n) => n !== null) && !o.storageKey) usage('--text-px needs --storage-key');
  return o;
}

/** Runs inside the page: returns the worst column overflow in px (<= 0 is fine). */
function measureInPage() {
  const cells = Array.from(document.querySelectorAll('[data-cell]'));
  const docW = document.documentElement.clientWidth;
  let over = -Infinity;
  let worst = null;
  for (const c of cells) {
    const r = c.getBoundingClientRect();
    // The grid container is the nearest ancestor that clips horizontally.
    let box = c.parentElement;
    while (box && box !== document.body) {
      const ox = getComputedStyle(box).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') break;
      box = box.parentElement;
    }
    const boxRight = box && box !== document.body ? box.getBoundingClientRect().left + box.clientWidth : docW;
    const limit = Math.min(docW, boxRight);
    const d = Math.max(r.right - limit, -r.left);
    if (d > over) { over = d; worst = c.getAttribute('data-cell'); }
  }
  return {
    cells: cells.length,
    over,
    worst,
    docW,
    pageScrollsSideways: document.documentElement.scrollWidth > docW + 1,
    padPx: cells.length ? Math.round(cells[0].getBoundingClientRect().width) : 0,
  };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const pw = o.playwright ?? findDefaultPlaywright();
  let chromium;
  try {
    chromium = createRequire(import.meta.url)(pw).chromium;
  } catch (e) {
    console.error(`check-grid-columns: cannot load Playwright from ${pw}: ${e.message}`);
    process.exit(2);
  }
  const browser = await chromium.launch();
  let fail = 0;
  try {
    for (const px of o.textPx) {
      for (const w of o.widths) {
        const ctx = await browser.newContext({ viewport: { width: w, height: o.height } });
        await ctx.route('**/*', (route) => {
          const h = new URL(route.request().url()).hostname;
          return h === '127.0.0.1' || route.request().url().startsWith('data:') || route.request().url().startsWith('blob:')
            ? route.continue()
            : route.abort();
        });
        if (px !== null) {
          await ctx.addInitScript(([key, v]) => {
            let doc = {};
            try { doc = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* start fresh */ }
            localStorage.setItem(key, JSON.stringify({ ...doc, schema_minor: 1, text_px: v }));
          }, [o.storageKey, px]);
        }
        const page = await ctx.newPage();
        await page.goto(o.url, { waitUntil: 'load' });
        await page.waitForSelector('[data-cell]', { timeout: 20000 });
        await page.waitForTimeout(400);
        const m = await page.evaluate(measureInPage);
        await ctx.close();
        const ok = m.cells > 0 && m.over <= 0.5 && !m.pageScrollsSideways;
        if (!ok) fail++;
        console.log(
          `${ok ? 'ok  ' : 'FAIL'} width ${w}${px !== null ? ` text ${px}px` : ''}: ${m.cells} cells, pad ${m.padPx}px, ` +
          `worst overflow ${m.over.toFixed(1)}px at ${m.worst}, page sideways scroll ${m.pageScrollsSideways}`
        );
      }
    }
  } finally {
    await browser.close();
  }
  console.log(fail === 0 ? 'ALL OK' : `FAILURES: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

await main();
