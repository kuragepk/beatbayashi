// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { AlignedIconLabel } from '../components/LabelIcon';
import React, { useEffect, useRef, useState } from 'react';
import { PixelIcon, TIGHT_ICON, LABEL_ICONS } from '../pixel-icons';
import { useLanguageStore, useT } from '../i18n/i18n';
import type { UiKey } from '../i18n/strings';
import {
  useThemeStore,
  THEME_LIST,
  DEFAULT_CONTROL_ORDER,
  FONT_SLOTS,
  BASE_TEXT_PX,
  fsPx,
  type AppearanceControlId,
} from './themeStore';
import catalogueDoc from './kit/themes-catalogue.json';
import {
  HEMISPHERES,
  SEASONS,
  textPreviewFonts,
  type ThemeCatalogueEntry,
  type UiSettingsDoc,
} from './kit/theme-kit.js';
import { mountTextSizeControl, type TextSizeControlHandle } from './kit/text-size-control.js';

/**
 * Owner decisions #70-71 (2026-09-27): theme choice, colour overrides (with
 * a contrast gate), a basic layout reorder and reduced motion, inside the
 * existing sound-settings dialog rather than a second modal (SettingsPanel.tsx
 * already owns the dialog/close/focus-trap machinery via useModalA11y).
 *
 * UI sound stays off by default (owner decision) -- this only exposes the
 * toggle, it does not itself decide the default (themeStore's DEFAULT_SETTINGS
 * has ui_sound: false).
 */

const CATALOGUE = (catalogueDoc as { themes: ThemeCatalogueEntry[] }).themes;

/** Words this app shows on screen (UI rule C9: the preview uses the service's
 *  own text -- Japanese, Latin and digits, no emoji). */
const TEXT_SIZE_SAMPLES = ['PLAY STOP Tempo 124 BPM', '1 小節 長さ 外観 0123', 'Export WAV'];

/** Fonts the app renders with besides the theme's own: the main screen's
 *  inline stack (App.tsx) and the bundled pixel fonts it offers. */
const APP_PREVIEW_FONTS = [
  { name: 'Segoe UI', family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
  { name: 'DotGothic16', family: '"DotGothic16", sans-serif' },
  { name: 'PixelMplus12', family: '"PixelMplus12", "DotGothic16", sans-serif' },
];

/**
 * The shared text-size control (kit text-size-control.js, STRUCTURE.md C9):
 * px slider + number + 小さめ/標準/大きめ, live preview beside the slider.
 * Applied on release; the store saves it (invalid px is refused, not clamped).
 */
const TextSizeControl: React.FC<{
  settings: UiSettingsDoc;
  onApply: (next: UiSettingsDoc) => boolean;
}> = ({ settings, onApply }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<TextSizeControlHandle | null>(null);
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Mounted once. A theme / font change refreshes the preview rows in place
  // through handle.update({ settings }) and fontsFor (kit 1.2.0), so the
  // control is no longer torn down and rebuilt for it.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const handle = mountTextSizeControl(host, {
      settings: settingsRef.current,
      basePx: BASE_TEXT_PX,
      fontsFor: (s) => textPreviewFonts(CATALOGUE, s.theme, s, APP_PREVIEW_FONTS),
      samples: TEXT_SIZE_SAMPLES,
      previewSide: 'right',
      applyMode: 'release',
      idPrefix: 'bb-text-size',
      onApply: (next) => {
        if (!onApplyRef.current(next)) handle.update({ settings: settingsRef.current });
      },
    });
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
  }, []);

  // Keep the control's copy of the whole document current, so a later commit
  // never writes back stale fields (other settings, "Reset appearance"), and
  // so the preview fonts follow the theme / font choice.
  useEffect(() => {
    const handle = handleRef.current;
    if (handle && handle.getSettings() !== settings) handle.update({ settings });
  }, [settings]);

  return <div ref={hostRef} style={{ marginTop: '10px' }} />;
};

const ROLES = ['surface', 'text', 'accent', 'border', 'focus', 'danger', 'ok'] as const;
type Role = (typeof ROLES)[number];

const CONTROL_LABELS: Record<AppearanceControlId, UiKey> = {
  theme: 'theme',
  colours: 'colours',
  layout: 'controlOrder',
  motion: 'motion',
  sound: 'uiSound',
};

