// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Five proposals built on D5 "only the lights" (owner 2026-10-19: D5 chosen; "but there is no
// taiko in the centre of D5; five proposals based on D5"). Every one keeps what the owner praised:
// the two figures slipping off at the left edge, the asagi willow firework at the upper right,
// the empty upper left, structures in the darkest grey and only lights lit. New: the stage shows
// the three instruments with the taiko in the centre (wood block left, drum kit right).
//
//   node src/pixel-art/source/make_matsuri_d5.mjs [--out <dir>] [--recensio <dir>] [--no-board]
//
// Colours: only the UI palette (allowed-colors.txt and the theme's yellow, orange, asagi ramps).

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Raster, Palette, rng, figure, lantern, lanternString, firework, fireworkTrail, yagura, taiko, drumKit, stall, cat, woodBlock } from './matsuri_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../../..');
const argValue = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const SET = argValue('--set') || 'd5';
const OUT = resolve(argValue('--out') || process.env.MATSURI_OUT || join(APP, '.out', SET === 'd5b' ? 'matsuri-beat-d5b' : 'matsuri-beat-d5'));
mkdirSync(OUT, { recursive: true });
function findRecensio() {
  const given = argValue('--recensio') || process.env.RECENSIO_DIR;
  if (given) return given;
  for (let d = HERE; ; d = dirname(d)) {
    const c = join(d, 'projects', 'recensio');
    if (existsSync(join(c, 'core', 'board.mjs'))) return c;
    if (dirname(d) === d) return undefined;
  }
}
const RECENSIO = findRecensio();
const url = (f) => pathToFileURL(join(resolve(RECENSIO), 'core', f)).href;
const R = { ...(await import(url('board.mjs'))), ...(await import(url('png.mjs'))) };

const HEX = {
  bg: '#0a0a0a', ink: '#f0f0f0', grey: '#999999', grey2: '#666666', grey3: '#4a4a4a', dim: '#333333', faint: '#1a1a1a', night: '#161616',
  asagi: '#3fc1b0', asagiD: '#0f8a80', asagiF: '#073e3a',
  yellow: '#ffde00', yellowS: '#e2d5a7', yellowM: '#c0a351', yellowD: '#44350f',
  orange: '#ffb066', orangeM: '#a66f30', orangeD: '#4a3216',
};

function themes(P) {
  const c = {}; for (const [k, v] of Object.entries(HEX)) c[k] = P.add(k, v);
  const base = {
    bg: c.bg, lineDim: c.grey2, eye: c.asagi, skin: c.bg, aiHead: c.bg, happi: c.bg, obi: c.asagiD, pole: c.dim, string: c.faint,
    lanternStripe: c.orangeM, lanternHi: c.yellowS, bulb: c.yellow, bulbCord: c.dim, water: c.asagi, goldfish: c.orange, groundLit: c.orangeD, spot: c.night, c,
  };
  // structures: darkest grey only
  const dimT = { ...base, line: c.dim, white: c.dim, red: c.dim, wood: c.dim, woodLight: c.dim, roof: c.dim, metal: c.dim, barrel: c.dim, barrelDark: c.dim, kitBass: c.dim, kitSnare: c.dim, kitTom: c.dim, cymbal: c.dim, woodBlock: c.dim, treeSil: c.night };
  dimT.lanterns = [c.orange, c.yellowS, c.orange, c.yellow];
  const S = (k) => ({ awn: c.dim, awn2: ['jp', 'us', 'uk'].includes(k) ? c.faint : null, inner: c.bg, counter: c.bg, goodA: c.orange, goodB: c.asagi, apron: c.bg, sign: null });
  dimT.stall = Object.fromEntries(['jp', 'cn', 'tw', 'kr', 'us', 'uk'].map((k) => [k, S(k)]));
  dimT.cloths = [c.bg];
  // instruments under the stage light: ink outline, lit drum face, brass cymbal, grey wood
  const litT = { ...base, line: c.ink, white: c.yellowS, wood: c.grey2, woodLight: c.grey, metal: c.grey2, barrel: c.grey2, barrelDark: c.dim, kitBass: c.dim, kitSnare: c.grey, kitTom: c.dim, cymbal: c.yellowM, woodBlock: c.grey, lanternHi: c.yellowS };
  return { c, dimT, litT };
}

