// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import React from 'react';
import './BrandMark.css';

/**
 * The BeatBayashi mark (icon variant U2, adopted by the owner on
 * 2026-10-02). One component so every place that shows the mark uses the
 * same file and the same rendering rules.
 *
 * The image is the 32 px pixel-art master (public/icons/beatbayashi-mark-32.png,
 * also the 32 px favicon). It is only ever drawn at a whole multiple of 32
 * CSS px with `image-rendering: pixelated`, so the pixels stay square and
 * sharp instead of being blurred by the browser's smoothing.
 *
 * The path is relative to the page (Vite `base: './'`), so it also resolves
 * under file:// in the packaged Electron app and under a subpath on a host.
 */
export const BRAND_MARK_SRC = './icons/beatbayashi-mark-32.png';
export const BRAND_MARK_ALT = 'BeatBayashi';

/**
 * Window-width breakpoints used when no fixed `scale` is given (see
 * BrandMark.css, which must match). The size never follows the text-size
 * setting. Below 1280 px: 32 px; from 1280 px: 64 px.
 */
export const BRAND_MARK_BREAKPOINTS = [
  { minWidth: 0, px: 32 },
  { minWidth: 1280, px: 64 },
] as const;

export interface BrandMarkProps {
  /**
   * Fixed whole multiple of the 32 px master (1 = 32 px, 2 = 64 px). Leave it
   * out to let the size follow the window width (BRAND_MARK_BREAKPOINTS).
   */
  scale?: 1 | 2;
  /**
   * True when the visible product name sits right next to the mark (header,
   * footer). The image is then hidden from assistive technology (alt="" and
   * aria-hidden) so a screen reader says the name once, not twice. Leave it
   * false when the mark stands alone, so it keeps its name as alt text.
   */
  decorative?: boolean;
  style?: React.CSSProperties;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ scale, decorative = false, style }) => {
  const px = 32 * (scale ?? 1);
  const responsive = scale === undefined;
  return (
    <img
      src={BRAND_MARK_SRC}
      alt={decorative ? '' : BRAND_MARK_ALT}
      aria-hidden={decorative ? true : undefined}
      width={px}
      height={px}
      draggable={false}
      className={responsive ? 'brand-mark brand-mark--responsive' : 'brand-mark'}
      style={{
        imageRendering: 'pixelated',
        ...(responsive ? {} : { width: `${px}px`, height: `${px}px` }),
        flex: 'none',
        verticalAlign: 'middle',
        ...style,
      }}
    />
  );
};