export const AppearanceSection: React.FC = () => {
  const tr = useT();
  const language = useLanguageStore((s) => s.language);
  const settings = useThemeStore((s) => s.settings);
  const controlOrder = useThemeStore((s) => s.controlOrder);
  const lastSaveError = useThemeStore((s) => s.lastSaveError);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setSubPalette = useThemeStore((s) => s.setSubPalette);
  const setHemisphere = useThemeStore((s) => s.setHemisphere);
  const setPaletteOverride = useThemeStore((s) => s.setPaletteOverride);
  const clearPaletteOverride = useThemeStore((s) => s.clearPaletteOverride);
  const setReducedMotion = useThemeStore((s) => s.setReducedMotion);
  const setUiSound = useThemeStore((s) => s.setUiSound);
  const setFontSlot = useThemeStore((s) => s.setFontSlot);
  const setTextSettings = useThemeStore((s) => s.setTextSettings);
  const moveControl = useThemeStore((s) => s.moveControl);
  const resetAppearance = useThemeStore((s) => s.resetAppearance);
  const onStyle = useThemeStore((s) => s.onStyle);
  const setOnStyle = useThemeStore((s) => s.setOnStyle);
  const retroUx = useThemeStore((s) => s.retroUx);
  const setRetroUx = useThemeStore((s) => s.setRetroUx);

  const [pendingHex, setPendingHex] = useState<Record<string, string>>({});

  const activeTheme = THEME_LIST.find((t) => t.id === settings.theme);
  const isSeasonal = (activeTheme?.subPalettes.length ?? 0) > 0;

  const applyOverride = (role: Role) => {
    const hex = pendingHex[role];
    if (!hex) return;
    const ok = setPaletteOverride(role, hex);
    if (ok) setPendingHex((p) => ({ ...p, [role]: '' }));
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '18px',
    padding: '12px',
    backgroundColor: 'var(--app-panel-alt, #1e1e1e)',
    border: '1px solid var(--app-border, #333)',
    borderRadius: '6px',
    // Long words wrap at large text sizes (UI rule C9) instead of widening
    // the dialog; inherited by the notes and labels inside.
    overflowWrap: 'break-word',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: fsPx(13),
    fontWeight: 700,
    marginBottom: '8px',
    display: 'block',
  };
  const buttonStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 10px',
    backgroundColor: active ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
    color: active ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: fsPx(12),
    fontWeight: active ? 700 : 400,
    // Large text (up to 48 px, UI rule C9): a long label wraps inside the
    // button instead of widening the dialog. No effect at normal sizes.
    maxWidth: '100%',
    overflowWrap: 'break-word',
  });

  const sections: Record<AppearanceControlId, React.ReactNode> = {
    theme: (
      <div style={sectionStyle} key="theme">
        <label style={labelStyle}><AlignedIconLabel icon={LABEL_ICONS.theme}>{tr('theme')}</AlignedIconLabel></label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {THEME_LIST.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              aria-pressed={settings.theme === t.id}
              style={buttonStyle(settings.theme === t.id)}
              title={language === 'ja' ? t.en : undefined}
            >
              {language === 'ja' ? t.ja : t.en}
            </button>
          ))}
        </div>
        {isSeasonal && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: fsPx(12), color: 'var(--app-muted, #ccc)' }}>
              <AlignedIconLabel icon={LABEL_ICONS.hemisphere}>{tr('hemisphere')}:</AlignedIconLabel>{' '}
              <select
                value={settings.hemisphere ?? 'north'}
                onChange={(e) => setHemisphere(e.target.value as 'north' | 'south')}
              >
                {HEMISPHERES.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: fsPx(12), color: 'var(--app-muted, #ccc)' }}>
              <AlignedIconLabel icon={LABEL_ICONS.subPalette}>{tr('subPalette')}:</AlignedIconLabel>{' '}
              <select
                value={settings.sub_palette ?? ''}
                onChange={(e) => setSubPalette(e.target.value || null)}
              >
                <option value="">auto (by date)</option>
                {SEASONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <label style={{ fontSize: fsPx(12), color: 'var(--app-muted, #ccc)', display: 'block', marginTop: '10px' }}>
          <AlignedIconLabel icon={LABEL_ICONS.font}>{tr('font')}:</AlignedIconLabel>{' '}
          <select
            value={settings.font_slot ?? 'theme-default'}
            onChange={(e) => setFontSlot(e.target.value)}
          >
            {FONT_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {slot === 'dotgothic16' ? 'DotGothic16' : tr('themeDefault')}
              </option>
            ))}
          </select>
        </label>
        <TextSizeControl settings={settings} onApply={setTextSettings} />
        <div
          role="radiogroup"
          aria-label={tr('onSteps')}
          data-testid="on-style-group"
          style={{ marginTop: '10px' }}
        >
          <span style={{ fontSize: fsPx(12), color: 'var(--app-muted, #ccc)', display: 'block', marginBottom: 4 }}>
            <AlignedIconLabel icon={LABEL_ICONS.onSteps}>{tr('onSteps')}</AlignedIconLabel>
          </span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(
              [
                ['single', tr('onSingle')],
                ['brightness', tr('onBrightness')],
                ['mark', tr('onMark')],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={onStyle === id}
                data-on-style={id}
                onClick={() => setOnStyle(id)}
                style={buttonStyle(onStyle === id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    ),
    colours: (
      <div style={sectionStyle} key="colours">
        <label style={labelStyle}><AlignedIconLabel icon={LABEL_ICONS.colours}>{tr('colours')}</AlignedIconLabel></label>
        <p style={{ fontSize: fsPx(11), color: 'var(--app-muted, #999)', marginTop: 0 }}>
          An override that fails the contrast requirement (4.5:1 for text, 3:1
          for accents/borders/focus) is rejected, not saved.
        </p>
        {ROLES.map((role) => (
          <div
            key={role}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: fsPx(12), minWidth: '70px', color: 'var(--app-muted, #ccc)' }}>{role}</span>
            <input
              type="color"
              aria-label={`Override colour for ${role}`}
              // ui-color-check-ignore: an <input type="color"> requires a literal
              // hex value (a CSS var is not a legal colour-picker value); this is
              // only the picker's own starting point when no override exists yet.
              value={pendingHex[role] || settings.palette_overrides[role] || '#000000'} // ui-color-check-ignore
              onChange={(e) => setPendingHex((p) => ({ ...p, [role]: e.target.value }))}
            />
            <button type="button" style={buttonStyle(false)} onClick={() => applyOverride(role)}>
              Apply
            </button>
            {settings.palette_overrides[role] && (
              <button
                type="button"
                style={buttonStyle(false)}
                onClick={() => clearPaletteOverride(role)}
              >
                Reset
              </button>
            )}
          </div>
        ))}
        {lastSaveError && (
          <p style={{ fontSize: fsPx(12), color: 'var(--app-danger, #ff6b6b)' }} role="alert">
            {lastSaveError}
          </p>
        )}
      </div>
    ),
    layout: (
      <div style={sectionStyle} key="layout">
        <label style={labelStyle}><AlignedIconLabel icon={LABEL_ICONS.controlOrder}>{tr('controlOrder')}</AlignedIconLabel></label>
        <p style={{ fontSize: fsPx(11), color: 'var(--app-muted, #999)', marginTop: 0 }}>
          Reorders this panel's own sections. Keyboard focus follows the same
          order (Tab moves top to bottom as shown here).
        </p>
        <ol style={{ margin: 0, paddingLeft: '18px' }}>
          {controlOrder.map((id, i) => (
            <li key={id} style={{ fontSize: fsPx(12), marginBottom: '4px' }}>
              <span style={{ marginRight: '8px' }}>{tr(CONTROL_LABELS[id])}</span>
              <button
                type="button"
                aria-label={`Move ${id} up`}
                disabled={i === 0}
                style={{ ...buttonStyle(false), padding: '2px 8px', marginRight: '4px' }}
                onClick={() => moveControl(id, -1)}
              >
                <PixelIcon name="arrow-up" style={{ ...TIGHT_ICON, display: 'block' }} />
              </button>
              <button
                type="button"
                aria-label={`Move ${id} down`}
                disabled={i === controlOrder.length - 1}
                style={{ ...buttonStyle(false), padding: '2px 8px' }}
                onClick={() => moveControl(id, 1)}
              >
                <PixelIcon name="arrow-down" style={{ ...TIGHT_ICON, display: 'block' }} />
              </button>
            </li>
          ))}
        </ol>
      </div>
    ),
    motion: (
      <div style={sectionStyle} key="motion">
        <label style={labelStyle}><AlignedIconLabel icon={LABEL_ICONS.motion}>{tr('motion')}</AlignedIconLabel></label>
        <label style={{ fontSize: fsPx(12), display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={settings.reduced_motion}
            onChange={(e) => setReducedMotion(e.target.checked)}
          />
          {tr('reduceMotion')}
        </label>
        <label style={{ fontSize: fsPx(12), display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          <input
            type="checkbox"
            data-testid="retro-ux-toggle"
            checked={retroUx}
            onChange={(e) => setRetroUx(e.target.checked)}
          />
          {tr('retroUx')}
        </label>
      </div>
    ),
    sound: (
      <div style={sectionStyle} key="sound">
        <label style={labelStyle}><AlignedIconLabel icon={LABEL_ICONS.uiSound}>{tr('uiSound')}</AlignedIconLabel></label>
        <label style={{ fontSize: fsPx(12), display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={settings.ui_sound}
            onChange={(e) => setUiSound(e.target.checked)}
          />
          {tr('playUiSound')}
        </label>
      </div>
    ),
  };

  return (
    <div>
      {controlOrder.map((id) => sections[id])}
      <button type="button" style={buttonStyle(false)} onClick={resetAppearance}>
        {tr('resetAppearance')}
      </button>
    </div>
  );
};

export { DEFAULT_CONTROL_ORDER };
