// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Five variations on proposal D "ink and asagi" (owner 2026-10-19: D is the favourite; derive five
// from it; 2D, bird's-eye and mixes are welcome; minimal, black-and-white contrast with an accent;
// light sources may use the UI palette's yellow and orange). Same toolkit as make_matsuri.mjs.
//
//   node src/pixel-art/source/make_matsuri_d.mjs [--out <dir>] [--recensio <dir>] [--no-board]
//
// Colours come only from the UI palette: templates/ui-system/allowed-colors.txt and BeatBayashi's
// theme ramps (--app-yellow-*, --app-orange-*, --app-asagi-*). Output: beatbayashi/.out/matsuri-beat-d.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  Raster, Palette, rng, figure, lantern, lanternString, firework, fireworkTrail, yagura, taiko, drumKit,
  stall, tree, bench, cat, goldfishBag, zz, loadingBar, topFigure, woodBlock,
} from './matsuri_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../../..');
const argValue = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = resolve(argValue('--out') || process.env.MATSURI_OUT || join(APP, '.out', 'matsuri-beat-d'));
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

/* ------------------------------------------------------------------ palette (UI tokens only) */

const HEX = {
  bg: '#0a0a0a', ink: '#f0f0f0', grey: '#999999', grey2: '#666666', dim: '#333333', faint: '#1a1a1a', night: '#161616',
  asagi: '#3fc1b0', asagiD: '#0f8a80', asagiF: '#073e3a',              // allowed-colors + --app-asagi-1
  yellow: '#ffde00', yellowS: '#e2d5a7', yellowM: '#c0a351', yellowD: '#44350f', // allowed + --app-yellow-5/4/1
  orange: '#ffb066', orangeM: '#a66f30', orangeD: '#4a3216', orangeS: '#e4d2bd', // allowed + --app-orange-3/1/5
};

function inkTheme(P) {
  const c = {}; for (const [k, v] of Object.entries(HEX)) c[k] = P.add(k, v);
  const T = {
    bg: c.bg, line: c.ink, lineDim: c.grey2, white: c.ink, red: c.ink, wood: c.grey2, woodLight: c.grey, roof: c.grey2,
    skin: c.bg, aiHead: c.bg, eye: c.asagi, happi: c.bg, obi: c.asagiD, pole: c.dim, string: c.dim,
    lanternStripe: c.orangeM, lanternHi: c.yellowS, barrel: c.grey2, barrelDark: c.dim, kitBass: c.dim, kitSnare: c.grey2, kitTom: c.dim,
    metal: c.grey2, cymbal: c.yellowM, clapMark: c.yellow, yellow: c.yellow, bulb: c.yellow, bulbCord: c.dim,
    water: c.asagi, goldfish: c.orange, treeSil: c.night, spot: c.night, woodBlock: c.grey, groundLit: c.orangeD,
  };
  T.c = c;
  T.cloths = [c.bg, c.dim, c.asagiD, c.bg];
  T.lanterns = [c.orange, c.yellowS, c.orange, c.yellow];
  const S = (k) => ({ awn: c.ink, awn2: ['jp', 'us', 'uk'].includes(k) ? c.grey2 : null, inner: c.bg, counter: c.bg, goodA: c.orange, goodB: c.asagi, apron: c.bg, sign: null });
  T.stall = Object.fromEntries(['jp', 'cn', 'tw', 'kr', 'us', 'uk'].map((k) => [k, S(k)]));
  return T;
}

/* ------------------------------------------------------------------ helpers */

/** Dithered glow around a light: only on background pixels, checker pattern, two rings. */
function halo(r, cx, cy, rad, inner, outer, bg) {
  for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d > rad || r.get(cx + x, cy + y) !== bg) continue;
    if (((cx + x + cy + y) & 1) !== 0) continue;
    r.set(cx + x, cy + y, d < rad * 0.55 ? inner : outer);
  }
}

function litLantern(r, x, y, T, { size = 'M', body, glow = 7 } = {}) {
  halo(r, x, y + 6, glow, T.c.orangeD, T.c.yellowD, T.bg);
  lantern(r, x, y, T, { size, body: body ?? T.c.orange, stripe: T.lanternStripe, cap: T.line, hi: T.lanternHi });
}

function dancerRing(r, cx, cy, rx, ry, T, { n = 22, sizeFront = 16, sizeBack = 10, startAngle = 0.15, lineOnly = true, part = 'all', dimBack = true, kinds = ['human', 'ai', 'human', 'aiScreen', 'human', 'aiDiamond'] }) {
  const people = [];
  for (let i = 0; i < n; i++) {
    const a = startAngle + (i / n) * Math.PI * 2;
    if (part === 'back' && Math.sin(a) >= 0) continue;
    if (part === 'front' && Math.sin(a) < 0) continue;
    people.push({ x: Math.round(cx + Math.cos(a) * rx), y: Math.round(cy + Math.sin(a) * ry), depth: (Math.sin(a) + 1) / 2, kind: kinds[i % kinds.length], pose: ['up', 'oneUp', 'wave', 'up'][i % 4], i });
  }
  people.sort((p, q) => p.y - q.y);
  for (const p of people) {
    const h = p.depth > 0.55 ? sizeFront : p.depth > 0.25 ? Math.round((sizeFront + sizeBack) / 2) : sizeBack;
    const dim = dimBack && p.depth < 0.3;
    figure(r, p.x, p.y - h, { kind: p.kind, pose: p.pose, h, lineOnly, flip: p.i % 2 === 0, c: { line: dim ? T.lineDim : T.line, head: T.bg, cloth: T.cloths[(p.i * 7) % T.cloths.length], cloth2: T.obi, eye: T.eye } });
  }
}
function rings(r, part, cx, cy, T, o) {
  dancerRing(r, cx, cy, o.rx2, o.ry2, T, { ...o, n: o.n2, part, startAngle: 0.4 });
  dancerRing(r, cx, cy, o.rx, o.ry, T, { ...o, n: o.n, part });
}

