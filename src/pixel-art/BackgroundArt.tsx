// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { useEffect, useState } from 'react';
import artUrl from './matsuri_bg.png';
import './backgroundArt.css';

/**
 * The festival picture in the lower right of the app background (owner
 * request and choice, 2026-10-19: proposal D5b, filled heads, the two at the
 * edge one step darker, no large lantern). 480 x 270 pixel art from
 * source/make_matsuri_d5.mjs; the night colour is transparent, so it sits on
 * the theme's own surface. It is drawn in light lines for a dark ground, so it
 * only shows when the theme's background is dark; on a light theme it would
 * read as stray marks.
 *
 * Decorative only: aria-hidden, empty alt, no pointer events. Shown at 1x or
 * 2x only (whole multiples keep the pixels square), hidden below 768 px wide.
 */
export const BACKGROUND_ART_SRC: string = artUrl;
export const BACKGROUND_ART_SIZE = { w: 480, h: 270 } as const;

/** Relative luminance of a CSS colour in #rgb, #rrggbb or rgb()/rgba() form; null if unparsable. */
export function luminanceOf(css: string): number | null {
  const s = css.trim().toLowerCase();
  let rgb: number[] | null = null;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((ch) => ch + ch).join('') : hex[1];
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    const m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) rgb = [m[1], m[2], m[3]].map(Number);
  }
  if (!rgb) return null;
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Dark enough for the light-line picture: relative luminance under 0.05 (the default near-black surface is about 0.003; a mid-dark grey of 61/255 is about 0.047). */
export const DARK_LIMIT = 0.05;

/** The theme background as the document resolves it; '' when it cannot be read. */
function themeBackground(): string {
  if (typeof document === 'undefined') return '';
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  return (cs.getPropertyValue('--app-bg') || cs.getPropertyValue('--theme-color-surface') || '').trim();
}

/** Visible unless the background is readable and light. */
export function shouldShowArt(bg: string): boolean {
  const l = luminanceOf(bg);
  return l === null || l < DARK_LIMIT;
}

export function BackgroundArt({ themeKey }: { themeKey?: string }) {
  const [show, setShow] = useState(() => shouldShowArt(themeBackground()));
  useEffect(() => {
    const check = () => setShow(shouldShowArt(themeBackground()));
    check();
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return undefined;
    // the theme store writes the colours as inline custom properties on <html>
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    return () => mo.disconnect();
  }, [themeKey]);
  if (!show) return null;
  return (
    <img
      className="bb-bg-art"
      src={BACKGROUND_ART_SRC}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={BACKGROUND_ART_SIZE.w}
      height={BACKGROUND_ART_SIZE.h}
      data-testid="background-art"
    />
  );
}
