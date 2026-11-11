// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import React from 'react';
import { PixelIcon } from '../pixel-icons';
import { useT } from '../i18n/i18n';
import { useThemeStore } from '../theme/themeStore';

/** The default is the current dark look (the built-in ":root" tokens, theme id "modern"). */
export const DARK_THEME_ID = 'modern';
/** The light look is the kit's own "paper-ink" preset: a paper-coloured surface with dark ink. */
export const LIGHT_THEME_ID = 'paper-ink';

/** Smallest size, shared with the language picker. Both grow with the text-size setting. */
export const HEADER_CONTROL_HEIGHT = '26px';

/**
 * Switches between the dark default and the light preset. The icon shows the mode the
 * page is in now (moon in dark, sun in light); the label names the switch.
 */
export const ThemeToggle: React.FC = () => {
  const t = useT();
  const theme = useThemeStore((s) => s.settings.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const isLight = theme === LIGHT_THEME_ID;
  const label = isLight ? t('themeToDark') : t('themeToLight');
  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? DARK_THEME_ID : LIGHT_THEME_ID)}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      style={{
        flex: '0 0 auto',
        minWidth: HEADER_CONTROL_HEIGHT,
        minHeight: HEADER_CONTROL_HEIGHT,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        background: 'var(--app-control, #2a2a2a)',
        border: '1px solid var(--app-border-strong, #3d3d3d)',
        borderRadius: '3px',
        cursor: 'pointer',
      }}
    >
      <PixelIcon name={isLight ? 'sun' : 'moon'} />
    </button>
  );
};