function performers(r, Y, T) {
  const sy = Y.stageY;
  taiko(r, Y.ux0 + 2, sy - 18, T);
  figure(r, Y.ux0 - 4, sy - 16, { kind: 'human', pose: 'drum', h: 16, lineOnly: true, c: { line: T.line, eye: T.eye } });
  drumKit(r, Y.ux1 - 28, sy - 17, T);
  figure(r, Y.ux1 - 8, sy - 16, { kind: 'ai', pose: 'drumKit', h: 16, flip: true, lineOnly: true, c: { line: T.line, eye: T.eye } });
  const cx = (Y.ux0 + Y.ux1) >> 1;
  for (let j = 0; j < 22; j++) r.hline(cx - 1 - (j >> 2), cx + 1 + (j >> 2), Y.roofY + 12 + j, T.c.yellowD); // warm spotlight
  woodBlock(r, cx + 2, sy - 10, T);
  figure(r, cx - 3, sy - 16, { kind: 'aiDiamond', pose: 'drum', h: 16, lineOnly: true, c: { line: T.line, eye: T.eye } });
  r.set(cx + 13, sy - 13, T.c.yellow); r.set(cx + 14, sy - 15, T.c.yellow); r.set(cx + 15, sy - 12, T.c.yellow);
}

function warmLanternStrings(r, Y, T, { poles, groundY, size = 'M' }) {
  for (const [px, frac] of poles) {
    const poleTop = Math.round(groundY - (groundY - Y.roofY) * frac) - 22;
    r.vline(px, poleTop, groundY, T.pole);
    const fromX = px < (Y.ux0 + Y.ux1) / 2 ? Y.ux0 - 6 : Y.ux1 + 6;
    const pts = lanternString(r, fromX, Y.roofY + 2, px, poleTop, 16, T.string, 13, px % 7);
    pts.forEach(([x, y], k) => litLantern(r, x, y, T, { size, body: T.lanterns[(k + (px >> 3)) % T.lanterns.length], glow: size === 'S' ? 5 : 7 }));
  }
}

function warmFirework(r, cx, cy, rad, T, kind = 'willow', main = 'asagi') {
  const c = T.c;
  if (main === 'asagi') firework(r, cx, cy, rad, c.asagi, { rays: 18, kind, c2: c.ink });
  else if (main === 'yellow') firework(r, cx, cy, rad, c.yellowM, { rays: 16, kind, c2: c.yellow });
  else firework(r, cx, cy, rad, c.orange, { rays: 14, kind, c2: c.yellowS });
}

/* ------------------------------------------------------------------ D1 灯の輪 (eye level, refined D) */

