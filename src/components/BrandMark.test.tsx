// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrandMark, BRAND_MARK_SRC, BRAND_MARK_BREAKPOINTS } from './BrandMark';

afterEach(cleanup);

describe('BrandMark', () => {
  it('by default sizes by window width through CSS, pixelated, with no inline size', () => {
    render(<BrandMark />);
    const img = screen.getByAltText('BeatBayashi') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(BRAND_MARK_SRC);
    expect(img.className).toContain('brand-mark--responsive');
    expect(img.style.width).toBe('');
    expect(img.style.imageRendering).toBe('pixelated');
  });

  it('breakpoints are whole multiples of 32 and the CSS matches them', () => {
    const css = readFileSync(join(__dirname, 'BrandMark.css'), 'utf-8');
    for (const bp of BRAND_MARK_BREAKPOINTS) {
      expect(bp.px % 32).toBe(0);
      expect(css).toContain(`width: ${bp.px}px`);
      if (bp.minWidth > 0) expect(css).toContain(`@media (min-width: ${bp.minWidth}px)`);
    }
    // The size must not depend on the text-size setting.
    expect(css).not.toMatch(/\d(r?em)\b|calc|var\(/);
  });

  it('only scales by whole multiples of 32', () => {
    render(<BrandMark scale={2} />);
    const img = screen.getByAltText('BeatBayashi') as HTMLImageElement;
    expect(img.style.width).toBe('64px');
    expect(img.width).toBe(64);
  });

  it('is hidden from screen readers when decorative, so the name next to it is read once', () => {
    const { container } = render(
      <h1>
        <BrandMark decorative />
        BeatBayashi
      </h1>,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByAltText('BeatBayashi')).toBeNull();
    expect(screen.getByRole('heading', { name: 'BeatBayashi' })).toBeTruthy();
  });

  it('keeps the name as alt text and is not hidden when standalone', () => {
    render(<BrandMark />);
    const img = screen.getByAltText('BeatBayashi') as HTMLImageElement;
    expect(img.hasAttribute('aria-hidden')).toBe(false);
  });
});