function halo(r, cx, cy, rad, inner, outer, bg, over = []) {
  for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
    const d = Math.sqrt(x * x + y * y), v = r.get(cx + x, cy + y);
    if (d > rad || (v !== bg && !over.includes(v)) || ((cx + x + cy + y) & 1)) continue;
    r.set(cx + x, cy + y, d < rad * 0.55 ? inner : outer);
  }
}
function litLantern(r, x, y, T, { size = 'S', body, glow = 5 } = {}) {
  const c = T.c;
  halo(r, x, y + 5, glow, c.orangeD, c.yellowD, c.bg);
  lantern(r, x, y, T, { size, body: body ?? c.orange, stripe: c.orangeM, cap: c.dim, hi: c.yellowS });
}

/** The two at the left edge, apart from the ring: kept from D5 exactly (owner's favourite detail). */
function twoAtTheEdge(r, x, feetY, c, { h = 16, col, headStyle = 'ring' } = {}) {
  const L = col ?? c.grey2, top = feetY - h, gap = Math.round(h * 0.75);
  figure(r, x, top, { kind: 'human', pose: 'idle', h, lineOnly: true, headStyle, c: { line: L, eye: c.asagi } }); r.set(x + 3, top - 1, L);
  figure(r, x + gap, top, { kind: 'ai', pose: 'phone', h, lineOnly: true, c: { line: L, eye: c.asagi } });
  const rh = h >= 14 ? 2 : 1, al = Math.max(3, Math.round(h * 0.28));
  r.set(x + gap + al, top + 2 * rh + 1, c.asagi); // the phone screen, filming the fireworks
}

/** Stage with the taiko in the centre, wood block on the left, drum kit on the right. */
function stageThree(r, Y, litT, c, { taikoGlow = false, headStyle = 'ring' } = {}) {
  const sy = Y.stageY, cx = (Y.ux0 + Y.ux1) >> 1;
  for (let j = 0; j < 24; j++) r.hline(cx - 1 - (j >> 2), cx + 1 + (j >> 2), Y.roofY + 12 + j, c.yellowD); // warm spotlight on the taiko
  // taiko: barrel x..x+10, face disc centred at x+13
  const tx = cx - 9;
  taiko(r, tx, sy - 18, taikoGlow ? { ...litT, white: c.yellow } : litT);
  if (taikoGlow) { // the drum face is the light: glow over the spotlight and down onto the curtain and the ground
    halo(r, tx + 13, sy - 11, 26, c.orangeD, c.yellowD, c.bg, [c.yellowD]);
    for (let y = sy + 2; y < sy + 60; y += 2) for (let x = cx - 40 + ((y >> 1) & 1); x < cx + 40; x += 4) if (r.get(x, y) === c.bg) r.set(x, y, y < sy + 30 ? c.yellowD : c.orangeD);
    r.disc(tx + 13, sy - 11, 2, c.ink);
  }
  figure(r, tx - 4, sy - 16, { kind: 'human', pose: 'drum', h: 16, lineOnly: true, headStyle, c: { line: c.ink, eye: c.asagi } });
  // wood block, left
  woodBlock(r, Y.ux0 + 7, sy - 10, litT);
  figure(r, Y.ux0 + 4, sy - 16, { kind: 'aiDiamond', pose: 'drum', h: 16, lineOnly: true, c: { line: c.ink, eye: c.asagi } });
  r.set(Y.ux0 + 19, sy - 13, c.yellow); r.set(Y.ux0 + 20, sy - 15, c.yellow);
  // drum kit, right
  drumKit(r, Y.ux1 - 30, sy - 17, litT);
  figure(r, Y.ux1 - 6, sy - 16, { kind: 'ai', pose: 'drumKit', h: 16, flip: true, lineOnly: true, c: { line: c.ink, eye: c.asagi } });
  return { faceX: tx + 13, faceY: sy - 11 };
}

function ring(r, cx, cy, c, { rings = [[70, 12, 18, 0.2], [108, 22, 22, 0.5]], hideHalf = 46, litR = 100, front = true, back = true, big = 16, small = 12, headStyle = 'ring' }) {
  const people = [];
  for (const [rx, ry, n, off] of rings) for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + off; people.push([Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), i, Math.sin(a), rx]); }
  people.sort((p, q) => p[1] - q[1]);
  for (const [x, y, i, s, rx] of people) {
    if (s < 0 && !back) continue; if (s >= 0 && !front) continue;
    if (s < 0 && Math.abs(x - cx) < hideHalf) continue; // behind the yagura
    const lit = rx < litR && s > -0.2; const h = s > 0.3 ? big : small;
    figure(r, x, y - h, { kind: ['human', 'ai', 'human', 'aiScreen'][i % 4], pose: ['up', 'oneUp', 'wave', 'up'][i % 4], h, lineOnly: true, headStyle, flip: i % 2 === 0, c: { line: lit ? c.ink : c.grey2, eye: c.asagi } });
  }
}

