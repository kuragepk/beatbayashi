// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Five proposals for the festival background picture ("matsuri-beat", owner request 2026-10-19):
// humans and AI figures as equals at a fireworks festival, a yagura with a taiko, a drum kit and a
// hand-clap player on top, lantern strings, stalls from six countries, bon odori dancers, visitors,
// small jokes to find, fireworks above. Each proposal is a different direction, not a recolour.
//
//   node src/pixel-art/source/make_matsuri.mjs [--out <dir>] [--recensio <dir>] [--no-board]
//
// Output: <out>/<id>.png (1x), <out>/<id>_2x.png, <out>/<id>.palette.json, and when a Recensio
// checkout is found (or --recensio), <out>/<id>.board.json + <id>.disclosure.json where every pixel
// is drawn through applyOp(draw_pixels) with actor 'llm' (provenance 2), the same route the
// pixel-icons took. Default out: beatbayashi/.out/matsuri-beat (git-ignored).

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  Raster, Palette, rng, figure, lantern, lanternString, firework, fireworkTrail, yagura, taiko, drumKit,
  stall, tree, bench, cat, goldfishBag, zz, loadingBar, topFigure, chibi, woodBlock,
} from './matsuri_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../../..');
const argValue = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = resolve(argValue('--out') || process.env.MATSURI_OUT || join(APP, '.out', 'matsuri-beat'));
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

const STALL_KINDS = ['jp', 'cn', 'tw', 'kr', 'us', 'uk'];

/* ------------------------------------------------------------------ shared helpers */

/** Dancers on an ellipse around (cx, cy); front ones large, back ones small and dimmer. */
function dancerRing(r, cx, cy, rx, ry, T, { n = 22, rngf, sizeFront = 16, sizeBack = 10, startAngle = 0.15, lineOnly = false, part = 'all', kinds = ['human', 'ai', 'human', 'aiScreen', 'human', 'aiDiamond'] }) {
  const people = [];
  for (let i = 0; i < n; i++) {
    const a = startAngle + (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx);
    const y = Math.round(cy + Math.sin(a) * ry);
    const depth = (Math.sin(a) + 1) / 2; // 0 back .. 1 front
    const kind = kinds[i % kinds.length];
    const pose = ['up', 'oneUp', 'wave', 'up'][i % 4];
    if (part === 'back' && Math.sin(a) >= 0) continue;   // back half: drawn before the yagura so it hides them
    if (part === 'front' && Math.sin(a) < 0) continue;   // front half: drawn after, in front of the curtain
    people.push({ x, y, depth, kind, pose, i });
  }
  people.sort((p, q) => p.y - q.y);
  for (const p of people) {
    const h = p.depth > 0.55 ? sizeFront : p.depth > 0.25 ? Math.round((sizeFront + sizeBack) / 2) : sizeBack;
    const dim = p.depth < 0.3;
    const cloth = T.cloths[(p.i * 7) % T.cloths.length];
    figure(r, p.x, p.y - h, {
      kind: p.kind, pose: p.pose, h, lineOnly,
      c: { line: dim ? T.lineDim : T.line, head: p.kind === 'human' ? T.skin : T.aiHead, cloth, cloth2: T.obi, eye: T.eye },
      flip: p.i % 2 === 0,
    });
  }
}

/** Two concentric rings (inner dense, outer loose) split into the part drawn before / after the yagura. */
function rings(r, part, cx, cy, T, o) {
  dancerRing(r, cx, cy, o.rx2, o.ry2, T, { ...o, n: o.n2, part, startAngle: 0.4, sizeFront: o.sizeFront ?? 16, sizeBack: o.sizeBack ?? 10 });
  dancerRing(r, cx, cy, o.rx, o.ry, T, { ...o, n: o.n, part });
}

/** Three performers on the stage: taiko (left), hand clap under a spotlight (centre), drum kit (right). */
function performers(r, Y, T, { lineOnly = false } = {}) {
  const sy = Y.stageY; // floor line of the upper deck
  // taiko on the left
  taiko(r, Y.ux0 + 2, sy - 18, T);
  figure(r, Y.ux0 - 4, sy - 16, { kind: 'human', pose: 'drum', h: 16, c: { line: T.line, head: T.skin, cloth: T.happi, cloth2: T.obi, eye: T.eye }, lineOnly });
  // drum kit on the right, AI drummer sitting
  drumKit(r, Y.ux1 - 28, sy - 17, T);
  figure(r, Y.ux1 - 8, sy - 16, { kind: 'ai', pose: 'drumKit', h: 16, flip: true, c: { line: T.line, head: T.aiHead, cloth: T.cloths[1], eye: T.eye }, lineOnly });
  // wood block player in the centre (BeatBayashi's Wood Block voice), under a spotlight cone
  const cx = (Y.ux0 + Y.ux1) >> 1;
  if (T.spot != null) for (let j = 0; j < 22; j++) r.hline(cx - 1 - (j >> 2), cx + 1 + (j >> 2), Y.roofY + 12 + j, T.spot);
  woodBlock(r, cx + 2, sy - 10, T);
  figure(r, cx - 3, sy - 16, { kind: 'aiDiamond', pose: 'drum', h: 16, c: { line: T.line, head: T.aiHead, cloth: T.cloths[2], eye: T.eye }, lineOnly });
  r.set(cx + 13, sy - 13, T.clapMark); r.set(cx + 14, sy - 15, T.clapMark); r.set(cx + 15, sy - 12, T.clapMark); // "tock" marks
}

/** Lantern strings radiating from the yagura roof to poles left and right. */
function lanternStrings(r, Y, T, { poles = [[28, 0.52], [372, 0.52], [95, 0.42], [305, 0.42]], groundY, size = 'M', lightRange = true } = {}) {
  const topX0 = Y.rw ? (Y.ux0 - 6) : Y.ux0, topX1 = Y.rw ? (Y.ux1 + 6) : Y.ux1;
  for (const [px, frac] of poles) {
    const poleTop = Math.round(groundY - (groundY - Y.roofY) * frac) - 22;
    r.vline(px, poleTop, groundY, T.pole);
    r.set(px, poleTop - 1, T.line);
    const fromX = px < 200 ? topX0 : topX1;
    const pts = lanternString(r, fromX, Y.roofY + 2, px, poleTop, 16, T.string, 13, px % 7);
    pts.forEach(([x, y], k) => {
      const body = T.lanterns[(k + (px >> 3)) % T.lanterns.length];
      lantern(r, x, y, T, { size, body, stripe: T.lanternStripe, cap: T.line, hi: lightRange ? T.lanternHi : undefined });
    });
  }
}

function stallRow(r, groundY, T, { xs, rngf, w = 52, h = 36 }) {
  const out = [];
  STALL_KINDS.forEach((k, i) => { if (xs[i] != null) out.push(stall(r, xs[i], groundY, T, k, { w, h, rngf })); });
  return out;
}