function D1() {
  const P = new Palette(); const T = inkTheme(P); const c = T.c;
  const r = new Raster(400, 400, T.bg); const rngf = rng(11);
  const G = 318;
  // fireworks lean to the upper right; the upper left stays dark so the corner fades into the app
  warmFirework(r, 300, 70, 46, T, 'willow', 'asagi');
  warmFirework(r, 190, 52, 20, T, 'dots', 'yellow');
  warmFirework(r, 360, 128, 14, T, 'dots', 'orange');
  fireworkTrail(r, 300, 200, 112, c.asagiD); fireworkTrail(r, 190, 190, 74, c.yellowD);
  r.hline(0, 399, 236, c.dim);
  tree(r, 50, 236, 110, c.night, rngf); tree(r, 380, 236, 96, c.night, rngf);
  // stalls in ink with warm light inside
  const st = [[6, 'jp'], [62, 'cn'], [118, 'tw'], [232, 'kr'], [288, 'us'], [344, 'uk']];
  for (const [x, k] of st) { stall(r, x, 258, T, k, { w: 50, h: 32, rngf }); for (let i = 6; i < 46; i += 9) halo(r, x + i, 236, 4, c.yellowD, c.yellowD, T.bg); }
  const RD = { rx: 112, ry: 20, n: 26, rx2: 160, ry2: 36, n2: 28 };
  rings(r, 'back', 210, 320, T, RD);
  const Y = yagura(r, 210, G, T, { w: 116, h: 130, curtain: 'outline' });
  warmLanternStrings(r, Y, T, { groundY: G, size: 'M', poles: [[26, 0.55], [390, 0.55], [104, 0.45], [314, 0.45]] });
  performers(r, Y, T);
  rings(r, 'front', 210, 320, T, RD);
  // ground light pools under the yagura
  for (let x = Y.x0 - 10; x < Y.x1 + 10; x += 2) r.set(x + ((x >> 1) & 1), G + 2, c.orangeD);
  // visitors and jokes
  for (const [x, y, pose, kind, flip] of [[70, 290, 'phone', 'ai'], [82, 290, 'idle', 'human', 1], [342, 290, 'wave', 'human'], [356, 290, 'hold', 'aiScreen'], [150, 282, 'lean', 'human']]) figure(r, x, y - 16, { kind, pose, h: 16, flip: !!flip, lineOnly: true, c: { line: T.line, eye: T.eye } });
  bench(r, 22, 296, T); figure(r, 28, 280, { kind: 'human', pose: 'sit', h: 16, lineOnly: true, c: { line: T.line, eye: T.eye } }); zz(r, 32, 278, c.grey2);
  loadingBar(r, 66, 264, T, 2);                                     // the AI visitor still loading its dance
  lantern(r, 356, 266, T, { size: 'S', body: c.yellowS, cap: T.line }); r.rect(355, 266, 3, 1, T.line); // a lantern held upside down
  cat(r, 132, 300, T.line, c.orange);                              // the cat with a stolen snack
  // foreground: big lanterns close to the viewer (near-far contrast)
  for (const [x, y, b] of [[30, 336, c.orange], [78, 352, c.yellowS], [366, 344, c.orange]]) {
    r.vline(x, y - 16, y, T.string); litLantern(r, x, y, T, { size: 'L', body: b, glow: 12 });
    for (let j = 3; j < 12; j += 2) r.hline(x - 2, x + 2, y + j, T.lanternStripe);
  }
  // a jellyfish-shaped lantern among them (cameo)
  r.vline(306, 340, 352, T.string); halo(r, 306, 357, 9, c.asagiF, c.asagiF, T.bg); r.disc(306, 356, 5, c.asagiD); r.ring(306, 356, 5, T.line); r.rect(301, 356, 11, 6, T.bg); r.hline(302, 310, 356, T.line);
  for (const dx of [-3, -1, 1, 3]) r.line(306 + dx, 357, 306 + dx * 2, 368, c.asagi);
  return { id: 'D1_hi_no_wa', title: 'D1 灯の輪', note: 'D refined at eye level: warm lantern glow, yellow and orange only on lights, upper left left dark for the corner', P, r };
}

/* ------------------------------------------------------------------ D2 見下ろしの輪 (bird's-eye in ink) */

