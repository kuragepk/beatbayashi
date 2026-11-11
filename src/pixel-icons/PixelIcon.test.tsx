// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type React from 'react';
import { PixelIcon, IconLabel, PixelIconTextScale, iconMultipleForTextScale } from './PixelIcon';
import { PIXEL_ICONS, type PixelIconName } from './pixelIconData';

afterEach(cleanup);

describe('PixelIcon', () => {
  it('renders a crisp 16 px SVG of rects in currentColor, hidden from assistive technology', () => {
    const { container } = render(<PixelIcon name="play" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges');
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('16');
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    const rects = svg.querySelectorAll('rect');
    expect(rects.length).toBe(PIXEL_ICONS.play.main.length);
    rects.forEach((r) => expect(r.getAttribute('height')).toBe('1'));
  });

  it('only scales by whole multiples of 16', () => {
    const { container } = render(<PixelIcon name="stop" scale={3} />);
    expect(container.querySelector('svg')!.getAttribute('width')).toBe('48');
  });

  it('follows the text scale in whole multiples of 16 (normal 16 px, xx-large 32 px)', () => {
    const width = (textScale: number, el: React.ReactElement = <PixelIcon name="play" />) => {
      const { container, unmount } = render(
        <PixelIconTextScale.Provider value={textScale}>{el}</PixelIconTextScale.Provider>,
      );
      const svg = container.querySelector('svg')!;
      const w = svg.getAttribute('width');
      expect(svg.getAttribute('height')).toBe(w);
      unmount();
      return w;
    };
    expect(width(1)).toBe('16'); // normal
    expect(width(2)).toBe('32'); // xx-large
    expect(width(0.875)).toBe('16'); // small never goes below the grid
    expect(width(1.25)).toBe('16'); // large
    expect(width(1.5)).toBe('16'); // x-large: a tie goes to the smaller multiple
    expect(width(2, <IconLabel icon="play">PLAY</IconLabel>)).toBe('32');
    // A fixed size is kept whatever the text size.
    expect(width(2, <PixelIcon name="play" scale={1} />)).toBe('16');
  });

  it('maps text scales to whole multiples, capped at 3', () => {
    expect([0.875, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 0, NaN].map(iconMultipleForTextScale)).toEqual([
      1, 1, 1, 1, 2, 2, 2, 3, 3, 1, 1,
    ]);
  });

  it('is named when it stands alone with a label', () => {
    render(<PixelIcon name="gear" label="Settings" />);
    expect(screen.getByRole('img', { name: 'Settings' })).toBeTruthy();
  });

  it('paints accent pixels with the given token and falls back to currentColor', () => {
    // on-step (2026-10-06): drum moved its accent sticks to the warm/asagi ramps, so it no longer has accent pixels.
    const { container, rerender } = render(<PixelIcon name="on-step" accent="var(--app-accent)" />);
    const fills = () => [...container.querySelectorAll('rect')].map((r) => r.getAttribute('fill'));
    expect(fills()).toContain('var(--app-accent)');
    rerender(<PixelIcon name="on-step" />);
    expect(fills()).not.toContain('var(--app-accent)');
  });

  it('keeps the visible text as the button name when used with IconLabel', () => {
    render(
      <button type="button">
        <IconLabel icon="play">PLAY</IconLabel>
      </button>,
    );
    expect(screen.getByRole('button', { name: 'PLAY' })).toBeTruthy();
  });

  it('every icon stays inside the 16 x 16 grid without overlapping runs', () => {
    for (const [name, icon] of Object.entries(PIXEL_ICONS) as [PixelIconName, { main: readonly (readonly number[])[]; accent?: readonly (readonly number[])[] }][]) {
      const seen = new Set<number>();
      for (const [x, y, w] of [...icon.main, ...(icon.accent ?? [])]) {
        expect(x >= 0 && y >= 0 && w >= 1 && x + w <= 16 && y < 16, name).toBe(true);
        for (let i = 0; i < w; i++) {
          expect(seen.has(y * 16 + x + i), `${name} ${x + i},${y}`).toBe(false);
          seen.add(y * 16 + x + i);
        }
      }
    }
  });
});