/** The D5 scene, parameterised. */
function scene({ W = 480, H = 270, cx = 330, G = 230, yw = 108, yh = 110, seed = 55, taikoGlow = false, ripples = false, closeUp = false, edgeX = 92, edge = null, headStyle = 'ring', nearLantern = true, stalls = [[150, 'jp'], [200, 'tw'], [420, 'uk']], strings = null, fw = [400, 46, 34] } = {}) {
  const P = new Palette(); const { c, dimT, litT } = themes(P);
  const r = new Raster(W, H, c.bg); const rngf = rng(seed);
  // fireworks: the asagi willow at the upper right (reads a little like a jellyfish), one small yellow
  firework(r, fw[0], fw[1], fw[2], c.asagi, { rays: 18, kind: 'willow', c2: c.ink });
  firework(r, fw[0] - 70, Math.max(16, fw[1] - 16), 12, c.yellowM, { rays: 16, kind: 'dots', c2: c.yellow });
  fireworkTrail(r, fw[0], G - 80, fw[1] + 34, c.asagiF);
  for (const [x, k] of stalls) stall(r, x, G - 34, dimT, k, { w: 44, h: 28, rngf });
  const Y = yagura(r, cx, G, dimT, { w: yw, h: yh, curtain: 'outline', eaveLanterns: false });
  for (let x = Y.ux0 + 3; x <= Y.ux1 - 3; x += 6) litLantern(r, x, Y.roofY + 6, dimT, { body: dimT.lanterns[(x >> 1) % 4], glow: 4 });
  const rx1 = Math.round(yw * 0.66), rx2 = Math.round(yw * 1.02);
  const ringOpt = { headStyle, rings: [[rx1, closeUp ? 16 : 12, 18, 0.2], [rx2, closeUp ? 30 : 22, 22, 0.5]], hideHalf: (yw >> 1) - 8, litR: rx2 - 4, big: closeUp ? 20 : 16, small: closeUp ? 14 : 12 };
  ring(r, cx, G + 2, c, { ...ringOpt, front: false });
  const face = stageThree(r, Y, litT, c, { taikoGlow, headStyle });
  if (ripples) { // the beat spreading from the taiko face: dotted arcs on the upper side only, fading out
    [[30, c.asagi], [50, c.asagiD], [72, c.asagiD], [96, c.asagiF]].forEach(([rad, col], k) => {
      for (let t = 0; t < 1; t += 1 / (rad * 4)) {
        const a = Math.PI * (1.12 + 0.76 * t); const x = Math.round(face.faceX + Math.cos(a) * rad), y = Math.round(face.faceY + Math.sin(a) * rad * 0.75);
        if (((x + k) & 1) === 0 && (r.get(x, y) === c.bg || r.get(x, y) === c.yellowD)) r.set(x, y, col);
      }
    });
  }
  // lantern strings reaching left, where they fade
  for (const [px, py] of strings ?? [[40, G - 70], [140, G - 80], [W - 8, G - 70]]) {
    const pts = lanternString(r, px < cx ? Y.ux0 - 6 : Y.ux1 + 6, Y.roofY + 2, px, py, 18, c.faint, 14, px % 5);
    pts.forEach(([x, y], k) => { const far = x < W * 0.31; litLantern(r, x, y, dimT, { body: far ? c.orangeM : dimT.lanterns[k % 4], glow: far ? 3 : 5 }); });
  }
  ring(r, cx, G + 2, c, { ...ringOpt, back: false });
  if (edge) twoAtTheEdge(r, edge.x, edge.feetY, c, { h: edge.h, col: c[edge.col], headStyle }); else twoAtTheEdge(r, edgeX, G - 16, c, { headStyle });
  cat(r, Math.round(W * 0.48), G + 4, c.grey2, c.orange);
  // the nearest lantern, large, at the lower right
  if (nearLantern) { r.vline(W - 28, G - 34, G - 16, c.dim); litLantern(r, W - 28, G - 16, dimT, { size: 'L', body: c.orange, glow: 14 }); }
  return { P, r };
}