/** Visitors near the stalls: pairs, a vendor on a break, a sitter, a child with a goldfish bag. */
function visitors(r, spots, T, rngf, { lineOnly = false } = {}) {
  spots.forEach(([x, y, pose, kind, flip], i) => {
    const cloth = T.cloths[(i * 5 + 1) % T.cloths.length];
    figure(r, x, y - 16, { kind, pose, h: 16, flip: !!flip, lineOnly, c: { line: T.line, head: kind === 'human' ? T.skin : T.aiHead, cloth, cloth2: T.obi, eye: T.eye } });
  });
}

function skyBands(r, bands) { let y = 0; for (const [h, c] of bands) { r.rect(0, y, r.w, h, c); y += h; } }

function stars(r, n, yMax, c, rngf) { for (let i = 0; i < n; i++) r.set(Math.round(rngf() * r.w), Math.round(rngf() * yMax), c); }

function groundSpeckle(r, y0, y1, c, rngf, density = 0.03) { for (let y = y0; y < y1; y++) for (let x = 0; x < r.w; x++) if (rngf() < density) r.set(x, y, c); }

/* ------------------------------------------------------------------ proposal A: 夜の囃子 (night, eye level) */

function proposalA() {
  const P = new Palette();
  const T = P.theme({
    bg: '#0a0a0a', sky1: '#0d0f1c', sky2: '#121630', sky3: '#1a1f3f', ground: '#1b1a1f', groundLit: '#3a2a1c', groundLit2: '#4a3520',
    line: '#0a0a0a', lineDim: '#3a3a44', white: '#f4efe6', red: '#c23b3b', wood: '#6b4a2b', woodLight: '#a67c4e', roof: '#2d4a52',
    skin: '#f0c9a0', aiHead: '#2a3b57', eye: '#3fc1b0', happi: '#1f3a73', obi: '#d04a4a', pole: '#2a2a2a', string: '#5a5245',
    lanternStripe: '#b0392f', lanternHi: '#fff6d8', barrel: '#7a3f1e', barrelDark: '#4a2512', kitBass: '#1f5f66', kitSnare: '#d9c7a3', kitTom: '#3a7d44',
    metal: '#9aa0a8', cymbal: '#e0b85a', spot: '#2b2a1e', clapMark: '#ffe08a', yellow: '#f2c94c', bulb: '#ffe9a6', bulbCord: '#3a3a3a',
    water: '#5aa7d8', goldfish: '#f06a3a', treeSil: '#07090c', fire1: '#ffb066', fire2: '#f2c94c', fire3: '#3fc1b0', fire4: '#f08aa0', fire5: '#f4efe6',
  });
  T.cloths = [P.add('#2d4a8a', '#2d4a8a'), P.add('#f4efe6', '#f4efe6'), P.add('#6b3a7a', '#6b3a7a'), P.add('#c23b3b', '#c23b3b'), P.add('#3a7d44', '#3a7d44'), P.add('#e8943a', '#e8943a')];
  T.lanterns = [P.add('#f06a4a', '#f06a4a'), P.add('#fff2cc', '#fff2cc'), P.add('#f2c94c', '#f2c94c'), P.add('#8ccf6a', '#8ccf6a'), P.add('#f06a4a', '#f06a4a')];
  T.stall = {
    jp: { awn: T.red, awn2: T.white, inner: P.add('#2b1f16', '#2b1f16'), counter: T.wood, goodA: P.add('#5aa7d8', '#5aa7d8'), goodB: T.white, apron: T.happi, sign: null },
    cn: { awn: P.add('#b8322b', '#b8322b'), awn2: P.add('#e0b85a', '#e0b85a'), inner: P.add('#3a1a14', '#3a1a14'), counter: P.add('#8a2e26', '#8a2e26'), goodA: T.white, goodB: T.yellow, apron: T.red, sign: T.yellow, signText: T.red },
    tw: { awn: P.add('#d94a3a', '#d94a3a'), awn2: null, inner: P.add('#2a1e1a', '#2a1e1a'), counter: T.metal, goodA: T.white, goodB: T.yellow, apron: T.red, sign: T.white, signText: T.red },
    kr: { awn: P.add('#3a66b8', '#3a66b8'), awn2: T.white, inner: P.add('#1c2238', '#1c2238'), counter: T.wood, goodA: T.red, goodB: P.add('#3a66b8', '#3a66b8'), apron: T.white, sign: null },
    us: { awn: P.add('#d94a3a', '#d94a3a'), awn2: T.white, inner: P.add('#1c2238', '#1c2238'), counter: T.woodLight, goodA: T.red, goodB: T.yellow, apron: P.add('#3a66b8', '#3a66b8'), sign: T.yellow, signText: T.red },
    uk: { awn: P.add('#3a66b8', '#3a66b8'), awn2: T.red, inner: P.add('#2b1f16', '#2b1f16'), counter: T.wood, goodA: P.add('#8a5a3a', '#8a5a3a'), goodB: T.white, apron: T.white, sign: T.white, signText: P.add('#3a66b8', '#3a66b8') },
  };
  const r = new Raster(400, 400, T.bg);
  const rngf = rng(20261019);
  skyBands(r, [[120, T.sky1], [60, T.sky2], [40, T.sky3]]);
  stars(r, 40, 150, T.lineDim, rngf);
  const G = 300; // ground line (eye level)
  r.rect(0, 220, 400, 180, T.ground);
  groundSpeckle(r, 221, 400, T.groundLit, rngf, 0.025);
  // fireworks (modest, behind the trees)
  firework(r, 120, 48, 30, T.fire1, { rays: 14, kind: 'dots', c2: T.fire2 });
  firework(r, 290, 36, 24, T.fire3, { rays: 12, kind: 'dots', c2: T.fire5 });
  firework(r, 215, 80, 14, T.fire4, { rays: 10, kind: 'dots', c2: T.fire5 });
  fireworkTrail(r, 120, 150, 80, T.fire2); fireworkTrail(r, 290, 140, 62, T.fire5);
  // trees as silhouettes behind everything
  tree(r, 30, 222, 95, T.treeSil, rngf); tree(r, 365, 222, 110, T.treeSil, rngf); tree(r, 200, 222, 70, T.treeSil, rngf);
  // back row of stalls (smaller) on the far edge of the square
  stallRow(r, 246, T, { xs: [4, 62, 120, 230, 288, 346], rngf, w: 50, h: 32 });
  // yagura in the middle, dancers around it
  const RA = { rx: 112, ry: 20, n: 30, rx2: 160, ry2: 36, n2: 34, rngf };
  rings(r, 'back', 200, 302, T, RA);
  const Y = yagura(r, 200, G, T, { w: 110, h: 125 });
  lanternStrings(r, Y, T, { groundY: G });
  performers(r, Y, T);
  rings(r, 'front', 200, 302, T, RA);
  // visitors and gags
  bench(r, 40, 268, T); figure(r, 46, 252, { kind: 'human', pose: 'sit', h: 16, c: { line: T.line, head: T.skin, cloth: T.cloths[2], cloth2: T.obi, eye: T.eye } }); zz(r, 50, 250, T.lineDim);
  visitors(r, [[86, 268, 'phone', 'ai'], [96, 268, 'idle', 'human', 1], [330, 268, 'wave', 'human'], [342, 268, 'hold', 'aiScreen'], [305, 270, 'walk', 'human'], [150, 262, 'lean', 'human'], [262, 262, 'idle', 'ai']], T, rngf);
  loadingBar(r, 258, 240, T, 4);                     // the AI visitor is still "loading" its dance
  lantern(r, 342, 236, T, { size: 'S', body: T.lanterns[0], cap: T.line }); r.rect(341, 236, 3, 1, T.line); // lantern held upside down (cap at the bottom)
  cat(r, 118, 278, T.line, T.goldfish);               // a cat under the Taiwanese stall with a stolen snack
  goldfishBag(r, 301, 262, T);                        // the walking visitor carries a goldfish bag
  figure(r, 374, 284, { kind: 'human', pose: 'up', h: 16, flip: true, c: { line: T.line, head: T.skin, cloth: T.cloths[5], cloth2: T.obi, eye: T.eye } }); r.line(372, 276, 368, 272, T.line); // the one dancer facing the wrong way
  // front-row foreground: two big figures with their backs to us, watching
  figure(r, 60, 330, { kind: 'ai', pose: 'up', h: 24, c: { line: T.line, head: T.aiHead, cloth: T.cloths[0], eye: T.eye } });
  figure(r, 345, 330, { kind: 'human', pose: 'idle', h: 24, c: { line: T.line, head: T.skin, cloth: T.cloths[3], cloth2: T.obi, eye: T.eye } });
  // ground glow under the yagura
  for (let i = -70; i < 70; i += 2) r.set(200 + i + (i & 1), G + 2 + ((i >> 2) & 1), T.groundLit2);
  return { id: 'A_yoru_no_hayashi', title: 'A 夜の囃子', note: 'night, eye level, warm lanterns on a dark ground; closest to the app background', P, r };
}

