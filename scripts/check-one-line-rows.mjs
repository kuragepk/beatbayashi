#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

/**
 * Real-browser check of the one-line rows (owner request 2026-10-06): the
 * PLAY/transport row and every Rhythm Presets row keep their items on one
 * line, without spilling past the row, at 360/600/1280/1920 px and at 8 and
 * 48 px text. A row passes when no item starts below the bottom of the row's
 * first item (an item may itself take two lines, e.g. a preset label) and
 * the row has no horizontal overflow; the page must not overflow either.
 *
 *   node scripts/check-one-line-rows.mjs --url http://127.0.0.1:4173/
 *        [--widths 360,600,1280,1920] [--px 8,48] [--shots <dir>] [--playwright <module dir>]
 *
 * --shots writes page.screenshot() images (the page only, never the desktop).
 * Requests to any host other than 127.0.0.1 are aborted.
 * Exit: 0 pass, 1 a row failed, 2 could not run.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = opt('url', 'http://127.0.0.1:4173/');
const widths = opt('widths', '360,600,1280,1920').split(',').map(Number);
const pxs = opt('px', '8,48').split(',').map(Number);
const shots = opt('shots', null);
// UI languages to check (the app follows the browser language on a first visit).
const langs = opt('langs', 'en,ja,ar').split(',');
const pwPath = opt('playwright', process.env.SMOKE_PLAYWRIGHT_MODULE ?? 'playwright');

let chromium;
try {
  ({ chromium } = require(pwPath));
} catch (e) {
  console.error(`[one-line] could not load Playwright from ${pwPath}: ${e.message}`);
  process.exit(2);
}
if (new URL(url).hostname !== '127.0.0.1') {
  console.error('[one-line] --url must be on 127.0.0.1');
  process.exit(2);
}

const browser = await chromium.launch();
let failures = 0;
try {
  for (const lang of langs) {
  for (const width of widths) {
    for (const px of pxs) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: lang });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()
      );
      await context.addInitScript((textPx) => {
        try {
          const key = 'bb-ui-settings-v1';
          const doc = JSON.parse(localStorage.getItem(key) || '{}');
          localStorage.setItem(key, JSON.stringify({ ...doc, schema_minor: 1, text_px: textPx }));
        } catch {
          /* storage blocked: default text size */
        }
      }, px);
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="transport-row"]');
      await page.waitForTimeout(300);
      const result = await page.evaluate(() => {
        const rows = [
          ...document.querySelectorAll('[data-testid="transport-row"], [data-testid="preset-row"]'),
        ];
        const bad = [];
        rows.forEach((row, i) => {
          const items = [...row.children].filter((c) => c.getBoundingClientRect().width > 0);
          if (items.length === 0) return;
          const firstBottom = Math.min(...items.map((c) => c.getBoundingClientRect().bottom));
          const wrapped = items.some((c) => c.getBoundingClientRect().top >= firstBottom - 1);
          const overflow = row.scrollWidth > row.clientWidth + 1;
          if (wrapped || overflow) {
            bad.push({ row: row.getAttribute('data-testid'), index: i, wrapped, overflow });
          }
        });
        const pageOverflow =
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        const iconOnly = document
          .querySelector('[data-testid="transport-row"]')
          ?.getAttribute('data-icon-only');
        // Owner 2026-10-06: stacked labels with icons start their text in
        // one column (±1 px): lane names, and preset genre rows.
        const startX = (els) =>
          els.map((el) => el.getBoundingClientRect().left).filter((x) => Number.isFinite(x));
        const laneText = [...document.querySelectorAll('[data-testid="lane-row"] [data-testid="label-icon-box"]')]
          .map((box) => box.nextSibling)
          .filter((n) => n && n.nodeType === 3)
          .map((n) => {
            const r = document.createRange();
            r.selectNodeContents(n);
            return r.getBoundingClientRect().left;
          });
        // Genre rows only (the icon box sits directly in the row's label),
        // grouped by the CSS column the row is in.
        const byColumn = {};
        document
          .querySelectorAll('[data-testid="preset-row"] > label > [data-testid="label-icon-box"]')
          .forEach((box) => {
            const r = document.createRange();
            r.setStartAfter(box);
            r.setEndAfter(box.parentElement.lastChild);
            const col = Math.round(box.closest('[data-testid="preset-row"]').getBoundingClientRect().left);
            (byColumn[col] ??= []).push(r.getBoundingClientRect().left);
          });
        const presetGroups = Object.values(byColumn);
        const presetText = presetGroups.flat();
        const spread = (xs) => (xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs));
        if (spread(laneText) > 1) bad.push({ row: 'lane names', textStartX: laneText });
        presetGroups.forEach((xs) => {
          if (spread(xs) > 1) bad.push({ row: 'preset genres', textStartX: xs });
        });
        void startX;
        // Audit metrics (2026-10-06).
        // vGap: the first sub row touches the main row in every lane.
        const vGaps = [...document.querySelectorAll('[data-testid="lane-steps"]')].map((g) => {
          const m = g.querySelector('[data-testid="main-step"]').getBoundingClientRect();
          const sb = g.querySelector('[data-testid="sub-step"]').getBoundingClientRect();
          return Math.round((sb.top - m.bottom) * 10) / 10;
        });
        if (vGaps.some((v) => Math.abs(v) > 1)) bad.push({ row: 'main/sub touch', vGaps });
        // Lane gap: 2-4 px between instruments (lane-sounds rows closed).
        const laneRows = [...document.querySelectorAll('[data-testid="lane-row"]')].map((r) => r.getBoundingClientRect());
        const laneGaps = laneRows.slice(1).map((r, i) => Math.round((r.top - laneRows[i].bottom) * 10) / 10);
        if (laneGaps.some((g) => g < 1.5 || g > 4.5)) bad.push({ row: 'instrument gaps', laneGaps });
        // Icon boxes: one width per group (lanes; everything else).
        const boxW = (sel) => [...new Set([...document.querySelectorAll(sel)].map((b) => Math.round(b.getBoundingClientRect().width)))];
        const laneIconW = boxW('[data-testid="lane-row"] [data-testid="label-icon-box"]');
        const otherIconW = [...new Set([...document.querySelectorAll('[data-testid="label-icon-box"]')]
          .filter((b) => !b.closest('[data-testid="lane-row"]'))
          .map((b) => Math.round(b.getBoundingClientRect().width)))];
        // Label frame never taller than its pad unit (owner 2026-10-06, A).
        document.querySelectorAll('[data-testid="lane-row"]').forEach((row) => {
          const lbl = row.querySelector('[data-testid="lane-label"]').getBoundingClientRect();
          const steps = row.querySelector('[data-testid="lane-steps"]').getBoundingClientRect();
          if (lbl.height > steps.height + 1) bad.push({ row: 'label taller than unit', label: lbl.height, unit: steps.height });
        });
        if (laneIconW.length > 1) bad.push({ row: 'lane icon widths', laneIconW });
        if (otherIconW.length > 1) bad.push({ row: 'label icon widths', otherIconW });
        const pageWidth = document.documentElement.scrollWidth;
        // Add-lane row (owner 2026-10-06): starts at the label column's left
        // edge and is about one small button tall when it fits on one line.
        const addRow = document.querySelector('[data-testid="add-lane-row"]');
        const firstLane = document.querySelector('[data-testid="lane-row"]');
        if (addRow && firstLane) {
          const ar = addRow.getBoundingClientRect();
          const btn = addRow.querySelector('button');
          const tops = [...addRow.children].map((c) => c.getBoundingClientRect().top);
          const oneLine = Math.max(...tops) - Math.min(...tops) < 4;
          const tallest = Math.max(...[...addRow.children].map((c) => c.getBoundingClientRect().height));
          if (Math.abs(ar.left - firstLane.getBoundingClientRect().left) > 1) bad.push({ row: 'add-lane left edge', addLeft: ar.left });
          if (oneLine && ar.height > tallest + 4) bad.push({ row: 'add-lane height', h: ar.height });
        }
        // Lane label columns (owner 2026-10-06): every column at one x in
        // every lane, and M and S on one row.
        const colX = {};
        document.querySelectorAll('[data-testid="lane-label-head"] > [data-col], [data-testid="lane-label-layer"] > [data-col]').forEach((el) => {
          const kind = el.parentElement.getAttribute('data-testid') + ':' + el.getAttribute('data-col');
          (colX[kind] ??= []).push(Math.round(el.getBoundingClientRect().left));
        });
        const colSpread = Object.fromEntries(
          Object.entries(colX).map(([k, xs]) => [k, Math.max(...xs) - Math.min(...xs)])
        );
        if (Object.values(colSpread).some((d) => d > 1)) bad.push({ row: 'label columns', colX });
        document.querySelectorAll('[data-testid="lane-label-head"]').forEach((h) => {
          const m = h.querySelector('[data-col="m"]');
          const so = h.querySelector('[data-col="s"]');
          if (m && so && Math.abs(m.getBoundingClientRect().top - so.getBoundingClientRect().top) > 1) {
            bad.push({ row: 'M/S on one row', lane: h.textContent });
          }
        });
        // Pads stay usable (owner 2026-10-06): >= 16 px wide.
        const padWidths = [...document.querySelectorAll('[data-testid="main-step"]')].map(
          (b) => b.getBoundingClientRect().width
        );
        const minPad = padWidths.length ? Math.min(...padWidths) : 0;
        if (minPad < 15.5) bad.push({ row: 'pads', minPad });
        return { rows: rows.length, bad, pageOverflow, iconOnly, aligned: [laneText.length, presetText.length], minPad, vGaps, laneGaps, laneIconW, otherIconW, pageWidth };
      });
      const ok = result.bad.length === 0 && !result.pageOverflow && result.rows > 1;
      if (!ok) failures++;
      console.log(
        `${ok ? 'ok  ' : 'FAIL'} ${lang} ${width}px text=${px}px rows=${result.rows} iconOnly=${result.iconOnly} ` +
          `aligned=${result.aligned} minPad=${result.minPad} vGap=${result.vGaps} laneGap=${result.laneGaps} icon=${result.laneIconW}/${result.otherIconW} pageW=${result.pageWidth} pageOverflow=${result.pageOverflow}${result.bad.length ? ' ' + JSON.stringify(result.bad) : ''}`
      );
      if (shots) {
        mkdirSync(shots, { recursive: true });
        await page.screenshot({
          path: path.join(shots, `one-line-${lang}-${width}-text${px}.png`),
          fullPage: true,
        });
      }
      await context.close();
    }
  }
  }
} finally {
  await browser.close();
}
console.log(failures ? `FAILURES: ${failures}` : 'ALL OK');
process.exit(failures ? 1 : 0);
