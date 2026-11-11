// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Pixel-art scene toolkit for the "matsuri-beat" background picture (2026-10-19, claude-fable-5-1).
// Everything here is drawn by code into an Int16Array of palette indices; no image is traced or
// imported. Reference photos were only looked at for proportions (<refs-dir>/matsuri-beat,
// SPATIAL_NOTES.md there). The scene painters take a theme T: a map from a colour role to a
// palette index, so one composition can be rendered in several palettes.

/* ------------------------------------------------------------------ raster */

export class Raster {
  constructor(w, h, fill = -1) {
    this.w = w; this.h = h;
    this.px = new Int16Array(w * h).fill(fill);
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c) {
    if (c == null || c < 0) return;
    x |= 0; y |= 0;
    if (this.in(x, y)) this.px[y * this.w + x] = c;
  }
  get(x, y) { return this.in(x, y) ? this.px[y * this.w + x] : -1; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  box(x, y, w, h, c) { this.hline(x, x + w - 1, y, c); this.hline(x, x + w - 1, y + h - 1, c); this.vline(x, y, y + h - 1, c); this.vline(x + w - 1, y, y + h - 1, c); }
  hline(x0, x1, y, c) { if (x0 > x1) [x0, x1] = [x1, x0]; for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  vline(x, y0, y1, c) { if (y0 > y1) [y0, y1] = [y1, y0]; for (let y = y0; y <= y1; y++) this.set(x, y, c); }
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  disc(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) this.set(cx + x, cy + y, c);
  }
  ring(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d <= r * r + r * 0.5 && d >= (r - 1) * (r - 1) + (r - 1) * 0.5) this.set(cx + x, cy + y, c);
    }
  }
  ellipse(cx, cy, rx, ry, c, fill = true) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const v = (x * x) / (rx * rx + 0.01) + (y * y) / (ry * ry + 0.01);
      if (fill ? v <= 1 : v <= 1 && v >= 0.72) this.set(cx + x, cy + y, c);
    }
  }
  /** Draw ASCII rows; map is {char: index}; '.' and unmapped chars are skipped. */
  stamp(rows, x, y, map, { flip = false } = {}) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || map[ch] == null) continue;
        this.set(flip ? x + row.length - 1 - i : x + i, y + j, map[ch]);
      }
    }
  }
  blit(src, x, y) {
    for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
      const v = src.px[j * src.w + i];
      if (v >= 0) this.set(x + i, y + j, v);
    }
  }
  scaled(n) {
    const out = new Raster(this.w * n, this.h * n);
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.px[y * out.w + x] = this.px[((y / n) | 0) * this.w + ((x / n) | 0)];
    return out;
  }
  /** Replace every pixel equal to `from` with `to` inside a rect. */
  swap(from, to, x = 0, y = 0, w = this.w, h = this.h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.get(i, j) === from) this.set(i, j, to);
  }
  toPanel() { return { w: this.w, h: this.h, pixels: Array.from(this.px) }; }
}

export class Palette {
  constructor() { this.colors = []; this.byName = {}; }
  add(name, hex) {
    if (this.byName[name] != null) return this.byName[name];
    if (this.colors.length >= 62) throw new Error(`palette full (62) adding ${name}`);
    const i = this.colors.length;
    this.colors.push({ hex: hex.toLowerCase(), name });
    this.byName[name] = i;
    return i;
  }
  /** Build a role map from {role: hex}. Roles sharing a hex share an index. */
  theme(roles) {
    const T = {};
    for (const [role, hex] of Object.entries(roles)) T[role] = this.add(hex.toLowerCase(), hex);
    return T;
  }
}

/* ------------------------------------------------------------------ deterministic random */

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* ------------------------------------------------------------------ figures (side view) */

/**
 * A person-like figure seen from the side/front. Humans are stick figures with a small yukata body;
 * AI figures have a square, screen or diamond head with lit eyes. Both share one skeleton so they
 * stand at the same height (the owner's "者" who meet as equals).
 *  kind: 'human' | 'ai' | 'aiScreen' | 'aiDiamond'
 *  pose: 'idle' | 'up' | 'oneUp' | 'wave' | 'walk' | 'sit' | 'clap' | 'drum' | 'drumKit' | 'hold' | 'phone' | 'lean'
 *  c: {line, head, cloth, cloth2, eye, skin}
 *  h: total height in px (10 or 16 work best)
 */
