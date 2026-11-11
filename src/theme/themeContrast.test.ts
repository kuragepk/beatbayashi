// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Owner decisions #70-71 (2026-09-27): every one of the 15 preset themes must
// keep body text readable against its own surface. Reads the generated
// themes.css directly (no DOM/CSS-cascade dependency, matching the kit's own
// test/theme-check.test.mjs style) rather than trusting the generator by
// construction -- a bad hand-edit or a stale sync would otherwise ship
// silently.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, RATIO_TEXT } from './kit/theme-check.js';
import { THEME_LIST } from './themeStore';

const CSS = readFileSync(new URL('./kit/themes.css', import.meta.url), 'utf8');

/** Extracts the base (no data-sub-palette) block's custom properties for a
 *  theme id, as a role->hex map, e.g. { surface: '#101018', text: '#f2f2f0' }. */
function baseColorsFor(themeId: string): Record<string, string> {
  const re = new RegExp(
    `\\[data-theme="${themeId}"\\]\\s*\\{([^}]*)\\}`
  );
  const match = CSS.match(re);
  if (!match) return {};
  const out: Record<string, string> = {};
  const propRe = /--theme-color-([a-z]+):\s*(#[0-9a-fA-F]{6})\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = propRe.exec(match[1]))) {
    out[m[1]] = m[2];
  }
  return out;
}

describe('every preset theme keeps text readable against surface', () => {
  const withColor = THEME_LIST.filter((t) => t.id !== 'modern');

  it('the catalogue actually lists themes to check (guards an empty catalogue passing vacuously)', () => {
    expect(withColor.length).toBeGreaterThan(0);
  });

  it.each(withColor.map((t) => t.id))('%s: text vs surface >= 4.5:1', (themeId) => {
    const colors = baseColorsFor(themeId);
    // A theme file with no "color" map at all (there are none among the 15
    // shared presets today, but the rule should not silently pass one that
    // slips through) fails loudly rather than being skipped.
    expect(colors.text, `${themeId} has no --theme-color-text`).toBeTruthy();
    expect(colors.surface, `${themeId} has no --theme-color-surface`).toBeTruthy();
    const ratio = contrastRatio(colors.text, colors.surface);
    expect(ratio).toBeGreaterThanOrEqual(RATIO_TEXT);
  });
});