function D2() {
  const P = new Palette(); const T = inkTheme(P); const c = T.c;
  const r = new Raster(400, 400, T.bg); const rngf = rng(22);
  warmFirework(r, 300, 34, 28, T, 'willow', 'asagi');
  warmFirework(r, 210, 22, 12, T, 'dots', 'yellow');
  fireworkTrail(r, 300, 92, 46, c.asagiF);
  r.hline(0, 399, 94, c.dim);
  for (let x = 0; x < 400; x += 12) tree(r, x + 4, 102, 12 + ((x >> 3) % 5), c.night, rngf);
  const cx = 214, cy = 240;
  r.ellipse(cx, cy + 10, 170, 120, c.night); // the trodden square, barely lighter than the night
  // stalls around the edge: outline boxes with a lit counter facing the centre
  for (const [x, y, k] of [[40, 118], [112, 108], [256, 108], [328, 118], [8, 300], [344, 300]].map((p, i) => [...p, ['jp', 'cn', 'tw', 'kr', 'us', 'uk'][i]])) {
    r.box(x, y, 52, 22, T.line);
    if (['jp', 'us', 'uk'].includes(k)) for (let i = 2; i < 50; i += 6) r.vline(x + i, y + 1, y + 20, c.grey2);
    else for (let j = 3; j < 21; j += 4) r.hline(x + 1, x + 50, y + j, c.dim);
    r.box(x + 2, y + 22, 48, 8, T.line);
    for (let i = 5; i < 48; i += 6) r.set(x + i, y + 25, i % 12 ? c.orange : c.asagi);
    for (let i = 4; i < 52; i += 10) { halo(r, x + i, y + 33, 4, c.yellowD, c.yellowD, T.bg); r.set(x + i, y + 31, c.yellow); }
    if (k === 'cn') { litLantern(r, x + 6, y - 7, T, { size: 'S', glow: 4 }); litLantern(r, x + 46, y - 7, T, { size: 'S', glow: 4 }); }
    for (let i = 0; i < 3; i++) topFigure(r, x + 10 + i * 16, y + 40, { kind: i === 1 ? 'ai' : 'human', pose: 'idle', c: { line: T.line, cloth: T.bg, head: T.line, eye: c.asagi } });
  }
  // three rings of dancers seen from above
  const ringTop = (rad, ry, n, off, every, col) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + off; topFigure(r, Math.round(cx + Math.cos(a) * rad), Math.round(cy + 10 + Math.sin(a) * ry), { kind: i % 3 === 1 ? 'ai' : 'human', pose: i % every === 0 ? 'idle' : 'up', c: { line: col, cloth: T.bg, head: col, eye: c.asagi } }); } };
  ringTop(78, 56, 40, 0.1, 9, T.line); ringTop(112, 80, 48, 0.3, 6, T.line); ringTop(146, 100, 40, 0.5, 4, c.grey);
  // yagura from above: deck, curtain front, pyramid roof (outline only)
  const D0 = cx - 40, D1x = cx + 40, DT = cy - 34, DB = cy + 8;
  r.rect(D0, DB, 81, 30, T.bg); for (let x = D0 + 4; x < D1x; x += 8) r.vline(x, DB + 3, DB + 27, c.grey2); r.box(D0, DB, 81, 30, T.line);
  r.rect(D0, DT, 81, DB - DT + 1, T.bg); for (let y = DT + 4; y < DB; y += 4) r.hline(D0 + 1, D1x - 1, y, c.dim); r.box(D0, DT, 81, DB - DT + 1, T.line);
  const RX = 24, RY = 16, rcy = cy - 16;
  for (let y = -RY; y <= RY; y++) for (let x = -RX; x <= RX; x++) { const u = x / RX, v = y / RY; const f = Math.abs(u) > Math.abs(v) ? 'side' : v < 0 ? 'n' : 's'; r.set(cx + x, rcy + y, f === 's' ? c.dim : f === 'n' ? T.bg : c.faint); }
  r.box(cx - RX, rcy - RY, 2 * RX + 1, 2 * RY + 1, T.line); r.line(cx - RX, rcy - RY, cx + RX, rcy + RY, T.line); r.line(cx + RX, rcy - RY, cx - RX, rcy + RY, T.line);
  for (let x = cx - RX + 2; x <= cx + RX - 2; x += 6) { halo(r, x, rcy + RY + 4, 4, c.orangeD, c.yellowD, T.bg); r.rect(x - 1, rcy + RY + 2, 3, 3, T.lanterns[(x >> 1) % 4]); }
  taiko(r, D0 + 3, DB - 18, T); figure(r, D0 + 3, DB - 12, { kind: 'human', pose: 'drum', h: 12, lineOnly: true, c: { line: T.line, eye: T.eye } });
  halo(r, cx, DB - 3, 8, c.yellowD, c.yellowD, T.bg);
  woodBlock(r, cx - 2, DB - 8, T); figure(r, cx - 6, DB - 12, { kind: 'aiDiamond', pose: 'drum', h: 12, lineOnly: true, c: { line: T.line, eye: T.eye } });
  r.set(cx + 10, DB - 11, c.yellow); r.set(cx + 11, DB - 13, c.yellow);
  drumKit(r, D1x - 30, DB - 17, T); figure(r, D1x - 4, DB - 12, { kind: 'ai', pose: 'drumKit', h: 12, flip: true, lineOnly: true, c: { line: T.line, eye: T.eye } });
  // strings radiating from the roof to eight poles, warm lanterns with glow
  for (const [px, py] of [[34, 150], [384, 150], [20, 250], [392, 250], [56, 368], [362, 368], [160, 394], [268, 394]]) {
    r.rect(px - 1, py - 2, 3, 3, c.grey2);
    const fx = cx + Math.sign(px - cx) * RX, fy = py < rcy ? rcy - RY : rcy + (py > 300 ? RY : 0);
    const n = Math.max(Math.abs(px - fx), Math.abs(py - fy));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = Math.round(fx + (px - fx) * t), y = Math.round(fy + (py - fy) * t + 24 * t * (1 - t));
      if (r.get(x, y) === T.bg || r.get(x, y) === c.night) r.set(x, y, T.string);
      if (i % 12 === 6 && i > 4 && i < n - 4) { halo(r, x, y + 3, 4, c.orangeD, c.yellowD, T.bg); r.rect(x - 1, y + 1, 3, 4, T.lanterns[(i + px) % 4]); r.set(x, y + 1, T.line); }
    }
  }
  // jokes: a cat on the path, an AI loading, a sleeper on a bench, a goldfish bag
  cat(r, 190, 380, T.line, c.orange);
  topFigure(r, 268, 334, { kind: 'ai', pose: 'idle', c: { line: T.line, cloth: T.bg, head: T.line, eye: c.asagi } }); loadingBar(r, 264, 326, T, 5);
  bench(r, 300, 356, T); r.box(302, 351, 9, 4, T.line); zz(r, 314, 350, c.grey2);
  goldfishBag(r, 96, 340, T); topFigure(r, 100, 342, { kind: 'human', pose: 'idle', c: { line: T.line, cloth: T.bg, head: T.line, eye: c.asagi } });
  return { id: 'D2_mioroshi_no_wa', title: 'D2 見下ろしの輪', note: "C's bird's-eye view drawn in D's ink: rings read as circles, lights warm, everything else outline", P, r };
}

/* ------------------------------------------------------------------ D3 斜め見下ろし (3/4 oblique, chibi line figures) */

/** A box seen in 3/4 oblique: top face (w x d) above the front face (w x h). */
function box3q(r, x, y, w, d, h, T, { top, front, line } = {}) {
  r.rect(x, y, w, d, top ?? T.c.faint); r.rect(x, y + d, w, h, front ?? T.bg);
  r.box(x, y, w, d + h, line ?? T.line); r.hline(x, x + w - 1, y + d, line ?? T.line);
}