export function figure(r, x, y, { kind = 'human', pose = 'idle', c, h = 16, flip = false, lineOnly = false, headStyle = 'ring' } = {}) {
  const rh = h >= 14 ? 2 : 1;          // head radius
  const cx = x;                         // centre column
  const headY = y + rh;
  const neck = y + 2 * rh + 1;
  const hip = y + Math.round(h * 0.6);
  const feet = y + h - 1;
  const al = Math.max(3, Math.round(h * 0.28)); // arm length
  const L = c.line, f = flip ? -1 : 1;

  // head
  if (kind === 'human') {
    // headStyle (line figures): 'ring' = the original ring (its inside reads as a small plus),
    // 'filled' = a solid round head, 'outline' = only the round outline with an empty inside.
    if (lineOnly && headStyle === 'filled') r.disc(cx, headY, rh, L);
    else if (lineOnly && headStyle === 'outline') { for (let j = -rh - 1; j <= rh + 1; j++) for (let i = -rh - 1; i <= rh + 1; i++) { const d = i * i + j * j; if (d >= (rh - 0.5) ** 2 && d <= (rh + 0.5) ** 2) r.set(cx + i, headY + j, L); } }
    else if (lineOnly) r.ring(cx, headY, rh, L); else { r.disc(cx, headY, rh, c.head ?? c.skin ?? L); r.ring(cx, headY, rh, L); }
  } else if (kind === 'ai') {
    const s = rh;
    r.rect(cx - s, headY - s, 2 * s + 1, 2 * s + 1, L);
    if (!lineOnly && h >= 14) r.rect(cx - s + 1, headY - s + 1, 2 * s - 1, 2 * s - 1, c.head ?? L);
    r.set(cx - (s > 1 ? 1 : 0), headY, c.eye); r.set(cx + (s > 1 ? 1 : 0), headY, c.eye);
    r.set(cx, y - 1, L); // antenna
  } else if (kind === 'aiScreen') {
    const s = rh;
    r.rect(cx - s - 1, headY - s, 2 * s + 3, 2 * s + 1, L);
    if (!lineOnly && h >= 14) r.rect(cx - s, headY - s + 1, 2 * s + 1, 2 * s - 1, c.head ?? L);
    r.hline(cx - 1, cx + 1, headY, c.eye); // one bar eye
  } else if (kind === 'aiDiamond') {
    const s = rh + 1;
    for (let j = -s; j <= s; j++) { const w = s - Math.abs(j); r.hline(cx - w, cx + w, headY + j, lineOnly ? -1 : (c.head ?? L)); r.set(cx - w, headY + j, L); r.set(cx + w, headY + j, L); }
    r.set(cx, headY, c.eye);
  }

  // torso
  if (pose === 'sit') {
    const seat = y + Math.round(h * 0.55);
    r.vline(cx, neck, seat, L);
    if (!lineOnly && h >= 14) { r.vline(cx - 1, neck + 1, seat, c.cloth); r.vline(cx + 1, neck + 1, seat, c.cloth); }
    r.hline(cx, cx + 3 * f, seat, L); r.vline(cx + 3 * f, seat, feet, L); // thigh + shin
    r.line(cx, neck + 1, cx + 2 * f, neck + 3, L); r.line(cx + 2 * f, neck + 3, cx + 3 * f, neck + 2, L); // arm on knee
    return;
  }
  r.vline(cx, neck, hip, L);
  if (!lineOnly && h >= 14) {
    r.vline(cx - 1, neck + 1, hip, c.cloth);
    r.vline(cx + 1, neck + 1, hip, c.cloth);
    if (c.cloth2 != null) r.hline(cx - 1, cx + 1, hip - 2, c.cloth2); // obi
  } else if (!lineOnly && h >= 10 && kind === 'human') {
    r.vline(cx, neck + 1, hip - 1, c.cloth);
  }

  // legs
  const spread = h >= 14 ? 2 : 1;
  if (pose === 'walk') { r.line(cx, hip, cx - spread, feet, L); r.line(cx, hip, cx + spread, feet - 1, L); }
  else if (pose === 'drumKit') { r.line(cx, hip, cx + spread * f, feet, L); r.line(cx, hip, cx + 1 * f, hip + 3, L); }
  else { r.line(cx, hip, cx - spread, feet, L); r.line(cx, hip, cx + spread, feet, L); }

  // arms
  const sh = neck + 1;
  const arm = (dx, dy, dx2, dy2) => { r.line(cx, sh, cx + dx, sh + dy, L); if (dx2 != null) r.line(cx + dx, sh + dy, cx + dx + dx2, sh + dy + dy2, L); };
  switch (pose) {
    case 'up': arm(-al, -al); arm(al, -al); break;                         // both hands up (bon odori)
    case 'oneUp': arm(-al, 1); arm(al, -al); break;                        // one hand up
    case 'wave': arm(-al, al - 1); arm(al, -1, 1, -al + 1); break;          // waving
    case 'walk': arm(-al + 1, al - 1); arm(al - 1, al - 2); break;
    case 'clap': arm(-al + 1, -1, al - 2, -1); arm(al - 1, -1, -al + 2, -1); break; // hands together in front
    case 'drum': arm(-al, -al + 1, 2, -2); arm(al, 1); break;             // stick raised
    case 'drumKit': arm(-al + 1, 2); arm(al - 1, 1); break;
    case 'hold': arm(al, -2, 0, -1); arm(-al + 1, al - 1); break;          // holding something up
    case 'phone': arm(al - 1, -2); arm(-al + 1, al - 1); break;
    case 'lean': arm(-al, al - 2); arm(al, al - 2); break;
    case 'idle': default: arm(-al + 1, al - 1); arm(al - 1, al - 1); break;
  }
}

