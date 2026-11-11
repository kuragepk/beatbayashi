// ui16 contact sheet (2026-10-03, new). Reads the ui16 Recensio boards (read-back, not the ASCII) and draws every
// icon at 1x, 2x and 4x on the app's dark theme (default tokens: bg #0a0a0a, text #ffffff, accent #0f8a80) and on
// the light "artistic" kit theme (surface #fbf8f2, text #1a1a1a, accent #c8321c). No new colours.
// Usage: node render_sheet.mjs [--recensio <dir>] [--out <dir>] (path options: paths.mjs)
import { readFileSync, writeFileSync } from 'node:fs';
import { loadRecensio, outDir } from './paths.mjs';
import { SHADES } from './ramp.mjs';

const { normalizeBoard, getPanel, encodePanelPng } = await loadRecensio();
const OUT = outDir(); // the folder make_ui16.mjs wrote to (--out / UI16_OUT / BEATBAYASHI_OUT_DIR)
const runs = JSON.parse(readFileSync(`${OUT}/icons.runs.json`, 'utf8'));
const boards = {};
for (const b of [...new Set(Object.values(runs).map((r) => r.board))]) boards[b] = normalizeBoard(JSON.parse(readFileSync(`${OUT}/${b}.board.json`, 'utf8')));
const PAL = ['#1a1a1a', '#ffffff', '#0a0a0a', '#ffffff', '#0f8a80', '#fbf8f2', '#1a1a1a', '#c8321c', ...SHADES.flat()].map((hex) => ({ hex })); // 8..12: asagi ramp (2026-10-06)
const F = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111', '-': '000000111000000', 1: '010110010010111', 2: '110001010100111', 4: '101101111001001', 6: '011100111101010', ' ': '000000000000000' };
const names = Object.keys(runs);
const COLS = 3, ROWS = Math.ceil(names.length / COLS), S = 2; // label font scale
const block = 8 + 16 + 8 + 32 + 8 + 64 + 8; // one theme block
const cellW = 2 * block + 16, cellH = 22 + 64 + 8, pad = 16;
const W = pad + COLS * (cellW + pad), H = pad + 30 + ROWS * (cellH + pad);
const pix = new Array(W * H).fill(0);
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) pix[y * W + x] = c; };
const text = (s, x0, y0) => { let x = x0; for (const ch of s.toUpperCase()) { const g = F[ch] ?? F[' ']; for (let i = 0; i < 15; i++) if (g[i] === '1') for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) set(x + (i % 3) * S + dx, y0 + Math.floor(i / 3) * S + dy, 1); x += 4 * S; } };
text('UI16 - 1X 2X 4X - DARK THEME - LIGHT THEME', pad, pad);
names.forEach((n, i) => {
  const cx = pad + (i % COLS) * (cellW + pad), cy = pad + 30 + Math.floor(i / COLS) * (cellH + pad);
  text(n, cx, cy);
  const p = getPanel(boards[runs[n].board], runs[n].panelId);
  [[2, 3, 4], [5, 6, 7]].forEach(([bg, fg, ac], t) => {
    const bx = cx + t * (block + 16), by = cy + 22;
    for (let y = 0; y < 64 + 16; y++) for (let x = 0; x < block; x++) set(bx + x, by + y - 8, bg);
    let ox = bx + 8;
    for (const sc of [1, 2, 4]) {
      const oy = by + (64 - 16 * sc) / 2;
      for (let y = 0; y < 16 * sc; y++) for (let x = 0; x < 16 * sc; x++) {
        const v = p.pixels[Math.floor(y / sc) * 16 + Math.floor(x / sc)];
        if (v >= 0) set(ox + x, oy + y, v === 0 ? fg : v === 1 ? ac : 6 + v);
      }
      ox += 16 * sc + 8;
    }
  });
});
writeFileSync(`${OUT}/contact_sheet_ui16.png`, encodePanelPng({ w: W, h: H, pixels: pix }, PAL, 1));
console.log('sheet', W, H);