/** 2-head chibi in outline: head 7 wide, body 5. Feet at y + 12. kind 'human' | 'ai'. pose 'idle' | 'up' | 'walk' | 'sit'. */
function chibiQ(r, x, y, T, { kind = 'human', pose = 'idle', accent, col, flip = false } = {}) {
  const L = col ?? T.line, E = kind === 'ai' ? T.c.asagi : L, A = accent ?? T.bg;
  const head = kind === 'ai'
    ? ['...k...', 'kkkkkkk', 'k.....k', 'k.e.e.k', 'k.....k', 'kkkkkkk']
    : ['..kkk..', '.k...k.', 'k.....k', 'k.e.e.k', 'k.....k', '.kkkkk.'];
  r.stamp(head, x - 3, y, { k: L, e: E });
  const by = y + 6;
  r.stamp(['.kaak.'.slice(0, 5), 'kaaak', 'kaaak', '.k.k.'], x - 2, by, { k: L, a: A }, { flip });
  if (pose === 'up') { r.line(x - 2, by + 1, x - 5, by - 4, L); r.line(x + 2, by + 1, x + 5, by - 4, L); }
  else if (pose === 'walk') { r.line(x - 2, by + 1, x - 4, by + 3, L); r.line(x + 2, by + 1, x + 4, by - 1, L); r.set(x - 2, by + 4, T.bg); r.set(x - 3, by + 4, L); }
  else if (pose === 'sit') { r.hline(x - 1, x + 3, by + 3, L); r.set(x + 1, by + 3, L); }
  else { r.set(x - 3, by + 2, L); r.set(x + 3, by + 2, L); }
}

