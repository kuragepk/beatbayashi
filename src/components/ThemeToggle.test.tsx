// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle, DARK_THEME_ID, LIGHT_THEME_ID, HEADER_CONTROL_HEIGHT } from './ThemeToggle';
import { useThemeStore } from '../theme/themeStore';
import { useLanguageStore } from '../i18n/i18n';

afterEach(() => {
  cleanup();
  useThemeStore.getState().setTheme(DARK_THEME_ID);
});

describe('ThemeToggle (dark default, light preset)', () => {
  it('defaults to the dark look and switches to the light preset and back', () => {
    useLanguageStore.getState().setLanguage('en');
    useThemeStore.getState().setTheme(DARK_THEME_ID);
    render(<ThemeToggle />);
    const button = screen.getByTestId('theme-toggle');
    expect(button.getAttribute('aria-label')).toBe('Switch to light mode');

    fireEvent.click(button);
    expect(useThemeStore.getState().settings.theme).toBe(LIGHT_THEME_ID);
    expect(button.getAttribute('aria-label')).toBe('Switch to dark mode');

    fireEvent.click(button);
    expect(useThemeStore.getState().settings.theme).toBe(DARK_THEME_ID);
  });

  it('uses the kit preset "paper-ink" for the light look and the built-in look for dark', () => {
    expect(DARK_THEME_ID).toBe('modern');
    expect(LIGHT_THEME_ID).toBe('paper-ink');
  });

  it('has the same smallest size as the language picker and can grow with the text size', () => {
    render(<ThemeToggle />);
    const style = screen.getByTestId('theme-toggle').style;
    expect(style.minHeight).toBe(HEADER_CONTROL_HEIGHT);
    expect(style.minWidth).toBe(HEADER_CONTROL_HEIGHT);
    expect(style.height).toBe('');
    expect(style.width).toBe('');
  });
});
