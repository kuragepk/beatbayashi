// BeatBayashi ui16 icon set (2026-10-03). New tool, written for this set (pattern taken from
// ../../final_shade3/tools/make_shade.mjs: Recensio imported read-only, every pixel drawn through
// applyOp(draw_pixels) with actor 'llm' so its prov is 2, then panels exported as .panel.json).
// Outputs: ui16-<n>.board.json + .disclosure.json, <icon>.panel.json, svg/<icon>.svg, png/<icon>_{1,2,4}x.png,
// icons.runs.json (row runs read back from the boards), and the app's generated data module (--emit-ts <path>).
// Usage: node make_ui16.mjs [--recensio <dir>] [--out <dir>] [--emit-ts <path>] (path options: paths.mjs)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { ICONS as BASE_ICONS } from './icons16.mjs';
import { LABEL_ICONS } from './icons16-labels.mjs';
import { HUES, SHADES, CODES } from './ramp.mjs';

// ui16 (29, 2026-10-03) followed by the label icons (2026-10-06); the old order is kept so boards a/b keep their icons.
const ICONS = { ...BASE_ICONS, ...LABEL_ICONS };
import { loadRecensio, outDir } from './paths.mjs';

const { createBoard, applyOp, serializeBoard, exportPanelJson, buildDisclosure, normalizeBoard, getPanel, PROV, encodePanelPng } = await loadRecensio();

const OUT = outDir(); // --out / UI16_OUT / BEATBAYASHI_OUT_DIR, see paths.mjs
const META = { client: 'claude-code', model: 'claude-opus-5-5' };
const N = 16;
mkdirSync(`${OUT}/svg`, { recursive: true });
mkdirSync(`${OUT}/png`, { recursive: true });
// Board palette: index 0 stands for currentColor, index 1 for the accent token. The hexes are only the
// stand-ins used in the PNG previews: U2 palette cream #eeeeee and U2 teal #3fc1b0.
// Indices 2..6 are the asagi ramp (2026-10-06, owner: wider light-dark range of the current asagi), see ramp.mjs.
// Indices 2.. are the hue ramps, 5 shades each, in HUES order: index 2 + hue * 5 + (level - 1).
const PREVIEW = [['currentColor', '#eeeeee'], ['accent', '#3fc1b0'], ...HUES.flatMap((h, i) => SHADES[i].map((hex, l) => [`${h}-${l + 1}`, hex]))];
const CODE = { '#': 0, a: 1 };
HUES.forEach((h, i) => [...CODES[h]].forEach((ch, l) => { CODE[ch] = 2 + i * 5 + l; }));