function D3() {
  const P = new Palette(); const T = inkTheme(P); const c = T.c;
  const r = new Raster(400, 400, T.bg); const rngf = rng(33);
  // small fireworks over the trees, upper right
  warmFirework(r, 310, 40, 26, T, 'dots', 'asagi'); warmFirework(r, 360, 70, 12, T, 'dots', 'yellow'); warmFirework(r, 250, 58, 10, T, 'dots', 'orange');
  // plaza tiles seen from above at an angle: faint grid, rows closer near the top
  for (let y = 110, k = 0; y < 400; k++, y += 8 + (k >> 1)) r.hline(0, 399, y, c.faint);
  for (let x = -200; x < 600; x += 24) r.line(200 + (x - 200) * 0.6, 110, x, 399, c.faint);
  for (let x = 0; x < 400; x += 14) tree(r, x + 6, 112, 14 + ((x >> 2) % 6), c.night, rngf);
  // stalls in two rows (back row smaller), boxes with awnings and warm counters
  const stall3q = (x, y, w, k) => {
    box3q(r, x, y, w, 10, 18, T, { top: c.faint });
    if (['jp', 'us', 'uk'].includes(k)) for (let i = 2; i < w - 1; i += 5) r.vline(x + i, y + 1, y + 9, c.grey2); else for (let j = 2; j < 10; j += 3) r.hline(x + 1, x + w - 2, y + j, c.dim);
    r.rect(x + 2, y + 12, w - 4, 8, T.bg); // the opening
    halo(r, x + (w >> 1), y + 16, Math.round(w / 3), c.yellowD, c.orangeD, T.bg);
    r.hline(x + 1, x + w - 2, y + 21, T.line); r.hline(x + 1, x + w - 2, y + 22, c.grey2); // counter edge
    for (let i = 4; i < w - 4; i += 5) r.set(x + i, y + 20, i % 10 ? c.orange : c.asagi);
    chibiQ(r, x + (w >> 1), y + 7, T, { kind: rngf() < 0.5 ? 'human' : 'ai' });
    r.rect(x + 1, y + 21, w - 2, 7, T.bg); r.box(x, y + 21, w, 8, T.line);
    if (k === 'cn') { litLantern(r, x + 3, y + 10, T, { size: 'S', glow: 3 }); litLantern(r, x + w - 4, y + 10, T, { size: 'S', glow: 3 }); }
  };
  [[14, 128, 'jp'], [78, 124, 'cn'], [142, 122, 'tw'], [214, 122, 'kr'], [278, 124, 'us'], [342, 128, 'uk']].forEach(([x, y, k]) => stall3q(x, y, 48, k));
  // the yagura: three stacked boxes, curtain lines on the base front, lanterns under the roof
  const cx = 210, base = 214;
  const ring3q = (back) => {
    const people = [];
    for (const [rx, ry, n, off] of [[92, 34, 24, 0.1], [140, 54, 30, 0.35]]) for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + off; if ((Math.sin(a) < 0) === back) people.push([Math.round(cx + Math.cos(a) * rx), Math.round(base + 46 + Math.sin(a) * ry), i, Math.sin(a)]); }
    people.sort((p, q) => p[1] - q[1]);
    for (const [x, y, i, s] of people) chibiQ(r, x, y - 12, T, { kind: i % 3 === 1 ? 'ai' : 'human', pose: i % 5 === 4 ? 'walk' : 'up', col: s < -0.5 ? c.grey : T.line, flip: i % 2 === 0, accent: i % 4 === 0 ? c.asagiD : T.bg });
  };
  ring3q(true);
  box3q(r, cx - 46, base, 92, 22, 34, T, { top: c.faint }); for (let x = cx - 42; x < cx + 46; x += 8) r.vline(x, base + 25, base + 54, c.grey2);
  box3q(r, cx - 32, base - 44, 64, 14, 30, T, { top: c.night, front: T.bg });
  r.rect(cx - 30, base - 29, 60, 28, T.bg); r.hline(cx - 31, cx + 30, base - 12, c.grey); // upper deck opening + railing
  r.vline(cx - 32, base - 44, base, T.line); r.vline(cx + 31, base - 44, base, T.line);
  // roof (wider box, its front is the eave)
  box3q(r, cx - 40, base - 62, 80, 12, 6, T, { top: c.dim, front: c.faint });
  for (let x = cx - 34; x <= cx + 34; x += 7) litLantern(r, x, base - 44, T, { size: 'S', body: T.lanterns[(x >> 2) % 4], glow: 3 });
  // performers on the upper deck: taiko left, wood block centre, drum kit right
  const dy = base - 26;
  r.disc(cx - 18, dy + 6, 5, T.line); r.disc(cx - 18, dy + 6, 4, T.bg); r.ring(cx - 18, dy + 6, 2, c.grey2); chibiQ(r, cx - 25, dy - 2, T, { kind: 'human', pose: 'up' });
  halo(r, cx, dy + 8, 7, c.yellowD, c.yellowD, T.bg); r.rect(cx - 3, dy + 8, 7, 4, c.grey); r.box(cx - 3, dy + 8, 7, 4, T.line); r.hline(cx - 2, cx + 2, dy + 10, T.line);
  chibiQ(r, cx, dy - 4, T, { kind: 'ai', pose: 'up' }); r.set(cx + 6, dy + 5, c.yellow); r.set(cx + 7, dy + 3, c.yellow);
  r.ring(cx + 19, dy + 8, 4, T.line); r.hline(cx + 13, cx + 25, dy + 1, c.yellowM); r.vline(cx + 19, dy + 1, dy + 4, c.grey2); chibiQ(r, cx + 25, dy - 2, T, { kind: 'human', pose: 'idle', flip: true, accent: c.asagiD });
  // strings from the roof corners to poles
  for (const [px, py] of [[20, 176], [400 - 6, 176], [70, 210], [350, 210]]) {
    r.vline(px, py, py + 40, c.dim);
    const pts = lanternString(r, px < cx ? cx - 40 : cx + 39, base - 56, px, py, 14, T.string, 12, px % 5);
    pts.forEach(([x, y], k) => litLantern(r, x, y, T, { size: 'S', body: T.lanterns[k % 4], glow: 5 }));
  }
  ring3q(false);
  // jokes and visitors
  chibiQ(r, 40, 300, T, { kind: 'ai', pose: 'idle' }); loadingBar(r, 36, 292, T, 3);
  chibiQ(r, 372, 312, T, { kind: 'human', pose: 'walk', flip: true }); goldfishBag(r, 380, 318, T);
  cat(r, 120, 182, T.line, c.orange);
  r.hline(300, 318, 360, c.grey); r.vline(301, 361, 363, c.grey2); r.vline(317, 361, 363, c.grey2); chibiQ(r, 306, 348, T, { kind: 'human', pose: 'sit' }); zz(r, 312, 346, c.grey2);
  chibiQ(r, 60, 372, T, { kind: 'human', pose: 'up', flip: true, accent: c.asagiD }); r.set(56, 386, T.line); // the one dancer facing away
  litLantern(r, 330, 368, T, { size: 'L', body: c.orange, glow: 11 });
  return { id: 'D3_naname_mioroshi', title: 'D3 斜め見下ろし', note: '3/4 oblique view in ink: boxes with top and front faces, 2-head chibi outline figures, warm lights; an original take on the old console RPG angle', P, r };
}

/* ------------------------------------------------------------------ D4 川辺 (side view on a bank + river seen from above) */