/* ------------------------------------------------------------------ proposal B: 浮世絵 (print, elevated view) */

function proposalB() {
  const P = new Palette();
  const T = P.theme({
    paper: '#efe3c6', frame: '#1a1a1a', sky1: '#3a3f4a', sky2: '#56606e', sky3: '#8c8f95', ground: '#c9b58c', groundDark: '#9e8a63',
    line: '#2b2320', lineDim: '#5c5048', white: '#f6f0dc', red: '#c0392b', wood: '#7b5a3a', woodLight: '#b48a5a', roof: '#2f4858',
    skin: '#e8c9a0', aiHead: '#5b6b8c', eye: '#2f7f8f', happi: '#2a4d7a', obi: '#c0392b', pole: '#4d4036', string: '#4d4036',
    lanternStripe: '#a33a2b', lanternHi: '#fbf2dc', barrel: '#8a4a26', barrelDark: '#5a2f18', kitBass: '#2f5f66', kitSnare: '#e0cfa8', kitTom: '#4a7c5a',
    metal: '#7f8690', cymbal: '#d4a84a', clapMark: '#e0b85a', yellow: '#e0b85a', bulb: '#fbf2dc', bulbCord: '#4d4036',
    water: '#5a8fb8', goldfish: '#d85a2a', treeSil: '#2b3a3a', fire1: '#e9c46a', fire2: '#f6f0dc', fire3: '#c0392b', river: '#4f7fa3', river2: '#3a6185',
  });
  T.cloths = [P.add('#2a4d7a', '#2a4d7a'), P.add('#f6f0dc', '#f6f0dc'), P.add('#6b3a5a', '#6b3a5a'), P.add('#c0392b', '#c0392b'), P.add('#4a7c5a', '#4a7c5a'), P.add('#d88a3a', '#d88a3a')];
  T.lanterns = [P.add('#e07a4a', '#e07a4a'), P.add('#fbf2dc', '#fbf2dc'), P.add('#e0b85a', '#e0b85a')];
  const inner = P.add('#5a4a3a', '#5a4a3a');
  T.stall = {
    jp: { awn: T.red, awn2: T.white, inner, counter: T.wood, goodA: P.add('#5a8fb8', '#5a8fb8'), goodB: T.white, apron: T.happi, sign: null },
    cn: { awn: P.add('#a0302a', '#a0302a'), awn2: T.yellow, inner, counter: P.add('#7a2a22', '#7a2a22'), goodA: T.white, goodB: T.yellow, apron: T.red, sign: T.yellow, signText: T.red },
    tw: { awn: P.add('#c85a3a', '#c85a3a'), awn2: null, inner, counter: T.metal, goodA: T.white, goodB: T.yellow, apron: T.red, sign: T.white, signText: T.red },
    kr: { awn: P.add('#3a5f9a', '#3a5f9a'), awn2: T.white, inner, counter: T.wood, goodA: T.red, goodB: P.add('#3a5f9a', '#3a5f9a'), apron: T.white, sign: null },
    us: { awn: P.add('#c85a3a', '#c85a3a'), awn2: T.white, inner, counter: T.woodLight, goodA: T.red, goodB: T.yellow, apron: P.add('#3a5f9a', '#3a5f9a'), sign: T.yellow, signText: T.red },
    uk: { awn: P.add('#3a5f9a', '#3a5f9a'), awn2: T.red, inner, counter: T.wood, goodA: P.add('#8a5a3a', '#8a5a3a'), goodB: T.white, apron: T.white, sign: T.white, signText: P.add('#3a5f9a', '#3a5f9a') },
  };
  const r = new Raster(400, 400, T.paper);
  const rngf = rng(7);
  // print area with a paper margin and a thin frame
  const M = 10;
  r.rect(M, M, 400 - 2 * M, 400 - 2 * M, T.sky1);
  r.box(M - 1, M - 1, 400 - 2 * M + 2, 400 - 2 * M + 2, T.frame);
  // bokashi sky: dark at the top, lighter towards the horizon (three flat bands + dithered seams)
  r.rect(M, 70, 400 - 2 * M, 50, T.sky2); r.rect(M, 120, 400 - 2 * M, 30, T.sky3);
  for (let x = M; x < 400 - M; x++) { if ((x & 1) === 0) r.set(x, 69, T.sky2); if ((x & 1) === 1) r.set(x, 71, T.sky1); if ((x & 1) === 0) r.set(x, 119, T.sky3); if ((x & 1) === 1) r.set(x, 121, T.sky2); }
  // river at the bottom like the Ryogoku print; the festival square is a bank above it
  const G = 262;
  r.rect(M, 150, 400 - 2 * M, G + 40 - 150, T.ground);
  r.rect(M, G + 40, 400 - 2 * M, 400 - M - G - 40, T.river);
  for (let y = G + 44; y < 400 - M; y += 6) for (let x = M + (y % 12 ? 0 : 3); x < 400 - M; x += 9) r.hline(x, x + 3, y, T.river2);
  // star fireworks (ukiyo-e style: straight rays) and a thin rising arc
  for (const [cx, cy, rad] of [[300, 40, 9], [330, 62, 7], [275, 70, 6], [350, 30, 6], [315, 90, 5], [290, 22, 5], [255, 48, 4]]) firework(r, cx, cy, rad, T.fire2, { rays: 8, kind: 'star' });
  for (let t = 0; t < 100; t++) { const x = 150 + t * 0.35, y = 170 - Math.sin((t / 100) * Math.PI) * 120; if (t % 2) r.set(Math.round(x), Math.round(y), T.fire3); }
  // far bank: tree line
  for (let x = M + 6; x < 400 - M; x += 14) tree(r, x, 152, 16 + Math.round(rngf() * 6), T.treeSil, rngf);
  // stalls in a receding row on the left and right, yagura centre; figures smaller (elevated view)
  stallRow(r, 206, T, { xs: [16, 64, 112, 236, 284, 332], rngf, w: 46, h: 30 });
  const RB = { rx: 96, ry: 16, n: 28, rx2: 140, ry2: 28, n2: 32, rngf, sizeFront: 12, sizeBack: 10, kinds: ['human', 'ai', 'human', 'human', 'aiScreen', 'human', 'aiDiamond'] };
  rings(r, 'back', 200, 266, T, RB);
  const Y = yagura(r, 200, G, T, { w: 96, h: 108 });
  lanternStrings(r, Y, T, { groundY: G, poles: [[24, 0.5], [376, 0.5], [104, 0.4], [296, 0.4]], size: 'S', lightRange: false });
  performers(r, Y, T);
  rings(r, 'front', 200, 266, T, RB);
  visitors(r, [[40, 236, 'idle', 'human'], [52, 236, 'phone', 'ai', 1], [350, 236, 'wave', 'aiScreen'], [362, 236, 'hold', 'human'], [140, 232, 'walk', 'human'], [262, 232, 'idle', 'ai']], T, rngf);
  bench(r, 70, 286, T); figure(r, 76, 270, { kind: 'ai', pose: 'sit', h: 16, c: { line: T.line, head: T.aiHead, cloth: T.cloths[2], eye: T.eye } }); zz(r, 80, 268, T.lineDim);
  cat(r, 300, 298, T.line, T.goldfish);
  goldfishBag(r, 136, 226, T);
  // boats on the river with a few figures (the Ryogoku memory)
  for (const [bx, by] of [[40, 330], [120, 352], [250, 340], [330, 365], [190, 378]]) {
    r.rect(bx, by, 26, 4, T.wood); r.hline(bx - 2, bx + 27, by, T.woodLight); r.rect(bx + 4, by - 5, 16, 5, T.white);
    figure(r, bx + 8, by - 11, { kind: 'human', pose: 'idle', h: 10, c: { line: T.line, head: T.skin, cloth: T.cloths[0], eye: T.eye } });
    figure(r, bx + 17, by - 11, { kind: 'ai', pose: 'wave', h: 10, c: { line: T.line, head: T.aiHead, cloth: T.cloths[3], eye: T.eye } });
  }
  // title cartouche (red tablet, top right) and a seal (bottom left): plain blocks, no real text
  r.rect(352, 18, 30, 44, T.red); r.box(352, 18, 30, 44, T.line); for (let i = 0; i < 4; i++) r.rect(360, 22 + i * 9, 14, 3, T.white);
  r.rect(16, 352, 14, 22, T.red); r.rect(19, 356, 8, 14, T.white);
  return { id: 'B_ukiyoe', title: 'B 浮世絵', note: 'woodblock print: flat colours, keyline, bokashi sky, star fireworks, river with boats, paper margin', P, r };
}