const D5B = { cx: 330, G: 252, yw: 150, yh: 160, closeUp: true, stalls: [[120, 'jp'], [168, 'tw']], fw: [420, 40, 32], seed: 56 };
// The two at the edge for the D5b refinements (owner 2026-10-19): as tall as the ring's front dancers (20 px),
// low in the lower left, below and left of where the lanterns and lights end.
const EDGE_B = { x: 24, feetY: 266, h: 20 };
const proposalsD5 = [
  { id: 'D5a_sansha', title: 'D5a 三者の太鼓', note: 'D5 with the three instruments on the stage, taiko in the centre under the light', ...scene({}) },
  { id: 'D5b_yoru_no_yagura', title: 'D5b 寄ったやぐら', note: 'closer: a larger yagura so the taiko, kit and wood block read; the ring crops at the bottom', ...scene(D5B) },
  { id: 'D5c_taiko_no_hi', title: 'D5c 太鼓の灯', note: 'the taiko face is itself a light: a warm glow around the drum, everything else stays dim', ...scene({ taikoGlow: true, seed: 57 }) },
  { id: 'D5d_obi', title: 'D5d 横長の帯', note: '21:9 (630x270): a strip along the bottom; more dark room on the left for the two at the edge', ...scene({ W: 630, cx: 470, edgeX: 120, stalls: [[220, 'jp'], [270, 'tw'], [320, 'cn'], [570, 'uk']], strings: [[60, 160], [200, 150], [622, 160]], fw: [560, 46, 34], seed: 58 }) },
  { id: 'D5e_hibiki', title: 'D5e 響き', note: 'the beat drawn as faint asagi arcs spreading from the taiko; nothing else added', ...scene({ ripples: true, seed: 59 }) },
];
// D5b refinements (owner 2026-10-19): the two moved to the lower left at the ring's height; human heads
// either filled or a round outline (instead of the ring whose inside reads as a plus); the two either
// the same grey as the outer ring (#666666) or one step darker (#4a4a4a, the next grey in the UI list).
const proposalsD5b = [
  { id: 'D5b0_current', title: 'D5b そのまま', note: 'D5b as shown before, for comparison', ...scene(D5B) },
  { id: 'D5b1_filled_same', title: 'D5b 白丸の頭・二人は外側と同じ灰', note: 'heads filled; the two in #666666 at the lower left', ...scene({ ...D5B, headStyle: 'filled', edge: { ...EDGE_B, col: 'grey2' } }) },
  { id: 'D5b2_filled_darker', title: 'D5b 白丸の頭・二人は一段暗い灰', note: 'heads filled; the two in #4a4a4a at the lower left', ...scene({ ...D5B, headStyle: 'filled', edge: { ...EDGE_B, col: 'grey3' } }) },
  { id: 'D5b3_outline_same', title: 'D5b 輪郭の頭・二人は外側と同じ灰', note: 'heads as a round outline; the two in #666666 at the lower left', ...scene({ ...D5B, headStyle: 'outline', edge: { ...EDGE_B, col: 'grey2' } }) },
  { id: 'D5b4_outline_darker', title: 'D5b 輪郭の頭・二人は一段暗い灰', note: 'heads as a round outline; the two in #4a4a4a at the lower left', ...scene({ ...D5B, headStyle: 'outline', edge: { ...EDGE_B, col: 'grey3' } }) },
  // Final (owner 2026-10-19): filled heads, the two one step darker, and no large lantern at the lower right.
  { id: 'D5b5_final', title: 'D5b 決定（白丸・一段暗い二人・右下の提灯なし）', note: 'final: filled heads, the two in #4a4a4a, no large lantern at the lower right', ...scene({ ...D5B, headStyle: 'filled', edge: { ...EDGE_B, col: 'grey3' }, nearLantern: false }) },
];
const proposals = SET === 'd5b' ? proposalsD5b : proposalsD5;

const summary = [];
for (const p of proposals) {
  const panel = p.r.toPanel(); const colors = p.P.colors;
  writeFileSync(join(OUT, `${p.id}.png`), R.encodePanelPng(panel, colors, 1));
  writeFileSync(join(OUT, `${p.id}_2x.png`), R.encodePanelPng(panel, colors, 2));
  let boardNote = 'board: skipped (--no-board)';
  if (!process.argv.includes('--no-board')) {
    try {
      const board = R.createBoard({ name: `beatbayashi-matsuri-${p.id}`, w: panel.w, h: panel.h, panels: 1 });
      colors.forEach((col, index) => R.applyOp(board, index < board.palette.colors.length ? 'palette_set' : 'palette_add', { index, hex: col.hex, name: col.name }));
      const id = board.panels[0].id; const META = { client: 'make_matsuri_d5.mjs', model: 'claude-opus-5-5' };
      R.applyOp(board, 'set_panel_meta', { panelId: id, title: p.title, note: p.note }, 'llm', META);
      const pts = []; for (let y = 0; y < panel.h; y++) for (let x = 0; x < panel.w; x++) { const v = panel.pixels[y * panel.w + x]; if (v >= 0) pts.push([x, y, v]); }
      for (let i = 0; i < pts.length; i += 4000) R.applyOp(board, 'draw_pixels', { panelId: id, points: pts.slice(i, i + 4000) }, 'llm', META);
      const ser = R.serializeBoard(board);
      writeFileSync(join(OUT, `${p.id}.board.json`), JSON.stringify(ser));
      writeFileSync(join(OUT, `${p.id}.disclosure.json`), JSON.stringify(R.buildDisclosure(board), null, 1));
      const bp = R.getPanel(R.normalizeBoard(JSON.parse(JSON.stringify(ser))), id);
      let same = bp.w === panel.w && bp.h === panel.h; for (let i = 0; same && i < bp.pixels.length; i++) if (bp.pixels[i] !== panel.pixels[i]) same = false;
      boardNote = `board: ${bp.w}x${bp.h}, provenance=${R.panelLabel(bp)}, round-trip ${same ? 'identical' : 'DIFFERS'}`;
    } catch (e) { boardNote = `board: FAILED (${e.message})`; }
  }
  const line = `${p.id}: ${panel.w}x${panel.h}, ${colors.length} colours; ${boardNote}`; summary.push(line); console.log(line);
}
writeFileSync(join(OUT, 'SUMMARY.txt'), summary.join('\n') + '\n');