function D4() {
  const P = new Palette(); const T = inkTheme(P); const c = T.c;
  const r = new Raster(400, 400, T.bg); const rngf = rng(44);
  const G = 246;
  warmFirework(r, 290, 56, 40, T, 'willow', 'asagi'); warmFirework(r, 196, 40, 16, T, 'dots', 'yellow'); warmFirework(r, 354, 104, 12, T, 'dots', 'orange');
  fireworkTrail(r, 290, 170, 96, c.asagiF);
  r.hline(0, 399, 186, c.dim);
  tree(r, 40, 186, 70, c.night, rngf); tree(r, 380, 186, 60, c.night, rngf);
  for (const [x, k] of [[0, 'jp'], [48, 'cn'], [96, 'tw'], [252, 'kr'], [300, 'us'], [348, 'uk']]) stall(r, x, 204, T, k, { w: 46, h: 28, rngf });
  const RD = { rx: 96, ry: 12, n: 22, rx2: 140, ry2: 22, n2: 26, sizeFront: 12, sizeBack: 10 };
  rings(r, 'back', 200, 248, T, RD);
  const Y = yagura(r, 200, G, T, { w: 96, h: 108, curtain: 'outline' });
  warmLanternStrings(r, Y, T, { groundY: G, size: 'S', poles: [[16, 0.55], [388, 0.55], [92, 0.45], [308, 0.45]] });
  performers(r, Y, T);
  rings(r, 'front', 200, 248, T, RD);
  // the bank edge and the river below, seen from a little above
  const W0 = 270;
  r.hline(0, 399, W0 - 2, c.grey2); r.hline(0, 399, W0 - 1, c.dim);
  // reflections: only lights (asagi, yellow, orange) are mirrored, broken into dashes that waver
  const lights = new Map([[c.asagi, c.asagiD], [c.ink, c.asagiF], [c.yellow, c.yellowM], [c.yellowM, c.yellowD], [c.yellowS, c.orangeM], [c.orange, c.orangeM]]);
  for (let y = W0; y < 400; y++) {
    const sy = W0 - 1 - Math.round((y - W0) * 1.6);
    if (sy < 0) break;
    const shift = Math.round(Math.sin(y * 0.7) * 2);
    for (let x = 0; x < 400; x++) {
      const v = r.get(x, sy);
      if (!lights.has(v) || ((x + y) % 3 === 0)) continue;
      if (v === c.ink && sy > 200) continue; // ink lines of figures are not lights
      r.set(x + shift, y, lights.get(v));
    }
  }
  // boats in outline with figures, on the water
  for (const [bx, by, a] of [[40, 320, 'human'], [150, 356, 'ai'], [262, 336, 'human'], [330, 378, 'ai']]) {
    r.rect(bx, by, 30, 4, T.bg); r.hline(bx - 2, bx + 31, by, T.line); r.line(bx - 2, by, bx + 2, by + 4, T.line); r.line(bx + 31, by, bx + 27, by + 4, T.line); r.hline(bx + 2, bx + 27, by + 4, T.line);
    figure(r, bx + 9, by - 10, { kind: 'human', pose: 'wave', h: 10, lineOnly: true, c: { line: T.line, eye: T.eye } });
    figure(r, bx + 20, by - 10, { kind: a, pose: 'idle', h: 10, lineOnly: true, c: { line: T.line, eye: T.eye } });
    litLantern(r, bx + 28, by - 9, T, { size: 'S', glow: 4 });
  }
  // a floating paper lantern drifting away, and a fish jumping at the reflection of a firework (joke)
  r.rect(214, 304, 5, 3, c.yellowS); r.hline(214, 218, 307, T.line); halo(r, 216, 305, 5, c.yellowD, c.orangeD, T.bg);
  r.stamp(['.kk.', 'kkkk', '.k.k'], 300, 286, { k: c.orange });
  bench(r, 20, 256, T); figure(r, 26, 240, { kind: 'aiScreen', pose: 'sit', h: 16, lineOnly: true, c: { line: T.line, eye: T.eye } }); zz(r, 30, 238, c.grey2);
  return { id: 'D4_kawabe', title: 'D4 川辺', note: 'mix of side view and overhead: the festival on a bank, the river below mirrors only the lights; boats with figures', P, r };
}

/* ------------------------------------------------------------------ D5 灯りだけ (only the lights, 16:9 for the corner) */