/* ------------------------------------------------------------------ proposal C: 見下ろし (bird's-eye) */

function proposalC() {
  const P = new Palette();
  const T = P.theme({
    bg: '#0a0a0a', sky1: '#12142a', sky2: '#24214a', sky3: '#4a3560', ground: '#262330', ground2: '#2e2a3a', path: '#3d3747', groundLit: '#4a3a28',
    line: '#0a0a0a', lineDim: '#4a4a55', white: '#f4efe6', red: '#c23b3b', wood: '#6b4a2b', woodLight: '#a67c4e', roof: '#2d4a52',
    skin: '#f0c9a0', aiHead: '#2a3b57', eye: '#3fc1b0', happi: '#1f3a73', obi: '#d04a4a', pole: '#2a2a2a', string: '#6a6255',
    lanternStripe: '#b0392f', lanternHi: '#fff6d8', barrel: '#7a3f1e', barrelDark: '#4a2512', kitBass: '#1f5f66', kitSnare: '#d9c7a3', kitTom: '#3a7d44',
    metal: '#9aa0a8', cymbal: '#e0b85a', clapMark: '#ffe08a', yellow: '#f2c94c', bulb: '#ffe9a6', bulbCord: '#3a3a3a',
    water: '#5aa7d8', goldfish: '#f06a3a', treeSil: '#121a16', roofLight: '#4a7480', roofDark: '#1c3036', spotPool: '#5a5230', fire1: '#ffb066', fire2: '#f2c94c', fire3: '#3fc1b0', fire4: '#f08aa0', fire5: '#f4efe6',
  });
  T.cloths = [P.add('#2d4a8a', '#2d4a8a'), P.add('#f4efe6', '#f4efe6'), P.add('#6b3a7a', '#6b3a7a'), P.add('#c23b3b', '#c23b3b'), P.add('#3a7d44', '#3a7d44'), P.add('#e8943a', '#e8943a')];
  T.lanterns = [P.add('#f06a4a', '#f06a4a'), P.add('#fff2cc', '#fff2cc'), P.add('#f2c94c', '#f2c94c'), P.add('#8ccf6a', '#8ccf6a')];
  const awn = (a, b) => ({ awn: a, awn2: b });
  const r = new Raster(400, 400, T.bg);
  const rngf = rng(99);
  // sky strip at the top with fireworks, then the square seen from above at an angle
  skyBands(r, [[60, T.sky1], [20, T.sky2], [12, T.sky3]]);
  stars(r, 30, 70, T.lineDim, rngf);
  firework(r, 80, 28, 22, T.fire1, { rays: 16, kind: 'willow', c2: T.fire2 });
  firework(r, 300, 22, 18, T.fire3, { rays: 12, kind: 'dots', c2: T.fire5 });
  firework(r, 200, 40, 12, T.fire4, { rays: 10, kind: 'dots', c2: T.fire5 });
  fireworkTrail(r, 80, 92, 50, T.fire2); fireworkTrail(r, 300, 92, 40, T.fire5);
  r.rect(0, 92, 400, 308, T.ground);
  for (let x = 0; x < 400; x += 12) tree(r, x + 4, 100, 14 + ((x >> 3) % 5), T.treeSil, rngf); // tree line at the far edge
  // the square: a lighter ellipse of trodden ground, paths from the corners
  r.ellipse(200, 250, 165, 118, T.ground2);
  for (const [x0, y0] of [[0, 395], [399, 395]]) r.line(x0, y0, 200, 300, T.path);
  // stalls around the edge, drawn as top-down 3/4 boxes with awnings facing the centre
  const stallsTop = [[40, 120, 'jp'], [110, 112, 'cn'], [250, 112, 'tw'], [320, 120, 'kr'], [8, 300, 'us'], [338, 300, 'uk']];
  for (const [x, y, k] of stallsTop) {
    const A = { jp: awn(T.red, T.white), cn: awn(P.add('#b8322b', '#b8322b'), T.yellow), tw: awn(P.add('#d94a3a', '#d94a3a'), null), kr: awn(P.add('#3a66b8', '#3a66b8'), T.white), us: awn(P.add('#d94a3a', '#d94a3a'), T.white), uk: awn(P.add('#3a66b8', '#3a66b8'), T.red) }[k];
    r.rect(x, y, 52, 22, A.awn); if (A.awn2 != null) for (let i = 0; i < 52; i += 8) r.rect(x + i, y, 4, 22, A.awn2);
    r.box(x, y, 52, 22, T.line);
    r.rect(x + 2, y + 22, 48, 8, T.wood); r.hline(x + 2, x + 49, y + 22, T.woodLight); // counter facing the square
    for (let i = 5; i < 48; i += 6) r.rect(x + i, y + 24, 3, 3, i % 12 ? T.white : T.yellow);
    for (let i = 4; i < 52; i += 10) r.set(x + i, y + 31, T.bulb);
    if (T.groundLit != null) for (let i = 2; i < 50; i += 3) r.set(x + i, y + 33 + (i % 2), T.groundLit);
    figure(r, x + 26, y + 10, { kind: rngf() < 0.5 ? 'human' : 'ai', pose: 'idle', h: 10, c: { line: T.line, head: T.skin, cloth: T.cloths[3], eye: T.eye } }); // vendor inside
    r.rect(x, y, 52, 8, A.awn); // awning covers the vendor's head a little
    if (k === 'cn') { lantern(r, x + 6, y - 6, T, { size: 'S', body: T.red, cap: T.line }); lantern(r, x + 46, y - 6, T, { size: 'S', body: T.red, cap: T.line }); }
    if (k === 'uk') for (let i = 2; i < 52; i += 6) r.set(x + i, y - 1, i % 12 ? T.red : T.white);
    if (k === 'us') r.set(x + 26, y - 2, T.yellow);
    // customers in front of the counter (backs to the stall)
    for (let i = 0; i < 3; i++) topFigure(r, x + 10 + i * 16, y + 38, { kind: i === 1 ? 'ai' : 'human', pose: 'idle', c: { line: T.line, cloth: T.cloths[(i + 2) % 6], head: T.skin, eye: T.eye } });
  }
  // dancer rings first (they pass behind the yagura's north side), then the yagura on top
  const cx = 200, cy = 236;
  const ringTop = (rad, ry, n, off, poseEvery) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + off;
      const x = Math.round(cx + Math.cos(a) * rad), y = Math.round(cy + 10 + Math.sin(a) * ry);
      topFigure(r, x, y, { kind: i % 3 === 1 ? 'ai' : 'human', pose: i % poseEvery === 0 ? 'idle' : 'up', c: { line: T.line, cloth: T.cloths[(i * 5) % 6], head: T.skin, eye: T.eye } });
    }
  };
  ringTop(78, 56, 40, 0.1, 9);
  ringTop(112, 80, 48, 0.3, 6);
  ringTop(146, 100, 40, 0.5, 4);
  // yagura seen from above at an angle: deck (top face), curtain (south face), pyramid roof
  const D0 = cx - 40, D1 = cx + 40, DT = cy - 34, DB = cy + 8;
  r.rect(D0, DB, 81, 30, T.white); for (let x = D0; x <= D1; x += 8) r.rect(x, DB + 2, 4, 28, T.red); r.box(D0, DB, 81, 30, T.line); // south face
  r.rect(D0, DT, 81, DB - DT + 1, T.woodLight); for (let y = DT + 3; y < DB; y += 4) r.hline(D0 + 1, D1 - 1, y, T.wood); r.box(D0, DT, 81, DB - DT + 1, T.line); // deck boards
  r.box(D0 + 2, DT + 2, 77, DB - DT - 3, T.wood); // railing seen from above
  const RX = 24, RY = 16, rcx = cx, rcy = cy - 16;
  for (let y = -RY; y <= RY; y++) for (let x = -RX; x <= RX; x++) {
    const u = x / RX, v = y / RY; if (Math.abs(u) > 1 || Math.abs(v) > 1) continue;
    const facet = Math.abs(u) > Math.abs(v) ? (u < 0 ? 'w' : 'e') : (v < 0 ? 'n' : 's');
    r.set(rcx + x, rcy + y, facet === 's' ? T.roofLight : facet === 'n' ? T.roofDark : T.roof);
  }
  r.box(rcx - RX, rcy - RY, 2 * RX + 1, 2 * RY + 1, T.line); r.line(rcx - RX, rcy - RY, rcx + RX, rcy + RY, T.line); r.line(rcx + RX, rcy - RY, rcx - RX, rcy + RY, T.line);
  r.set(rcx, rcy, T.lanternHi);
  // eave lanterns along the roof's south and side edges
  for (let x = rcx - RX + 2; x <= rcx + RX - 2; x += 6) { r.set(x, rcy + RY + 1, T.line); r.rect(x - 1, rcy + RY + 2, 3, 3, T.lanterns[(x >> 1) % T.lanterns.length]); }
  // performers on the south part of the deck, in front of the roof: taiko (left), wood block in a spotlight (centre), kit (right)
  taiko(r, D0 + 3, DB - 18, T); figure(r, D0 + 3, DB - 12, { kind: 'human', pose: 'drum', h: 12, c: { line: T.line, head: T.skin, cloth: T.happi, eye: T.eye } });
  r.disc(cx, DB - 3, 6, T.spotPool);
  woodBlock(r, cx - 2, DB - 8, T); figure(r, cx - 6, DB - 12, { kind: 'aiDiamond', pose: 'drum', h: 12, c: { line: T.line, head: T.aiHead, cloth: T.cloths[2], eye: T.eye } });
  r.set(cx + 10, DB - 11, T.clapMark); r.set(cx + 11, DB - 13, T.clapMark);
  drumKit(r, D1 - 30, DB - 17, T); figure(r, D1 - 4, DB - 12, { kind: 'ai', pose: 'drumKit', h: 12, flip: true, c: { line: T.line, head: T.aiHead, cloth: T.cloths[1], eye: T.eye } });
  // lantern strings radiating from the roof apex to eight poles
  const poles = [[30, 150], [370, 150], [16, 250], [384, 250], [50, 365], [350, 365], [150, 392], [250, 392]];
  for (const [px, py] of poles) {
    r.rect(px - 1, py - 2, 3, 3, T.pole); r.set(px, py - 3, T.line);
    const fx = rcx + Math.sign(px - rcx) * RX, fy = py < rcy ? rcy - RY : rcy + (py > 300 ? RY : 0);
    const n = Math.max(Math.abs(px - fx), Math.abs(py - fy));
    for (let i = 0; i <= n; i++) {
      const t = i / n; const x = Math.round(fx + (px - fx) * t), y = Math.round(fy + (py - fy) * t + 6 * 4 * t * (1 - t));
      r.set(x, y, T.string);
      if (i % 12 === 6 && i > 4 && i < n - 4) { r.rect(x - 1, y + 1, 3, 4, T.lanterns[(i + px) % T.lanterns.length]); r.set(x, y + 1, T.line); r.hline(x - 1, x + 1, y + 5, T.line); }
    }
  }
  // gags: a figure dancing the opposite way (outside the ring, arms down), a cat crossing the path, one AI "loading", a sleeper on a bench
  topFigure(r, 118, 318, { kind: 'human', pose: 'idle', c: { line: T.line, cloth: T.cloths[5], head: T.skin, eye: T.eye } }); r.set(118, 324, T.line);
  cat(r, 180, 372, T.line, T.goldfish);
  topFigure(r, 262, 330, { kind: 'ai', pose: 'idle', c: { line: T.line, cloth: T.cloths[0], head: T.skin, eye: T.eye } }); loadingBar(r, 258, 322, T, 5);
  bench(r, 300, 350, T); r.rect(302, 346, 8, 3, T.cloths[1]); r.set(301, 346, T.skin); zz(r, 312, 346, T.lineDim);
  goldfishBag(r, 96, 336, T); topFigure(r, 100, 338, { kind: 'human', pose: 'idle', c: { line: T.line, cloth: T.cloths[2], head: T.skin, eye: T.eye } });
  return { id: 'C_mioroshi', title: 'C 見下ろし', note: 'bird\'s-eye: the ring of dancers reads as a circle, stalls around the square, strings radiate; dusk at the top', P, r };
}

