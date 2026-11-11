// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BackgroundArt, BACKGROUND_ART_SIZE, luminanceOf, shouldShowArt, DARK_LIMIT } from './BackgroundArt';

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--app-bg');
});

describe('BackgroundArt', () => {
  it('is decorative: empty alt, hidden from assistive tech, not draggable', () => {
    document.documentElement.style.setProperty('--app-bg', '#0a0a0a');
    render(<BackgroundArt />);
    const img = screen.getByTestId('background-art') as HTMLImageElement;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
    expect(img.getAttribute('draggable')).toBe('false');
    expect(img.width).toBe(BACKGROUND_ART_SIZE.w);
    expect(img.height).toBe(BACKGROUND_ART_SIZE.h);
  });

  it('shows on a dark background and hides on a light one', () => {
    document.documentElement.style.setProperty('--app-bg', '#f4efe6');
    render(<BackgroundArt />);
    expect(screen.queryByTestId('background-art')).toBeNull();
  });

  it('decides dark and light from the luminance', () => {
    expect(luminanceOf('#0a0a0a')).toBeLessThan(DARK_LIMIT);
    expect(luminanceOf('rgb(26, 26, 26)')).toBeLessThan(DARK_LIMIT);
    expect(luminanceOf('#ffffff')).toBeCloseTo(1, 5);
    expect(shouldShowArt('#0a0a0a')).toBe(true);
    expect(shouldShowArt('#eeeeee')).toBe(false);
    // unreadable values keep the default dark look
    expect(shouldShowArt('')).toBe(true);
    expect(shouldShowArt('var(--x)')).toBe(true);
  });

  it('CSS: behind the UI, pixelated, whole multiples only, hidden on narrow screens, no colours', () => {
    const css = readFileSync(join(__dirname, 'backgroundArt.css'), 'utf-8');
    expect(css).toContain('isolation: isolate');
    expect(css).toContain('z-index: -1');
    expect(css).toContain('pointer-events: none');
    expect(css).toContain('image-rendering: pixelated');
    expect(css).toContain('width: 480px');
    expect(css).toContain('width: 960px');
    expect(css).toMatch(/@media \(max-width: 767px\)[^}]*\{[^}]*display: none/);
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});