function D5() {
  const P = new Palette(); const T = inkTheme(P); const c = T.c;
  // 480x270 (16:9): weight to the lower right; the upper left is empty so it fades into the app
  const r = new Raster(480, 270, T.bg); const rngf = rng(55);
  const dimT = { ...T, line: c.dim, lineDim: c.dim, white: c.dim, red: c.dim, wood: c.dim, woodLight: c.dim, roof: c.dim, metal: c.dim, barrel: c.dim, kitSnare: c.dim, woodBlock: c.dim };
  const G = 230;
  warmFirework(r, 400, 46, 34, T, 'willow', 'asagi'); warmFirework(r, 330, 30, 12, T, 'dots', 'yellow');
  fireworkTrail(r, 400, 150, 80, c.asagiF);
  // structures only in the darkest grey line
  for (const [x, k] of [[150, 'jp'], [200, 'tw'], [420, 'uk']]) stall(r, x, 196, dimT, k, { w: 44, h: 28, rngf });
  const Y = yagura(r, 330, G, dimT, { w: 90, h: 100, curtain: 'outline', eaveLanterns: false });
  for (let x = Y.ux0 + 3; x <= Y.ux1 - 3; x += 6) litLantern(r, x, Y.roofY + 6, T, { size: 'S', body: T.lanterns[(x >> 1) % 4], glow: 4 });
  // the three players: only their silhouettes are lit by the stage light
  for (let j = 0; j < 20; j++) r.hline(329 - (j >> 2), 331 + (j >> 2), Y.roofY + 12 + j, c.yellowD);
  figure(r, Y.ux0 - 2, Y.stageY - 16, { kind: 'human', pose: 'drum', h: 16, lineOnly: true, c: { line: c.ink, eye: c.asagi } });
  figure(r, 327, Y.stageY - 16, { kind: 'aiDiamond', pose: 'drum', h: 16, lineOnly: true, c: { line: c.ink, eye: c.asagi } }); r.set(342, Y.stageY - 13, c.yellow);
  figure(r, Y.ux1 - 6, Y.stageY - 16, { kind: 'ai', pose: 'drumKit', h: 16, flip: true, lineOnly: true, c: { line: c.ink, eye: c.asagi } });
  // strings: two long ones reaching toward the left, where they fade
  for (const [px, py] of [[40, 160], [140, 150], [472, 160]]) {
    const pts = lanternString(r, px < 330 ? Y.ux0 - 6 : Y.ux1 + 6, Y.roofY + 2, px, py, 18, c.faint, 14, px % 5);
    pts.forEach(([x, y], k) => { const far = x < 150; litLantern(r, x, y, T, { size: 'S', body: far ? c.orangeM : T.lanterns[k % 4], glow: far ? 3 : 5 }); });
  }
  // dancers: those near the yagura in white, the rest grey, eyes of AI figures always asagi
  const ring = [];
  for (const [rx, ry, n, off] of [[70, 12, 18, 0.2], [108, 22, 22, 0.5]]) for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + off; ring.push([Math.round(330 + Math.cos(a) * rx), Math.round(232 + Math.sin(a) * ry), i, Math.sin(a), rx]); }
  ring.sort((p, q) => p[1] - q[1]);
  for (const [x, y, i, s, rx] of ring) {
    if (s < 0 && Math.abs(x - 330) < 46) continue; // hidden behind the yagura
    const lit = rx < 100 && s > -0.2;
    figure(r, x, y - (s > 0.3 ? 16 : 12), { kind: ['human', 'ai', 'human', 'aiScreen'][i % 4], pose: ['up', 'oneUp', 'wave', 'up'][i % 4], h: s > 0.3 ? 16 : 12, lineOnly: true, flip: i % 2 === 0, c: { line: lit ? c.ink : c.grey2, eye: c.asagi } });
  }
  // one visitor at the far left looking up at the fireworks, and a cat (jokes stay small)
  figure(r, 92, 214, { kind: 'human', pose: 'idle', h: 16, lineOnly: true, c: { line: c.grey2, eye: c.asagi } }); r.set(95, 213, c.grey2);
  figure(r, 104, 214, { kind: 'ai', pose: 'phone', h: 16, lineOnly: true, c: { line: c.grey2, eye: c.asagi } }); r.set(108, 216, c.asagi); // filming the fireworks
  cat(r, 232, 234, c.grey2, c.orange);
  // the closest lantern, large, at the lower right corner
  r.vline(452, 196, 214, c.dim); litLantern(r, 452, 214, T, { size: 'L', body: c.orange, glow: 14 });
  return { id: 'D5_akari_dake', title: 'D5 灯りだけ', note: '16:9 (480x270) for the corner: structures in the darkest grey, only lights and the nearest figures lit; the upper left fades out', P, r };
}

/* ------------------------------------------------------------------ output (same as make_matsuri.mjs) */

const proposals = [D1(), D2(), D3(), D4(), D5()];
const summary = [];
for (const p of proposals) {
  const panel = p.r.toPanel(); const colors = p.P.colors;
  writeFileSync(join(OUT, `${p.id}.png`), R.encodePanelPng(panel, colors, 1));
  writeFileSync(join(OUT, `${p.id}_2x.png`), R.encodePanelPng(panel, colors, 2));
  writeFileSync(join(OUT, `${p.id}.palette.json`), JSON.stringify(colors, null, 1));
  let boardNote = 'board: skipped (--no-board)';
  if (!process.argv.includes('--no-board')) {
    try {
      const board = R.createBoard({ name: `beatbayashi-matsuri-${p.id}`, w: panel.w, h: panel.h, panels: 1 });
      colors.forEach((col, index) => R.applyOp(board, index < board.palette.colors.length ? 'palette_set' : 'palette_add', { index, hex: col.hex, name: col.name }));
      const id = board.panels[0].id; const META = { client: 'make_matsuri_d.mjs', model: 'claude-opus-5-5' };
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
{ // contact sheet: original D and the five variations at 1x on the app background, 3 + 3 grid
  const items = proposals.map((p) => p.r);
  const gap = 16, cw = 480, ch = 400, W = 3 * cw + 4 * gap, H = 2 * ch + 3 * gap;
  const colors = [{ hex: HEX.bg }]; const px = new Array(W * H).fill(0);
  items.forEach((it, k) => {
    const base = colors.length; colors.push(...proposals[k].P.colors);
    const ox = gap + (k % 3) * (cw + gap) + ((cw - it.w) >> 1), oy = gap + Math.floor(k / 3) * (ch + gap) + (ch - it.h);
    for (let y = 0; y < it.h; y++) for (let x = 0; x < it.w; x++) { const v = it.px[y * it.w + x]; if (v >= 0) px[(oy + y) * W + ox + x] = base + v; }
  });
  writeFileSync(join(OUT, 'contact_sheet.png'), R.encodePanelPng({ w: W, h: H, pixels: px }, colors, 1));
}
console.log(`out: ${OUT}`);