/* ------------------------------------------------------------------ proposal D: 墨と浅葱 (ink and the app accent) */

function proposalD() {
  const P = new Palette();
  const ink = '#f0f0f0', asagi = '#3fc1b0', asagiDark = '#0f8a80', orange = '#ffb066', grey = '#767676', dim = '#3a3a3a';
  const T = P.theme({
    bg: '#0a0a0a', line: ink, lineDim: grey, white: ink, red: ink, wood: grey, woodLight: ink, roof: grey,
    skin: '#0a0a0a', aiHead: '#0a0a0a', eye: asagi, happi: '#0a0a0a', obi: asagiDark, pole: grey, string: dim,
    lanternStripe: asagiDark, lanternHi: ink, barrel: grey, barrelDark: dim, kitBass: dim, kitSnare: grey, kitTom: dim,
    metal: grey, cymbal: orange, clapMark: orange, yellow: orange, bulb: orange, bulbCord: dim, water: asagi, goldfish: orange,
    treeSil: '#141414', fire1: asagi, fire2: ink, fire3: asagiDark, spot: '#151515', ground: '#0a0a0a', groundLit: '#241a12',
  });
  T.cloths = [P.add('#0a0a0a', '#0a0a0a'), P.add(dim, dim), P.add(asagiDark, asagiDark), P.add('#0a0a0a', '#0a0a0a')];
  T.lanterns = [P.add(orange, orange), P.add('#0a0a0a', '#0a0a0a'), P.add(asagiDark, asagiDark)];
  const S = { awn: ink, awn2: null, inner: '#0a0a0a', counter: '#0a0a0a', goodA: orange, goodB: asagi, apron: '#0a0a0a', sign: null };
  T.stall = {}; for (const k of STALL_KINDS) T.stall[k] = { ...S, inner: P.add('#0a0a0a', '#0a0a0a'), counter: P.add('#0a0a0a', '#0a0a0a'), awn2: k === 'uk' || k === 'us' || k === 'jp' ? grey : null };
  const r = new Raster(400, 400, T.bg);
  const rngf = rng(3);
  const G = 310;
  // fireworks in asagi, drawn as thin willow lines; one in ink
  firework(r, 110, 56, 44, T.fire1, { rays: 18, kind: 'willow', c2: T.fire2 });
  firework(r, 300, 44, 34, T.fire3, { rays: 14, kind: 'willow', c2: T.fire1 });
  firework(r, 225, 96, 16, T.fire2, { rays: 10, kind: 'dots' });
  fireworkTrail(r, 110, 180, 96, T.fire3); fireworkTrail(r, 300, 170, 76, T.fire3);
  // a single horizon line and a tree in silhouette outlined in grey
  r.hline(0, 399, 230, T.lineDim);
  tree(r, 40, 230, 120, T.treeSil, rngf); tree(r, 370, 230, 100, T.treeSil, rngf);
  // stalls as outlines only (ink lines on dark), a few orange goods and asagi bulbs
  stallRow(r, 252, T, { xs: [8, 66, 124, 226, 284, 342], rngf, w: 50, h: 32 });
  const RD = { rx: 112, ry: 20, n: 26, rx2: 160, ry2: 36, n2: 28, rngf, lineOnly: true };
  rings(r, 'back', 200, 312, T, RD);
  const Y = yagura(r, 200, G, T, { w: 116, h: 130, curtain: 'outline' });
  lanternStrings(r, Y, T, { groundY: G, size: 'L', poles: [[26, 0.55], [374, 0.55], [100, 0.45], [300, 0.45]] });
  performers(r, Y, T, { lineOnly: true });
  rings(r, 'front', 200, 312, T, RD);
  visitors(r, [[70, 282, 'phone', 'ai'], [82, 282, 'idle', 'human', 1], [330, 282, 'wave', 'human'], [344, 282, 'hold', 'aiScreen'], [160, 274, 'lean', 'human']], T, rngf, { lineOnly: true });
  bench(r, 30, 288, T); figure(r, 36, 272, { kind: 'human', pose: 'sit', h: 16, lineOnly: true, c: { line: T.line, eye: T.eye } }); zz(r, 40, 270, T.lineDim);
  cat(r, 126, 292, T.line, T.goldfish);
  loadingBar(r, 66, 256, T, 2);
  // foreground: three big lanterns hanging close to the viewer, in orange with ink ribs (the near-far contrast)
  for (const [x, y, k] of [[38, 330, 0], [86, 346, 2], [360, 338, 0]]) {
    r.vline(x, y - 14, y, T.string);
    lantern(r, x, y, T, { size: 'L', body: T.lanterns[k], stripe: T.lanternStripe, cap: T.line, hi: T.lanternHi });
    for (let j = 3; j < 12; j += 2) r.hline(x - 2, x + 2, y + j, T.lanternStripe);
  }
  // a jellyfish-shaped lantern among them (a quiet cameo)
  r.vline(300, 336, 348, T.string); r.disc(300, 352, 5, T.lanterns[2]); r.ring(300, 352, 5, T.line); r.rect(295, 352, 11, 6, T.bg); r.hline(296, 304, 352, T.line);
  for (const dx of [-3, -1, 1, 3]) r.line(300 + dx, 353, 300 + dx * 2, 364, T.eye);
  return { id: 'D_sumi_to_asagi', title: 'D 墨と浅葱', note: 'monochrome ink lines with the app accent (asagi) and lantern orange only; near lanterns large, far figures as lines', P, r };
}

