// Label icon contact sheet (2026-10-06, new). Every icon named in ../labelIcons.ts (new label icons and reused
// ui16 ones), labelled with its icon name, at 1x and 4x on the app's dark theme (bg #0a0a0a, text #ffffff,
// accent #0f8a80), plus the asagi ramp swatches. Reads the boards make_ui16.mjs wrote (read-back, not the ASCII).
// v2 (2026-10-06, warm recolour): all four hue ramps; with --before <dir> (an older make_ui16 --out folder) each
// cell also shows that version at 4x, left of the current one.
// Usage: node render_label_sheet.mjs [--recensio <dir>] [--out <dir>] [--sheet <png path>] [--before <dir>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRecensio, outDir, argValue } from './paths.mjs';
import { HUES, SHADES } from './ramp.mjs';
import { LABEL_ICONS } from './icons16-labels.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { normalizeBoard, getPanel, encodePanelPng } = await loadRecensio();
const OUT = outDir();
const SHEET = resolve(argValue('--sheet') || join(HERE, '../../../.out/shots/label_icons_sheet.png'));
const runs = JSON.parse(readFileSync(`${OUT}/icons.runs.json`, 'utf8'));
const boards = {};
for (const b of new Set(Object.values(runs).map((r) => r.board))) boards[b] = normalizeBoard(JSON.parse(readFileSync(`${OUT}/${b}.board.json`, 'utf8')));
const mapSrc = readFileSync(join(HERE, '../labelIcons.ts'), 'utf8');
const used = [...new Set([...mapSrc.matchAll(/^\s+\w+: '([a-z0-9-]+)',/gm)].map((m) => m[1]))];
const names = [...used.filter((n) => n in LABEL_ICONS), ...used.filter((n) => !(n in LABEL_ICONS))];
// 0 bg, 1 text, 2 accent, 3 dim label (reused), 4.. ramp
const PAL = ['#0a0a0a', '#ffffff', '#0f8a80', '#9a9a9a', ...SHADES.flat()].map((hex) => ({ hex }));
const BEFORE = argValue('--before') && resolve(argValue('--before'));
const old = BEFORE ? JSON.parse(readFileSync(`${BEFORE}/icons.runs.json`, 'utf8')) : null;
const oldBoards = {};
if (old) for (const b of new Set(Object.values(old).map((r) => r.board))) oldBoards[b] = normalizeBoard(JSON.parse(readFileSync(`${BEFORE}/${b}.board.json`, 'utf8')));
// the v1 boards had only the asagi ramp at indices 2..6, so their indices map onto the same palette slots
const F = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111', '-': '000000111000000', '*': '000101010101000', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110', 6: '011100111101010', ' ': '000000000000000' };
const COLS = 4, cellW = 200, cellH = 96, pad = 16, top = 40 + HUES.length * 32;
const W = pad + COLS * (cellW + pad), H = top + Math.ceil(names.length / COLS) * (cellH + pad) + pad;
const pix = new Array(W * H).fill(0);
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) pix[y * W + x] = c; };
const text = (s, x0, y0, c = 1) => { let x = x0; for (const ch of s.toUpperCase()) { const g = F[ch] ?? F[' ']; for (let i = 0; i < 15; i++) if (g[i] === '1') for (let d = 0; d < 4; d++) set(x + (i % 3) * 2 + (d & 1), y0 + Math.floor(i / 3) * 2 + (d >> 1), c); x += 8; } };
text(`LABEL ICONS - ${names.length} - 1X 4X${old ? ' - BEFORE 4X LEFT' : ''} - * NEW`, pad, pad);
HUES.forEach((h, k) => {
  text(`${h} 1-5`, pad, 40 + k * 32 + 6);
  for (let i = 0; i < 5; i++) for (let y = 0; y < 24; y++) for (let x = 0; x < 40; x++) set(140 + i * 48 + x, 40 + k * 32 + y, 4 + k * 5 + i);
});
names.forEach((n, i) => {
  const cx = pad + (i % COLS) * (cellW + pad), cy = top + Math.floor(i / COLS) * (cellH + pad);
  const isNew = n in LABEL_ICONS;
  text((isNew ? '*' : '') + n, cx, cy, isNew ? 1 : 3);
  const p = getPanel(boards[runs[n].board], runs[n].panelId);
  const draw = (q, sc, ox) => { for (let y = 0; y < 16 * sc; y++) for (let x = 0; x < 16 * sc; x++) {
    const v = q.pixels[Math.floor(y / sc) * 16 + Math.floor(x / sc)];
    if (v >= 0) set(cx + ox + x, cy + 20 + (sc === 1 ? 24 : 0) + y, v === 0 ? 1 : v === 1 ? 2 : 2 + v);
  } };
  if (old && old[n]) { draw(getPanel(oldBoards[old[n].board], old[n].panelId), 4, 30); draw(p, 1, 104); draw(p, 4, 128); return; }
  for (const [sc, ox] of [[1, 8], [4, 40]]) for (let y = 0; y < 16 * sc; y++) for (let x = 0; x < 16 * sc; x++) {
    const v = p.pixels[Math.floor(y / sc) * 16 + Math.floor(x / sc)];
    if (v >= 0) set(cx + ox + x, cy + 20 + (sc === 1 ? 24 : 0) + y, v === 0 ? 1 : v === 1 ? 2 : 2 + v);
  }
});
mkdirSync(dirname(SHEET), { recursive: true });
writeFileSync(SHEET, encodePanelPng({ w: W, h: H, pixels: pix }, PAL, 1));
console.log('sheet', names.length, W, H, SHEET);