/* ------------------------------------------------------------------ small objects */

/** A chochin lantern hanging from (x, y) (top of the string knot). size 'S' 3x4, 'M' 5x7, 'L' 7x10. */
export function lantern(r, x, y, c, { size = 'M', body, stripe, cap, hi } = {}) {
  const W = size === 'S' ? 3 : size === 'L' ? 7 : 5;
  const H = size === 'S' ? 4 : size === 'L' ? 10 : 7;
  const x0 = x - (W >> 1);
  r.vline(x, y, y + 1, cap);
  r.hline(x0 + 1, x0 + W - 2, y + 2, cap);
  for (let j = 3; j < H + 2; j++) {
    const w = (j === 3 || j === H + 1) ? W - 2 : W;
    const xx = x - (w >> 1);
    r.hline(xx, xx + w - 1, y + j, body);
  }
  if (stripe != null && H >= 7) { r.hline(x - 1, x + 1, y + 4, stripe); r.hline(x - 1, x + 1, y + H - 1, stripe); }
  if (hi != null) r.set(x0 + 1, y + 4, hi);
  r.hline(x0 + 1, x0 + W - 2, y + H + 2, cap);
  if (size === 'L') r.vline(x, y + H + 3, y + H + 4, cap);
}

/** Catenary string from (x0,y0) to (x1,y1) with sag; returns points for lanterns every `step` px. */
export function lanternString(r, x0, y0, x1, y1, sag, c, step = 13, phase = 0) {
  const pts = [];
  const n = Math.max(2, Math.abs(x1 - x0));
  let last = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t));
    if (last) r.line(last[0], last[1], x, y, c); last = [x, y];
    if ((i + phase) % step === Math.floor(step / 2) && i > 3 && i < n - 3) pts.push([x, y]);
  }
  return pts;
}

/** Chrysanthemum firework: dotted rays with a drooping tail. */
export function firework(r, cx, cy, rad, c, { rays = 12, kind = 'dots', rngf = Math.random, c2 } = {}) {
  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * Math.PI * 2 + (kind === 'star' ? 0 : 0.1);
    const dx = Math.cos(a), dy = Math.sin(a);
    if (kind === 'star') { r.line(cx, cy, cx + dx * rad, cy + dy * rad, c); continue; }
    const steps = Math.max(3, Math.round(rad / 3));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const droop = kind === 'willow' ? t * t * rad * 0.5 : t * t * 3;
      const px = cx + dx * rad * t, py = cy + dy * rad * t + droop;
      if (kind === 'dots' && s % 2 === 0 && s < steps - 1) continue;
      r.set(Math.round(px), Math.round(py), s === steps && c2 != null ? c2 : c);
    }
  }
  if (c2 != null) r.set(cx, cy, c2);
}