/* ------------------------------------------------------------------ proposal E: 8 ビット (console chibi, chunky 2x) */

function proposalE() {
  const P = new Palette();
  const T = P.theme({
    bg: '#0a0a0a', sky1: '#1a1040', sky2: '#30206a', sky3: '#5a3a8a', ground: '#2a5a2a', ground2: '#3a7a3a', dirt: '#8a5a2a',
    line: '#0a0a0a', lineDim: '#505070', white: '#ffffff', red: '#ff4040', wood: '#a06030', woodLight: '#e0a060', roof: '#4060a0',
    skin: '#ffd0a0', aiHead: '#4060c0', eye: '#40ffe0', happi: '#2040c0', obi: '#ff4040', pole: '#505070', string: '#c0c0c0',
    lanternStripe: '#c02020', lanternHi: '#ffffff', barrel: '#a06030', barrelDark: '#603010', kitBass: '#2060a0', kitSnare: '#ffe0a0', kitTom: '#40a040',
    metal: '#c0c0c0', cymbal: '#ffe040', clapMark: '#ffe040', yellow: '#ffe040', bulb: '#ffffa0', bulbCord: '#505070',
    water: '#60c0ff', goldfish: '#ff8040', treeSil: '#103020', fire1: '#ff8040', fire2: '#ffe040', fire3: '#40ffe0', fire4: '#ff60c0', fire5: '#ffffff', spot: '#5a4a20',
  });
  T.cloths = [P.add('#2040c0', '#2040c0'), P.add('#ffffff', '#ffffff'), P.add('#c040c0', '#c040c0'), P.add('#ff4040', '#ff4040'), P.add('#40a040', '#40a040'), P.add('#ff8040', '#ff8040')];
  T.lanterns = [P.add('#ff6040', '#ff6040'), P.add('#ffffa0', '#ffffa0'), P.add('#ffe040', '#ffe040'), P.add('#80e060', '#80e060')];
  const r = new Raster(200, 200, T.bg);
  const rngf = rng(42);
  skyBands(r, [[70, T.sky1], [20, T.sky2], [15, T.sky3]]);
  stars(r, 24, 70, T.lineDim, rngf);
  // big fireworks
  firework(r, 48, 26, 22, T.fire1, { rays: 16, kind: 'dots', c2: T.fire2 });
  firework(r, 152, 22, 18, T.fire3, { rays: 12, kind: 'dots', c2: T.fire5 });
  firework(r, 100, 44, 10, T.fire4, { rays: 8, kind: 'star' });
  fireworkTrail(r, 48, 90, 48, T.fire2); fireworkTrail(r, 152, 90, 40, T.fire5);
  // grass platform with a dirt path (like an RPG town square)
  r.rect(0, 105, 200, 95, T.ground);
  for (let y = 106; y < 200; y += 4) for (let x = (y % 8 ? 0 : 2); x < 200; x += 8) r.set(x + 1, y, T.ground2);
  r.rect(0, 150, 200, 14, T.dirt);
  for (let x = 8; x < 200; x += 24) tree(r, x, 106, 20, T.treeSil, rngf);
  // stalls: small 30px wide chibi boxes
  const K = [['jp', T.red, T.white], ['cn', P.add('#c02020', '#c02020'), T.yellow], ['tw', P.add('#ff6040', '#ff6040'), null], ['kr', P.add('#4080ff', '#4080ff'), T.white], ['us', P.add('#ff6040', '#ff6040'), T.white], ['uk', P.add('#4080ff', '#4080ff'), T.red]];
  const sx = [2, 36, 70, 104, 138, 172];
  K.forEach(([k, a, b], i) => {
    const x = sx[i], y = 112;
    r.rect(x, y + 6, 26, 14, P.add('#302030', '#302030')); r.vline(x, y + 6, y + 22, T.wood); r.vline(x + 25, y + 6, y + 22, T.wood);
    r.rect(x - 1, y, 28, 6, a); if (b != null) for (let i2 = 0; i2 < 28; i2 += 6) r.rect(x - 1 + i2, y, 3, 6, b);
    r.rect(x + 1, y + 16, 24, 6, T.wood); r.hline(x, x + 25, y + 16, T.woodLight);
    for (let i2 = 3; i2 < 24; i2 += 5) r.rect(x + i2, y + 14, 2, 2, i2 % 10 ? T.white : T.yellow);
    r.set(x + 6, y + 7, T.bulb); r.set(x + 13, y + 7, T.bulb); r.set(x + 20, y + 7, T.bulb);
    chibi(r, x + 13, y + 7, { kind: i % 2 ? 'ai' : 'human', pose: 'idle', c: { line: T.line, skin: T.skin, cloth: T.cloths[(i + 3) % 6], eye: T.eye } });
    r.rect(x + 1, y + 16, 24, 6, T.wood); r.hline(x, x + 25, y + 16, T.woodLight);
    if (k === 'cn') { lantern(r, x + 2, y + 6, T, { size: 'S', body: T.red, cap: T.line }); lantern(r, x + 24, y + 6, T, { size: 'S', body: T.red, cap: T.line }); }
    if (k === 'uk') for (let i2 = 1; i2 < 26; i2 += 4) r.set(x + i2, y + 6, i2 % 8 ? T.red : T.white);
    if (k === 'us') r.set(x + 13, y - 2, T.yellow);
  });
  // yagura: compact two-tier
  const G = 176;
  const ringE = [];
  for (let i = 0; i < 20; i++) { const a = 0.2 + (i / 20) * Math.PI * 2; ringE.push([Math.round(100 + Math.cos(a) * 62), Math.round(176 + Math.sin(a) * 14), i, Math.sin(a) < 0]); }
  ringE.sort((p, q) => p[1] - q[1]);
  const drawRingE = (back) => { for (const [x, y, i, b] of ringE) if (b === back) chibi(r, x, y - 7, { kind: i % 3 === 1 ? 'ai' : 'human', pose: i % 4 === 3 ? 'walk' : 'up', c: { line: T.line, skin: T.skin, cloth: T.cloths[(i * 5) % 6], eye: T.eye }, flip: i % 2 === 0 }); };
  drawRingE(true);
  const Y = yagura(r, 100, G, T, { w: 56, h: 60, eaveLanterns: false });
  lanternStrings(r, Y, T, { groundY: G, poles: [[12, 0.55], [188, 0.55]], size: 'S' });
  // performers in chibi
  taiko(r, Y.ux0 - 2, Y.stageY - 16, T); chibi(r, Y.ux0 - 6, Y.stageY - 8, { kind: 'human', pose: 'up', c: { line: T.line, skin: T.skin, cloth: T.happi, eye: T.eye } });
  drumKit(r, Y.ux1 - 24, Y.stageY - 15, T); chibi(r, Y.ux1 - 4, Y.stageY - 8, { kind: 'ai', pose: 'idle', c: { line: T.line, skin: T.skin, cloth: T.cloths[1], eye: T.eye }, flip: true });
  for (let j = 0; j < 16; j++) r.hline(100 - (j >> 2), 100 + (j >> 2), Y.roofY + 6 + j, T.spot);
  chibi(r, 97, Y.stageY - 8, { kind: 'ai', pose: 'up', c: { line: T.line, skin: T.skin, cloth: T.cloths[2], eye: T.eye } });
  woodBlock(r, 100, Y.stageY - 5, T); r.set(112, Y.stageY - 8, T.clapMark); r.set(113, Y.stageY - 10, T.clapMark);
  drawRingE(false);
  // visitors and gags
  chibi(r, 20, 140, { kind: 'ai', pose: 'idle', c: { line: T.line, skin: T.skin, cloth: T.cloths[0], eye: T.eye } }); loadingBar(r, 16, 134, T, 6);
  chibi(r, 180, 140, { kind: 'human', pose: 'walk', c: { line: T.line, skin: T.skin, cloth: T.cloths[3], eye: T.eye } }); goldfishBag(r, 186, 142, T);
  cat(r, 60, 142, T.line, T.goldfish);
  bench(r, 150, 146, T); chibi(r, 156, 139, { kind: 'human', pose: 'idle', c: { line: T.line, skin: T.skin, cloth: T.cloths[2], eye: T.eye } }); zz(r, 161, 138, T.lineDim);
  chibi(r, 34, 184, { kind: 'human', pose: 'walk', c: { line: T.line, skin: T.skin, cloth: T.cloths[5], eye: T.eye }, flip: true }); r.hline(30, 32, 186, T.line); // the one going the wrong way
  return { id: 'E_8bit', title: 'E 8 ビット', note: 'console style: 200x200 drawn, shown at 2x; chibi figures, saturated palette, big fireworks, RPG town square', P, r: r.scaled(2) };
}

