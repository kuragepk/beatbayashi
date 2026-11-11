// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import React from 'react';
import { PIXEL_ICONS, type PixelIconName, type PixelRun, type PixelRampRun } from './pixelIconData';
import { rampFill } from './pixelIconPalette';

/**
 * Icons follow the text size (2026-10-04), but only in whole multiples of the
 * 16 px grid, so the pixels stay square:
 *
 *   text scale   0.875  1.0  1.25  1.5  2.0
 *   icon px        16    16    16   16   32
 *
 * The multiple is the one nearest to the text scale, and a tie goes to the
 * smaller one (1.5 -> 16, not 32): an icon that next to its label grows more
 * than the text did looks heavier than the word it stands for, and the tight
 * toolbar buttons are sized for a 16 px icon. Capped at 3 (48 px).
 */
export function iconMultipleForTextScale(textScale: number): 1 | 2 | 3 {
  if (!Number.isFinite(textScale) || textScale <= 0) return 1;
  const n = Math.ceil(textScale - 0.5);
  return Math.min(3, Math.max(1, n)) as 1 | 2 | 3;
}

/**
 * The app's current text scale factor (1 = normal). The part does not read
 * the app's settings itself (it must stand alone, see isolation.test.ts); the
 * app passes the factor down with PixelIconTextScale.Provider.
 */
export const PixelIconTextScale = React.createContext<number>(1);

/**
 * One pixel icon from the ui16 set (owner request 2026-10-03: pixel icons in
 * place of the emoji the UI used to show).
 *
 * The icon is an inline SVG of 1 x 1 <rect> runs on a 16 x 16 grid, drawn with
 * `shape-rendering="crispEdges"` and only ever at a whole multiple of 16 CSS
 * px, so the pixels stay square and sharp. The main pixels take
 * `currentColor`, so the icon follows the button's text colour and therefore
 * every theme; no colour is set here. A few icons have accent pixels; they use
 * the `accent` token when one is passed and otherwise also `currentColor`.
 *
 * Accessibility: by default the icon is decorative (aria-hidden), because it
 * sits next to a visible text label or inside a button that has its own
 * aria-label. Pass `label` only when the icon stands alone and must be named.
 */
export interface PixelIconProps {
  name: PixelIconName;
  /**
   * Fixed size as a whole multiple of the 16 px grid (1 = 16 px, 2 = 32 px,
   * 3 = 48 px). Leave it out for an icon that sits with text: the size then
   * follows the text scale from PixelIconTextScale (iconMultipleForTextScale).
   * Pass it for a mark that must keep its size whatever the text size.
   */
  scale?: 1 | 2 | 3;
  /** A CSS colour token for the accent pixels, e.g. 'var(--app-accent, #0f8a80)'. */
  accent?: string;
  /** Accessible name; when omitted the icon is hidden from assistive technology. */
  label?: string;
  style?: React.CSSProperties;
}

const rects = (runs: readonly PixelRun[], fill?: string) =>
  runs.map(([x, y, w]) => (
    <rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} fill={fill} />
  ));

export const PixelIcon: React.FC<PixelIconProps> = ({ name, scale, accent, label, style }) => {
  const icon: { main: readonly PixelRun[]; accent?: readonly PixelRun[]; ramp?: readonly PixelRampRun[] } = PIXEL_ICONS[name];
  const textScale = React.useContext(PixelIconTextScale);
  const px = 16 * (scale ?? iconMultipleForTextScale(textScale));
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={px}
      height={px}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      fill="currentColor"
      focusable="false"
      data-icon={name}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      style={{ display: 'inline-block', flex: 'none', verticalAlign: 'middle', ...style }}
    >
      {rects(icon.main)}
      {icon.accent ? rects(icon.accent, accent ?? 'currentColor') : null}
      {icon.ramp?.map(([x, y, w, level, hue]) => (
        <rect key={`r${x}-${y}`} x={x} y={y} width={w} height={1} fill={rampFill(level, hue === 0 ? accent : undefined, hue)} />
      ))}
    </svg>
  );
};

/**
 * Margin for a 16 px icon inside a button whose text line is shorter than
 * 16 px (the small toolbar and grid buttons): the icon may overlap the
 * button's padding instead of making the button taller, so swapping a glyph
 * for an icon does not change the layout.
 */
export const TIGHT_ICON: React.CSSProperties = { margin: '-4px 0' };

/** Icon followed by its visible text label, with a small fixed gap. */
export const IconLabel: React.FC<{
  icon: PixelIconName;
  children: React.ReactNode;
  accent?: string;
  /** True inside small buttons: see TIGHT_ICON. */
  tight?: boolean;
}> = ({ icon, children, accent, tight = false }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: tight ? '4px' : '6px', verticalAlign: 'middle' }}>
    <PixelIcon name={icon} accent={accent} style={tight ? TIGHT_ICON : undefined} />
    <span>{children}</span>
  </span>
);