export function fireworkTrail(r, x, y0, y1, c) { for (let y = y0; y > y1; y -= 2) r.set(x, y, c); }

/** Side-view yagura (two-tier festival tower) with the stage top at (cx, topY) and ground at groundY. */
export function yagura(r, cx, groundY, T, { w = 110, h = 120, curtain = 'stripes', eaveLanterns = true } = {}) {
  const baseH = Math.round(h * 0.45);          // red/white curtain tier
  const baseY = groundY - baseH;
  const upperW = Math.round(w * 0.7);
  const upperH = Math.round(h * 0.38);
  const upperY = baseY - upperH;
  const roofY = upperY - Math.round(h * 0.17);
  const x0 = cx - (w >> 1), x1 = cx + (w >> 1);
  // base curtain: red/white stripes (photos), or only an outline with folds (ink proposal)
  if (curtain === 'outline') {
    r.rect(x0, baseY, w, baseH, T.bg ?? T.line);
    for (let x = x0 + 4; x < x1; x += 8) r.vline(x, baseY + 3, groundY - 3, T.lineDim);
  } else {
    r.rect(x0, baseY, w, baseH, T.white);
    for (let x = x0; x <= x1; x += 8) r.rect(x, baseY + 2, 4, baseH - 2, T.red);
  }
  r.hline(x0, x1, baseY + 1, curtain === 'outline' ? T.line : T.red);
  r.box(x0, baseY, w, baseH, T.line);
  // lower floor edge
  r.hline(x0 - 2, x1 + 2, baseY - 1, T.wood); r.hline(x0 - 2, x1 + 2, baseY - 2, T.woodLight);
  // posts of the upper tier: corner posts 2 px, inner posts 1 px
  const ux0 = cx - (upperW >> 1), ux1 = cx + (upperW >> 1);
  for (const px of [ux0 + Math.round(upperW / 3), ux1 - Math.round(upperW / 3)]) r.vline(px, roofY + 2, baseY - 2, T.wood);
  for (const px of [ux0, ux1 - 1]) { r.vline(px, roofY + 2, baseY - 2, T.woodLight); r.vline(px + 1, roofY + 2, baseY - 2, T.wood); }
  r.vline(ux0 - 1, roofY + 2, baseY - 2, T.line); r.vline(ux1 + 1, roofY + 2, baseY - 2, T.line);
  // the corner posts of the base tier continue down to the ground (seen through the curtain top)
  r.vline(x0, baseY - 2, groundY, T.line); r.vline(x1, baseY - 2, groundY, T.line);
  // railing
  const railY = baseY - Math.round(upperH * 0.35);
  r.hline(ux0, ux1, railY, T.woodLight); r.hline(ux0, ux1, railY + 1, T.wood);
  for (let x = ux0 + 3; x < ux1; x += 5) r.vline(x, railY + 2, baseY - 3, T.wood);
  // upper floor
  r.rect(ux0 - 2, upperY + upperH - 4, upperW + 5, 3, T.wood);
  r.hline(ux0 - 2, ux1 + 2, upperY + upperH - 4, T.woodLight);
  // roof
  const rw = upperW + 14;
  for (let j = 0; j < 5; j++) r.hline(cx - (rw >> 1) + j * 2, cx + (rw >> 1) - j * 2, roofY + 4 - j, j === 4 ? T.line : T.roof);
  r.hline(cx - (rw >> 1) - 1, cx + (rw >> 1) + 1, roofY + 5, T.line);
  r.rect(cx - 3, roofY - 2, 7, 3, T.roof); r.set(cx, roofY - 3, T.line); // finial
  // a row of small lanterns hanging under the eaves, all round the upper tier (camp_zama, tatsumi)
  if (eaveLanterns && T.lanterns) {
    let k = 0;
    for (let x = ux0 + 3; x <= ux1 - 3; x += 6) lantern(r, x, roofY + 6, T, { size: 'S', body: T.lanterns[(k++) % T.lanterns.length], cap: T.line });
  }
  // ladder on the right
  const lx = x1 + 3;
  r.line(lx, groundY, lx + 10, baseY - 14, T.wood); r.line(lx + 3, groundY, lx + 13, baseY - 14, T.wood);
  for (let k = 0; k < 6; k++) r.hline(lx + 1 + k * 1.6, lx + 3 + k * 1.6, groundY - 3 - k * 5, T.woodLight);
  return { x0, x1, baseY, upperY, roofY, ux0, ux1, railY, stageY: upperY + upperH - 5, rw };
}

