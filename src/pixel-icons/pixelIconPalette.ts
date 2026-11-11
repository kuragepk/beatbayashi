// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Asagi ramp for the pixel icons (2026-10-06). Owner, same day: the current
// asagi (teal) may use a wider light-dark range so the icons read better.
// One hue, five lightness steps, 1 = darkest .. 5 = lightest. No colour is
// set here (isolation.test.ts): every shade is a mix of one base token with
// black or white, so the ramp follows whatever accent the theme passes.
//   base: the icon's `accent` prop, else --pixel-icon-asagi, else currentColor.
//   each shade can also be overridden whole with --pixel-icon-asagi-<n>.
// Shades 1-2 are interior shading only; 3-5 may form a silhouette on the dark
// background (>= 3:1 with the default asagi, see labelIcons.test.ts).
// source/ramp.mjs holds the same mixes resolved for the default asagi (preview hexes).
export const ASAGI_RAMP = [
  { token: '--pixel-icon-asagi-1', percent: 45, toward: 'black' },
  { token: '--pixel-icon-asagi-2', percent: 75, toward: 'black' },
  { token: '--pixel-icon-asagi-3', percent: 100, toward: 'black' },
  { token: '--pixel-icon-asagi-4', percent: 65, toward: 'white' },
  { token: '--pixel-icon-asagi-5', percent: 30, toward: 'white' },
] as const;

export type RampLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Warm hues (owner 2026-10-06, later the same day: asagi plus yellow, orange
 * and red as in the app icon, so instrument and section icons read by
 * colour). Hue index 1..3 in a ramp run. Each shade reads the theme's
 * --app-<hue>-<n> (orange and red exist in theme-bridge.css, matched to the
 * asagi lightness), else mixes --pixel-icon-<hue> (else currentColor) with
 * black or white in the same steps as the asagi ramp.
 */
export const WARM_HUES = ['yellow', 'orange', 'red'] as const;
export type RampHue = 0 | 1 | 2 | 3;

/** CSS fill for ramp level 1..5 of a hue. Asagi (0) mixes from `base` (a CSS colour or var()). */
export const rampFill = (level: RampLevel, base?: string, hue: RampHue = 0): string => {
  const r = ASAGI_RAMP[level - 1];
  if (hue > 0) {
    const h = WARM_HUES[hue - 1];
    const b = `var(--pixel-icon-${h}, currentColor)`;
    const mix = r.percent === 100 ? b : `color-mix(in srgb, ${b} ${r.percent}%, ${r.toward})`;
    return `var(--app-${h}-${level}, ${mix})`;
  }
  const b = base ?? 'var(--pixel-icon-asagi, currentColor)';
  const mix = r.percent === 100 ? b : `color-mix(in srgb, ${b} ${r.percent}%, ${r.toward})`;
  return `var(${r.token}, ${mix})`;
};
