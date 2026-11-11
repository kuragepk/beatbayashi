// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Owner request 2026-10-06: headings and labels must read clearly on the
// dark default theme. Headings >= 7:1, every label >= 4.5:1 (WCAG 2.x
// contrast), computed from the default-theme colours the components use
// (theme-bridge.css :root values, and the var() fallbacks where the default
// theme leaves a token unset).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(fileURLToPath(new URL('./theme-bridge.css', import.meta.url)), 'utf8');
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
const defaultBlock = css.slice(css.indexOf(":root:not([data-theme])"));
function token(name: string): string {
  const re = new RegExp(`--app-${name}:\\s*(#[0-9a-fA-F]{6})\\b`);
  const m = rootBlock.match(re) ?? defaultBlock.match(re);
  if (!m) throw new Error(`no default for --app-${name}`);
  return m[1];
}

// Backgrounds as rendered in the default theme.
const PANEL = token('panel'); // panel body, sequencer
const BG = token('bg'); // page, controls body
const HEADER = '#161616'; // PanelFrame header: var(--app-panel-alt, #161616)
const LABEL_CELL = '#1c1c1c'; // lane label cell: var(--app-panel-alt, #1c1c1c)
const GROUP = '#1c1c1c'; // BPM/Length/Resolution frame: var(--app-panel-alt, #1c1c1c)

const cases: { what: string; fg: string; bg: string; min: number }[] = [
  { what: 'panel heading (SEQUENCER, CONTROLS, …)', fg: token('text'), bg: HEADER, min: 7 },
  { what: 'LAYOUT CUSTOM heading', fg: token('text'), bg: BG, min: 7 },
  { what: 'BPM / Length / Resolution labels', fg: token('text'), bg: GROUP, min: 4.5 },
  { what: 'slider labels (Swing, Master volume)', fg: token('text'), bg: BG, min: 4.5 },
  { what: 'lane names', fg: token('ok'), bg: LABEL_CELL, min: 4.5 },
  { what: 'bar numbers and step status', fg: token('muted'), bg: PANEL, min: 4.5 },
  { what: 'control and pad edges', fg: token('border-strong'), bg: PANEL, min: 3 },
  // Owner decision 2026-10-06: darker sub ON accepted below 3:1; ON has a
  // lighter top edge and glow as a second cue (SequencerGrid.tsx).
  { what: 'sub pad ON vs sub pad OFF (owner-accepted, edge cue)', fg: token('sub-on'), bg: token('sub-off'), min: 3 },
  { what: 'sub pad frame on the panel', fg: token('sub-frame'), bg: PANEL, min: 3 },
  { what: 'sub pad frame vs black sub OFF fill', fg: token('sub-frame'), bg: token('sub-off'), min: 3 },
  { what: 'main ON vs sub ON (sub is darker)', fg: token('asagi-3'), bg: token('sub-on'), min: 1.4 },
  { what: 'disabled text', fg: token('disabled'), bg: PANEL, min: 3 },
  { what: 'text on a raised control', fg: token('text'), bg: token('raised'), min: 7 },
  { what: 'text on hover', fg: token('text'), bg: token('hover'), min: 7 },
  ...(['asagi', 'blue', 'purple', 'red', 'orange', 'yellow', 'indigo', 'sea'] as const).flatMap((hue) => [
    { what: `${hue} step 4 (labels, bands) on the panel`, fg: token(`${hue}-4`), bg: PANEL, min: 7 },
    { what: `${hue} step 3 (lit fill) edge on the panel`, fg: token(`${hue}-3`), bg: PANEL, min: 3 },
    { what: `dark text on ${hue} step 4`, fg: token('bg'), bg: token(`${hue}-4`), min: 7 },
    { what: `primary text on ${hue} step 1`, fg: token('text'), bg: token(`${hue}-1`), min: 7 },
  ]),
];

describe('accent ramps share one lightness per step (owner 2026-10-06)', () => {
  for (const step of [1, 2, 3, 4, 5]) {
    it(`step ${step}: every hue within 2% of the asagi luminance`, () => {
      const ref = luminance(token(`asagi-${step}`));
      for (const hue of ['blue', 'purple', 'red', 'orange', 'yellow', 'indigo', 'sea']) {
        const l = luminance(token(`${hue}-${step}`));
        expect(Math.abs(l - ref) / ref).toBeLessThan(0.02);
      }
    });
  }
});

describe('default theme contrast (owner 2026-10-06)', () => {
  for (const c of cases) {
    it(`${c.what}: ${c.fg} on ${c.bg} >= ${c.min}:1`, () => {
      expect(contrast(c.fg, c.bg)).toBeGreaterThanOrEqual(c.min);
    });
  }
  it('prints the ratios', () => {
    const lines = cases.map((c) => `${c.what}: ${contrast(c.fg, c.bg).toFixed(2)}:1`);
    expect(lines.length).toBe(cases.length);
    console.log(lines.join('\n'));
  });
});