/** Taiko (long-body drum) on its stand, side view, drum face to the right. width ~18. */
export function taiko(r, x, y, T) {
  // body (barrel)
  r.rect(x, y + 2, 10, 10, T.barrel);
  r.vline(x + 1, y + 1, y + 12, T.barrelDark); r.vline(x + 10, y + 1, y + 12, T.barrelDark);
  // face
  r.disc(x + 13, y + 7, 6, T.line); r.disc(x + 13, y + 7, 5, T.white);
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; r.set(Math.round(x + 13 + Math.cos(a) * 4.6), Math.round(y + 7 + Math.sin(a) * 4.6), T.line); }
  // stand
  r.line(x + 2, y + 12, x - 1, y + 17, T.wood); r.line(x + 9, y + 12, x + 12, y + 17, T.wood);
  r.hline(x - 1, x + 12, y + 17, T.wood);
}

/** Wood block on a small stand (BeatBayashi has a "Wood Block" voice, synthPresets.ts). width ~11. */
export function woodBlock(r, x, y, T) {
  const c = T.woodBlock ?? T.woodLight;
  r.rect(x, y, 11, 5, c); r.box(x, y, 11, 5, T.line);
  r.hline(x + 2, x + 8, y + 2, T.line);            // the slit
  r.hline(x + 1, x + 9, y + 1, T.lanternHi ?? c);   // top highlight
  r.vline(x + 2, y + 5, y + 9, T.metal); r.vline(x + 8, y + 5, y + 9, T.metal); r.hline(x + 1, x + 9, y + 9, T.metal);
}

/** Western drum kit, side/front view, width ~26. */
export function drumKit(r, x, y, T) {
  r.disc(x + 10, y + 12, 6, T.line); r.disc(x + 10, y + 12, 5, T.kitBass); r.disc(x + 10, y + 12, 2, T.white); // bass drum
  r.rect(x + 1, y + 5, 7, 4, T.kitSnare); r.box(x + 1, y + 5, 7, 4, T.line); r.hline(x + 2, x + 6, y + 5, T.white); // snare
  r.rect(x + 14, y + 3, 6, 4, T.kitTom); r.box(x + 14, y + 3, 6, 4, T.line); // tom
  r.vline(x + 22, y - 3, y + 17, T.metal); r.hline(x + 17, x + 27, y - 3, T.cymbal); r.hline(x + 18, x + 26, y - 2, T.metal); // ride cymbal
  r.vline(x + 1, y + 9, y + 17, T.metal); r.hline(x - 1, x + 3, y + 17, T.metal); // snare stand
  r.vline(x + 17, y + 7, y + 17, T.metal);
}