// --emit-asset <dir> (set d5b): the chosen picture for the app background, with the night colour left
// transparent so it sits on any dark theme surface. It is drawn as its own Recensio board in which the
// background pixels are never drawn, and the PNG is encoded from that board, so the shipped pixels and
// their provenance (all llm) are the same thing. Writes <dir>/matsuri_bg.png and matsuri_bg.disclosure.json.
const ASSET_DIR = argValue('--emit-asset');
if (ASSET_DIR) {
  const p = proposals.find((q) => q.id === 'D5b5_final');
  if (!p) throw new Error('--emit-asset needs --set d5b');
  const panel = p.r.toPanel(); const colors = p.P.colors; const bgIndex = p.P.byName.bg;
  const board = R.createBoard({ name: 'beatbayashi-background-matsuri', w: panel.w, h: panel.h, panels: 1 });
  colors.forEach((col, index) => R.applyOp(board, index < board.palette.colors.length ? 'palette_set' : 'palette_add', { index, hex: col.hex, name: col.name }));
  const id = board.panels[0].id; const META = { client: 'make_matsuri_d5.mjs', model: 'claude-opus-5-5' };
  R.applyOp(board, 'set_panel_meta', { panelId: id, title: p.title, note: p.note + '; background left transparent' }, 'llm', META);
  const pts = []; for (let y = 0; y < panel.h; y++) for (let x = 0; x < panel.w; x++) { const v = panel.pixels[y * panel.w + x]; if (v >= 0 && v !== bgIndex) pts.push([x, y, v]); }
  for (let i = 0; i < pts.length; i += 4000) R.applyOp(board, 'draw_pixels', { panelId: id, points: pts.slice(i, i + 4000) }, 'llm', META);
  const bp = R.getPanel(board, id);
  mkdirSync(resolve(ASSET_DIR), { recursive: true });
  writeFileSync(join(resolve(ASSET_DIR), 'matsuri_bg.png'), R.encodePanelPng(bp, board.palette.colors, 1));
  const disc = R.buildDisclosure(board);
  delete disc.generatedAt; // keep the committed file stable between runs
  writeFileSync(join(resolve(ASSET_DIR), 'matsuri_bg.disclosure.json'), JSON.stringify(disc, null, 1) + '\n');
  console.log(`asset: ${bp.w}x${bp.h}, ${pts.length} opaque pixels, provenance=${R.panelLabel(bp)} -> ${resolve(ASSET_DIR)}`);
}
{ // contact sheet: the five stacked on the app background, right-aligned like the real corner placement
  const gap = 12, W = 630 + 2 * gap; const H = proposals.reduce((s, p) => s + p.r.h + gap, gap);
  const colors = [{ hex: HEX.bg }]; const px = new Array(W * H).fill(0);
  let oy = gap;
  for (const p of proposals) {
    const base = colors.length; colors.push(...p.P.colors); const ox = W - gap - p.r.w;
    for (let y = 0; y < p.r.h; y++) for (let x = 0; x < p.r.w; x++) { const v = p.r.px[y * p.r.w + x]; if (v >= 0) px[(oy + y) * W + ox + x] = base + v; }
    oy += p.r.h + gap;
  }
  writeFileSync(join(OUT, 'contact_sheet.png'), R.encodePanelPng({ w: W, h: H, pixels: px }, colors, 1));
}
console.log(`out: ${OUT}`);