const names = Object.keys(ICONS);
const chunks = [];
for (let i = 0; i < names.length; i += 16) chunks.push(names.slice(i, i + 16));
const runsOut = {};
chunks.forEach((group, bi) => {
  const bname = `ui16-${String.fromCharCode(97 + bi)}`;
  let board = createBoard({ name: `beatbayashi-${bname}`, w: N, h: N, panels: group.length });
  PREVIEW.forEach(([name, hex], index) => applyOp(board, index < board.palette.colors.length ? 'palette_set' : 'palette_add', { index, hex, name }));
  group.forEach((name, i) => {
    const id = board.order[i];
    const ic = ICONS[name];
    applyOp(board, 'set_panel_meta', { panelId: id, title: name, note: `ui16 ${name}: ${ic.meaning}${ic.from ? `; derived from ${ic.from}` : ''}` }, 'llm', META);
    const points = [];
    ic.rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch in CODE) points.push([x, y, CODE[ch]]); }));
    applyOp(board, 'draw_pixels', { panelId: id, points }, 'llm', META);
  });
  const ser = serializeBoard(board);
  writeFileSync(`${OUT}/${bname}.board.json`, JSON.stringify(ser));
  writeFileSync(`${OUT}/${bname}.disclosure.json`, JSON.stringify(buildDisclosure(board), null, 1));
  // read back from the serialized board: the outputs below come from Recensio's data, not from the ASCII
  board = normalizeBoard(JSON.parse(JSON.stringify(ser)));
  group.forEach((name, i) => {
    const id = board.order[i];
    writeFileSync(`${OUT}/${name}.panel.json`, JSON.stringify(exportPanelJson(board, id)));
    const p = getPanel(board, id);
    for (let k = 0; k < N * N; k++) if (p.pixels[k] >= 0 && p.prov[k] !== PROV.LLM) throw new Error(`${name}: pixel ${k} prov ${p.prov[k]}`);
    const runs = { main: [], accent: [], ramp: [] };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; ) {
      const c = p.pixels[y * N + x];
      if (c < 0) { x++; continue; }
      let w = 1; while (x + w < N && p.pixels[y * N + x + w] === c) w++;
      if (c >= 2) runs.ramp.push([x, y, w, ((c - 2) % 5) + 1, Math.floor((c - 2) / 5)]); else (c === 0 ? runs.main : runs.accent).push([x, y, w]);
      x += w;
    }
    runsOut[name] = { meaning: ICONS[name].meaning, board: bname, panelId: id, ...runs };
    const rect = ([x, y, w], fill) => `<rect x="${x}" y="${y}" width="${w}" height="1"${fill}/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" fill="currentColor">`
      + runs.main.map((r) => rect(r, '')).join('')
      + runs.accent.map((r) => rect(r, ' style="fill:var(--pixel-icon-accent,currentColor)"')).join('')
      + runs.ramp.map((r) => rect(r, ` style="fill:${SHADES[r[4]][r[3] - 1]}"`)).join('') + '</svg>\n';
    writeFileSync(`${OUT}/svg/${name}.svg`, svg);
    for (const s of [1, 2, 4]) writeFileSync(`${OUT}/png/${name}_${s}x.png`, encodePanelPng(p, board.palette.colors, s));
  });
});
writeFileSync(`${OUT}/icons.runs.json`, JSON.stringify(runsOut, null, 1));
console.log('icons', names.length, 'boards', chunks.length);

const emit = process.argv.indexOf('--emit-ts');
if (emit > 0) {
  const path = process.argv[emit + 1];
  const body = names.map((n) => {
    const r = runsOut[n];
    const acc = (r.accent.length ? `, accent: ${JSON.stringify(r.accent)}` : '') + (r.ramp.length ? `, ramp: ${JSON.stringify(r.ramp)}` : '');
    return `  // ${r.meaning}\n  '${n}': { main: ${JSON.stringify(r.main)}${acc} },`;
  }).join('\n');
  const ts = `// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// GENERATED FILE - do not hand-edit. Regenerate with source/make_ui16.mjs
// (--emit-ts <this file>). Source: the ui16 Recensio boards in source/ (every
// pixel has provenance "llm", drawn 2026-10-03 by claude-code / claude-opus-5-5;
// the authored grids are source/icons16.mjs). Each entry lists horizontal pixel
// runs [x, y, width] on a 16 x 16 grid. "main" runs are drawn in currentColor,
// "accent" runs in the one optional accent token, "ramp" runs [x, y, width,
// level, hue]: shade 1 (darkest) .. 5 (lightest) of hue 0 asagi, 1 yellow,
// 2 orange, 3 red, see pixelIconPalette.ts. Label icons added 2026-10-06.

export type PixelRun = readonly [number, number, number];
export type PixelRampRun = readonly [number, number, number, 1 | 2 | 3 | 4 | 5, 0 | 1 | 2 | 3];
export interface PixelIconData {
  main: readonly PixelRun[];
  accent?: readonly PixelRun[];
  ramp?: readonly PixelRampRun[];
}

export const PIXEL_ICONS = {
${body}
} as const satisfies Record<string, PixelIconData>;

export type PixelIconName = keyof typeof PIXEL_ICONS;
`;
  writeFileSync(path, ts);
  console.log('wrote', path);
}