/** Open-front stall (yatai). kind: 'jp' | 'cn' | 'tw' | 'kr' | 'us' | 'uk'. w ~52, h ~36. Origin bottom-left at ground. */
export function stall(r, x, groundY, T, kind, { w = 52, h = 36, rngf = Math.random } = {}) {
  const y = groundY - h;
  const counterH = Math.round(h * 0.33);
  const awnY = y, awnH = Math.round(h * 0.22);
  const A = T.stall[kind] ?? T.stall.jp;
  // back wall (dark) and interior light
  r.rect(x + 2, y + awnH, w - 4, h - awnH - counterH, A.inner);
  // posts
  r.vline(x, y + 1, groundY - 1, T.wood); r.vline(x + w - 1, y + 1, groundY - 1, T.wood);
  // awning
  for (let j = 0; j < awnH; j++) r.hline(x - 2 + (j >> 1), x + w + 1 - (j >> 1), awnY + j, A.awn);
  if (A.awn2 != null) for (let i = 0; i < w + 4; i += 6) r.rect(x - 2 + i, awnY + 1, 3, awnH - 2, A.awn2);
  r.hline(x - 2, x + w + 1, awnY + awnH - 1, T.line);
  if (kind === 'uk') for (let i = 2; i < w; i += 7) { r.set(x + i, awnY + awnH, i % 2 ? A.awn2 : A.awn); r.set(x + i, awnY + awnH + 1, i % 2 ? A.awn2 : A.awn); } // bunting
  // sign on the awning
  if (A.sign != null) { r.rect(x + (w >> 1) - 9, awnY + 2, 18, awnH - 4, A.sign); if (A.signText != null) for (let i = 0; i < 4; i++) r.rect(x + (w >> 1) - 7 + i * 4, awnY + 3, 2, awnH - 6, A.signText); }
  // counter
  r.rect(x + 1, groundY - counterH, w - 2, counterH, A.counter);
  r.hline(x, x + w - 1, groundY - counterH, T.woodLight);
  r.hline(x, x + w - 1, groundY - counterH + 1, T.line);
  // goods on the counter: little rows in the stall's accent colours
  for (let i = 4; i < w - 4; i += 5) {
    r.rect(x + i, groundY - counterH - 3, 3, 3, i % 10 ? A.goodA : A.goodB);
  }
  // hanging lamp bulbs under the awning
  for (let i = 6; i < w - 4; i += 9) { r.set(x + i, awnY + awnH, T.bulbCord); r.set(x + i, awnY + awnH + 1, T.bulb); }
  // kind-specific props
  if (kind === 'jp') { r.rect(x + 4, awnY + awnH + 2, 6, 9, T.white); r.rect(x + 5, awnY + awnH + 3, 4, 7, A.goodA); } // noren with 氷
  if (kind === 'cn') { lantern(r, x + 7, awnY + awnH, T, { size: 'S', body: T.red, cap: T.line }); lantern(r, x + w - 8, awnY + awnH, T, { size: 'S', body: T.red, cap: T.line }); r.rect(x + (w >> 1) - 4, groundY - counterH - 7, 8, 4, T.white); r.hline(x + (w >> 1) - 4, x + (w >> 1) + 3, groundY - counterH - 4, T.metal); } // steamer
  if (kind === 'tw') { for (let i = 3; i < w - 3; i += 4) r.set(x + i, awnY + awnH + 2, T.bulb); r.disc(x + (w >> 1) + 8, groundY - counterH - 3, 4, T.metal); r.disc(x + (w >> 1) + 8, groundY - counterH - 3, 2, T.line); } // bulb row + wok
  if (kind === 'kr') { r.rect(x + 5, awnY + awnH + 2, 10, 6, A.goodB); r.rect(x + 6, awnY + awnH + 3, 8, 4, T.white); for (let i = 0; i < 4; i++) r.set(x + w - 14 + i * 3, groundY - counterH - 4, A.goodA); } // sign + skewers
  if (kind === 'us') { r.rect(x + w - 14, groundY - counterH - 9, 8, 9, T.white); r.rect(x + w - 13, groundY - counterH - 8, 6, 3, A.goodA); r.set(x + w - 10, groundY - counterH - 11, T.yellow); } // popcorn box
  if (kind === 'uk') { r.rect(x + 6, groundY - counterH - 6, 9, 6, T.white); r.rect(x + 7, groundY - counterH - 5, 7, 2, A.goodA); r.set(x + 16, groundY - counterH - 4, T.metal); } // tea pot on a tray
  // vendor behind the counter (upper body only, apron)
  const vx = x + (w >> 1) + (kind === 'tw' ? -8 : 0);
  figure(r, vx, groundY - counterH - 14, { kind: rngf() < 0.5 ? 'human' : 'ai', pose: 'idle', c: { line: T.line, head: T.skin, cloth: A.apron, eye: T.eye }, h: 16 });
  r.rect(x + 1, groundY - counterH, w - 2, counterH, A.counter); // redraw counter over the vendor's legs
  r.hline(x, x + w - 1, groundY - counterH, T.woodLight);
  // light pool on the ground
  if (T.groundLit != null) for (let i = 2; i < w - 2; i += 2) r.set(x + i + ((i >> 1) & 1), groundY + 1 + (i % 3), T.groundLit);
  return { x, y, w, h, counterY: groundY - counterH };
}