/* ------------------------------------------------------------------ output */

const proposals = [proposalA(), proposalB(), proposalC(), proposalD(), proposalE()];
const summary = [];
for (const p of proposals) {
  const panel = p.r.toPanel();
  const colors = p.P.colors;
  writeFileSync(join(OUT, `${p.id}.png`), R.encodePanelPng(panel, colors, 1));
  writeFileSync(join(OUT, `${p.id}_2x.png`), R.encodePanelPng(panel, colors, 2));
  writeFileSync(join(OUT, `${p.id}.palette.json`), JSON.stringify(colors, null, 1));
  let boardNote = 'board: skipped (--no-board)';
  if (!process.argv.includes('--no-board')) {
    try {
      // Recensio: one 400x400 panel, every pixel through draw_pixels as 'llm' (prov 2), in chunks under MAX_DRAW_DELTA
      const board = R.createBoard({ name: `beatbayashi-matsuri-${p.id}`, w: panel.w, h: panel.h, panels: 1 });
      colors.forEach((c, index) => R.applyOp(board, index < board.palette.colors.length ? 'palette_set' : 'palette_add', { index, hex: c.hex, name: c.name }));
      const id = board.panels[0].id;
      R.applyOp(board, 'set_panel_meta', { panelId: id, title: p.title, note: p.note }, 'llm', { client: 'make_matsuri.mjs', model: 'claude-fable-5-1 + claude-opus-5-5' });
      const pts = [];
      for (let y = 0; y < panel.h; y++) for (let x = 0; x < panel.w; x++) { const v = panel.pixels[y * panel.w + x]; if (v >= 0) pts.push([x, y, v]); }
      for (let i = 0; i < pts.length; i += 4000) R.applyOp(board, 'draw_pixels', { panelId: id, points: pts.slice(i, i + 4000) }, 'llm', { client: 'make_matsuri.mjs', model: 'claude-fable-5-1 + claude-opus-5-5' });
      const ser = R.serializeBoard(board);
      writeFileSync(join(OUT, `${p.id}.board.json`), JSON.stringify(ser));
      const disc = R.buildDisclosure(board);
      writeFileSync(join(OUT, `${p.id}.disclosure.json`), JSON.stringify(disc, null, 1));
      const back = R.normalizeBoard(JSON.parse(JSON.stringify(ser)));
      const bp = R.getPanel(back, id);
      let same = bp.w === panel.w && bp.h === panel.h;
      for (let i = 0; same && i < bp.pixels.length; i++) if (bp.pixels[i] !== panel.pixels[i]) same = false;
      boardNote = `board: ${bp.w}x${bp.h}, provenance=${R.panelLabel(bp)}, round-trip ${same ? 'identical' : 'DIFFERS'}`;
    } catch (e) {
      boardNote = `board: FAILED (${e.message})`;
    }
  }
  const line = `${p.id}: ${panel.w}x${panel.h}, ${colors.length} colours; ${boardNote}`;
  summary.push(line);
  console.log(line);
}
writeFileSync(join(OUT, 'SUMMARY.txt'), summary.join('\n') + '\n');

// contact sheet: the five at 1x in a 3 + 2 grid on the app background (#0a0a0a), 16 px gutters
{
  const gap = 16, W = 3 * 400 + 4 * gap, H = 2 * 400 + 3 * gap;
  const colors = [{ hex: '#0a0a0a' }];
  const px = new Array(W * H).fill(0);
  proposals.forEach((p, k) => {
    const base = colors.length; colors.push(...p.P.colors);
    const ox = gap + (k % 3) * (400 + gap) + (k >= 3 ? (400 + gap) / 2 : 0), oy = gap + Math.floor(k / 3) * (400 + gap);
    for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) { const v = p.r.px[y * 400 + x]; if (v >= 0) px[(oy + y) * W + ox + x] = base + v; }
  });
  writeFileSync(join(OUT, 'contact_sheet.png'), R.encodePanelPng({ w: W, h: H, pixels: px }, colors, 1));
}
console.log(`out: ${OUT}`);
