// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Label icons and the asagi ramp (2026-10-06): size, palette, contrast and provenance.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIXEL_ICONS } from './pixelIconData';
import { LABEL_ICONS } from './labelIcons';
import { ASAGI_RAMP, WARM_HUES, rampFill } from './pixelIconPalette';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('label icons', () => {
  it('maps every label to a drawn icon', () => {
    for (const [k, v] of Object.entries(LABEL_ICONS)) expect(PIXEL_ICONS, k).toHaveProperty(v);
  });

  it('keeps every run inside the 16 x 16 grid without overlaps', () => {
    for (const [name, icon] of Object.entries(PIXEL_ICONS)) {
      const seen = new Set<number>();
      const all = [...icon.main, ...('accent' in icon ? icon.accent : []), ...('ramp' in icon ? icon.ramp : [])];
      for (const [x, y, w] of all) {
        expect(x >= 0 && y >= 0 && y < 16 && w > 0 && x + w <= 16, name).toBe(true);
        for (let i = x; i < x + w; i++) {
          expect(seen.has(y * 16 + i), `${name} ${i},${y}`).toBe(false);
          seen.add(y * 16 + i);
        }
      }
    }
  });

  it('uses ramp levels 1..5 only', () => {
    for (const icon of Object.values(PIXEL_ICONS))
      if ('ramp' in icon) for (const r of icon.ramp) {
        expect([1, 2, 3, 4, 5]).toContain(r[3]);
        expect([0, 1, 2, 3]).toContain(r[4]);
      }
  });

  it('keeps the functional icons as they were (owner 2026-10-06: only roles get warm colours)', () => {
    for (const n of ['speaker', 'speaker-off', 'play', 'stop', 'rewind', 'gear', 'plus', 'minus', 'floppy', 'download', 'upload', 'trash', 'undo', 'redo', 'fit', 'close', 'keys', 'sliders', 'wave'] as const)
      expect('ramp' in PIXEL_ICONS[n], n).toBe(false);
  });

  it('gives the instruments warm colours', () => {
    for (const n of ['kick', 'tom', 'cymbal', 'clap', 'drum', 'note'] as const) {
      const icon = PIXEL_ICONS[n];
      expect('ramp' in icon && icon.ramp.some((r) => r[4] > 0), n).toBe(true);
    }
  });
});

describe('asagi ramp', () => {
  // The default asagi, resolved the way color-mix(in srgb) does.
  const BASE = [0x0f, 0x8a, 0x80];
  const resolved = ASAGI_RAMP.map((r) => {
    const t = r.toward === 'white' ? 255 : 0;
    return '#' + BASE.map((c) => Math.round((c * r.percent + t * (100 - r.percent)) / 100).toString(16).padStart(2, '0')).join('');
  });

  it('goes from dark to light in one hue', () => {
    const l = resolved.map(lum);
    for (let i = 1; i < l.length; i++) expect(l[i]).toBeGreaterThan(l[i - 1]);
  });

  it('shades 3-5 keep >= 3:1 against the dark background', () => {
    for (const hex of resolved.slice(2)) expect(contrast(hex, '#0a0a0a'), hex).toBeGreaterThanOrEqual(3);
  });

  it('matches the preview colours in source/ramp.mjs', () => {
    const src = fs.readFileSync(path.join(HERE, 'source', 'ramp.mjs'), 'utf8');
    ASAGI_RAMP.forEach((r, i) => expect(src).toContain(`{ token: '${r.token}', hex: '${resolved[i]}' }`));
  });

  it('builds fills from the base token without a colour of its own', () => {
    expect(rampFill(3)).toBe('var(--pixel-icon-asagi-3, var(--pixel-icon-asagi, currentColor))');
    expect(rampFill(1, 'var(--x)')).toBe('var(--pixel-icon-asagi-1, color-mix(in srgb, var(--x) 45%, black))');
  });
});

describe('warm ramps', () => {
  it('outline shades 3-5 of yellow, orange and red keep >= 3:1 on the dark background', () => {
    const src = fs.readFileSync(path.join(HERE, 'source', 'ramp.mjs'), 'utf8');
    for (const h of WARM_HUES) {
      const line = src.split('\n').find((l) => l.trim().startsWith(`${h}: [`));
      expect(line, h).toBeDefined();
      const hexes = [...line!.matchAll(/#[0-9a-f]{6}/g)].map((x) => x[0]);
      expect(hexes.length).toBe(5);
      for (let i = 1; i < 5; i++) expect(lum(hexes[i])).toBeGreaterThan(lum(hexes[i - 1]));
      for (const hex of hexes.slice(2)) expect(contrast(hex, '#0a0a0a'), `${h} ${hex}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('reads the theme ramp tokens, else mixes without a colour of its own', () => {
    expect(rampFill(3, undefined, 2)).toBe('var(--app-orange-3, var(--pixel-icon-orange, currentColor))');
    expect(rampFill(5, undefined, 3)).toBe('var(--app-red-5, color-mix(in srgb, var(--pixel-icon-red, currentColor) 30%, white))');
  });
});

describe('provenance', () => {
  it('every board pixel is drawn by the llm actor (disclosure 100%)', () => {
    const files = fs.readdirSync(path.join(HERE, 'source')).filter((f) => f.endsWith('.disclosure.json'));
    expect(files.length).toBe(4);
    for (const f of files) {
      const d = JSON.parse(fs.readFileSync(path.join(HERE, 'source', f), 'utf8'));
      expect(d.summary.aiPercentOfOpaque, f).toBe(100);
      expect(d.summary.humanPixels + d.summary.importedPixels, f).toBe(0);
      expect(d.summary.originUnknownPresent, f).toBe(false);
    }
  });
});