export function tree(r, x, groundY, h, c, rngf = Math.random) {
  r.rect(x - 1, groundY - Math.round(h * 0.3), 3, Math.round(h * 0.3), c);
  const top = groundY - h;
  for (let k = 0; k < 6; k++) {
    const cy = top + Math.round(h * 0.15) + Math.round(rngf() * h * 0.45);
    const cx = x + Math.round((rngf() - 0.5) * h * 0.5);
    r.disc(cx, cy, Math.round(h * 0.14 + rngf() * h * 0.1), c);
  }
}

export function bench(r, x, y, T) { r.hline(x, x + 11, y, T.woodLight); r.hline(x, x + 11, y + 1, T.wood); r.vline(x + 1, y + 2, y + 4, T.wood); r.vline(x + 10, y + 2, y + 4, T.wood); }

/** A sitting cat (3x5) holding a stolen snack. */
export function cat(r, x, y, c, snack) {
  r.stamp(['k.k', 'kkk', 'kkk', '.kk', '.k.'], x, y, { k: c });
  if (snack != null) r.set(x + 3, y + 2, snack);
}

export function goldfishBag(r, x, y, T) { r.disc(x, y + 2, 2, T.water); r.set(x, y, T.white); r.set(x + 1, y + 2, T.goldfish); }

export function zz(r, x, y, c) { r.stamp(['kk.', '.k.', 'kk.', '...', '..kk', '...k', '..kk'], x, y - 6, { k: c }); }

export function loadingBar(r, x, y, T, filled = 3) { r.box(x, y, 9, 3, T.line); r.rect(x + 1, y + 1, filled, 1, T.eye); }

/* ------------------------------------------------------------------ figures (top-down 3/4) */

const TOP_HUMAN = {
  up: ['.k.k.', '.kck.', 'k.c.k', '.kkk.', '.k.k.'],
  idle: ['..k..', '.ccc.', 'kcccc', '.ccc.', '.k.k.'],
};
const TOP_AI = {
  up: ['.k.k.', '.kkk.', 'kkekk', '.kkk.', '.k.k.'],
  idle: ['..k..', '.kkk.', 'kkekk', '.kkk.', '.k.k.'],
};
export function topFigure(r, x, y, { kind = 'human', pose = 'idle', c }) {
  const rows = (kind === 'human' ? TOP_HUMAN : TOP_AI)[pose] ?? TOP_HUMAN.idle;
  r.stamp(rows, x - 2, y - 2, { k: c.line, c: c.cloth, e: c.eye });
  r.set(x, y - 1, kind === 'human' ? c.head : c.line); // head seen from above
}

/* ------------------------------------------------------------------ figures (chibi, console style) */

// 7 px wide, 8 rows; the bottom row is the feet. 'h' is a hand (skin for humans, line for AI).
const CHIBI = {
  human: {
    idle: ['.......', '..kkk..', '.kkkkk.', '.sksks.', '..sss..', '.hccch.', '..ccc..', '..k.k..'],
    up: ['.h...h.', '.k.k.k.', '.kkkkk.', '.sksks.', '..sss..', '..ccc..', '..ccc..', '..k.k..'],
    walk: ['.......', '..kkk..', '.kkkkk.', '.sksks.', '..sss..', '.hccc..', '..ccch.', '.k...k.'],
  },
  ai: {
    idle: ['...k...', '.kkkkk.', '.kekek.', '.kkkkk.', '..kkk..', '.hccch.', '..ccc..', '..k.k..'],
    up: ['.h.k.h.', '.kkkkk.', '.kekek.', '.kkkkk.', '..kkk..', '..ccc..', '..ccc..', '..k.k..'],
    walk: ['...k...', '.kkkkk.', '.kekek.', '.kkkkk.', '..kkk..', '.hccc..', '..ccch.', '.k...k.'],
  },
};
/** Chibi figure with its feet on row y + 7 and centred on x. */
export function chibi(r, x, y, { kind = 'human', pose = 'idle', c, flip = false }) {
  const rows = (CHIBI[kind] ?? CHIBI.human)[pose] ?? CHIBI.human.idle;
  r.stamp(rows, x - 3, y, { k: c.line, s: c.skin, c: c.cloth, e: c.eye, h: kind === 'ai' ? c.line : c.skin }, { flip });
}
