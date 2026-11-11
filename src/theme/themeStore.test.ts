// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'bb-ui-settings-v1';

/** Re-imports the store so its load-time localStorage read + document
 *  apply run again, matching ../layout/layoutStore.test.ts's pattern. */
async function freshStore() {
  vi.resetModules();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-sub-palette');
  document.documentElement.removeAttribute('data-reduced-motion');
  return (await import('./themeStore')).useThemeStore;
}

describe('theme settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to modern, ui sound off, reduced motion off', async () => {
    const store = await freshStore();
    expect(store.getState().settings.theme).toBe('modern');
    expect(store.getState().settings.ui_sound).toBe(false);
    expect(store.getState().settings.reduced_motion).toBe(false);
  });

  it('lists all 15 preset themes', async () => {
    const { THEME_LIST } = await import('./themeStore');
    expect(THEME_LIST.length).toBe(15);
    expect(THEME_LIST.map((t) => t.id)).toContain('modern');
    expect(THEME_LIST.map((t) => t.id)).toContain('sf');
  });

  it('switching theme sets data-theme on the document and persists', async () => {
    const store = await freshStore();
    store.getState().setTheme('sf');
    expect(document.documentElement.getAttribute('data-theme')).toBe('sf');
    expect(store.getState().settings.theme).toBe('sf');

    const reloaded = await freshStore();
    expect(reloaded.getState().settings.theme).toBe('sf');
  });

  it('resolves a legacy theme id (theme/1 minor 1 alias)', async () => {
    const store = await freshStore();
    store.getState().setTheme('8bit');
    expect(store.getState().settings.theme).toBe('8bit-game');
  });

  it('applying a seasonal sub-palette override sets data-sub-palette', async () => {
    const store = await freshStore();
    store.getState().setTheme('seasonal');
    store.getState().setSubPalette('winter');
    expect(document.documentElement.getAttribute('data-sub-palette')).toBe('winter');
  });

  it('reduced motion toggles data-reduced-motion', async () => {
    const store = await freshStore();
    store.getState().setReducedMotion(true);
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
  });

  it('rejects a colour override that fails the contrast gate, without persisting it', async () => {
    const store = await freshStore();
    store.getState().setTheme('sf');
    // near-white text on a near-white surface: --theme-color-text override
    // that cannot meet 4.5:1 against whatever --theme-color-surface is.
    document.documentElement.style.setProperty('--theme-color-surface', '#ffffff');
    const ok = store.getState().setPaletteOverride('text', '#fefefe');
    expect(ok).toBe(false);
    expect(store.getState().settings.palette_overrides.text).toBeUndefined();
    expect(store.getState().lastSaveError).toBeTruthy();
  });

  it('accepts a colour override that passes the contrast gate, and it survives reload', async () => {
    const store = await freshStore();
    store.getState().setTheme('sf');
    document.documentElement.style.setProperty('--theme-color-surface', '#000000');
    const ok = store.getState().setPaletteOverride('text', '#ffffff');
    expect(ok).toBe(true);
    expect(store.getState().settings.palette_overrides.text).toBe('#ffffff');

    const reloaded = await freshStore();
    expect(reloaded.getState().settings.palette_overrides.text).toBe('#ffffff');
  });

  it('text size defaults to normal, scales --ui-fs-h2 on change, and persists (owner request 2026-09-28)', async () => {
    const store = await freshStore();
    expect(store.getState().settings.text_size).toBe('normal');
    const before = document.documentElement.style.getPropertyValue('--ui-fs-h2');
    expect(before).toBe('22px'); // the kit's h2 at the 16 px default body (2026-10-19)

    store.getState().setTextSize('large');
    expect(store.getState().settings.text_size).toBe('large');
    const after = document.documentElement.style.getPropertyValue('--ui-fs-h2');
    expect(after).not.toBe(before);

    const reloaded = await freshStore();
    expect(reloaded.getState().settings.text_size).toBe('large');
    expect(document.documentElement.style.getPropertyValue('--ui-fs-h2')).toBe(after);
  });

  it('text size in px (UI rule C9): default scale 1, text_px applied and kept, invalid px refused', async () => {
    const store = await freshStore();
    const { textScaleOf, BASE_TEXT_PX } = await import('./themeStore');
    const { setTextPx } = await import('./kit/theme-kit.js');
    expect(BASE_TEXT_PX).toBe(16);
    // Default body 16 px (owner 2026-10-19), 16/11 of the 11 px design base.
    expect(textScaleOf(store.getState().settings)).toBeCloseTo(16 / 11);
    expect(document.documentElement.style.getPropertyValue('--ui-text-scale')).toBe('1');
    expect(document.documentElement.style.getPropertyValue('--ui-fs-body')).toBe('18px'); // kit body token raised to the Tempo size, snapped (2026-10-19)
    // Preset-only settings map onto the new base: 14 / 16 / 20 px.
    store.getState().setTextSize('small');
    expect(textScaleOf(store.getState().settings) * 11).toBeCloseTo(14);
    store.getState().setTextSize('large');
    expect(textScaleOf(store.getState().settings) * 11).toBeCloseTo(20);
    store.getState().setTextSize('normal');

    const res = setTextPx(store.getState().settings, 22, { basePx: BASE_TEXT_PX });
    expect(store.getState().setTextSettings(res.settings)).toBe(true);
    expect(store.getState().settings.text_px).toBe(22);
    expect(document.documentElement.style.getPropertyValue('--ui-text-scale')).toBe(String(22 / 16));
    expect(textScaleOf(store.getState().settings)).toBe(2); // 22 px against the 11 px design

    // Not clamped: 49 px is refused and the stored 22 px stays.
    const bad = { ...store.getState().settings, text_px: 49 };
    expect(store.getState().setTextSettings(bad)).toBe(false);
    expect(store.getState().settings.text_px).toBe(22);

    const reloaded = await freshStore();
    expect(reloaded.getState().settings.text_px).toBe(22);
    expect(document.documentElement.style.getPropertyValue('--ui-text-scale')).toBe(String(22 / 16));

    // A preset by id drops the stored px.
    reloaded.getState().setTextSize('normal');
    expect(reloaded.getState().settings.text_px).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--ui-text-scale')).toBe('1');
  });

  it('fsPx() scales a literal px value by the active --ui-text-scale', async () => {
    const { fsPx } = await import('./themeStore');
    // Below 12 (the Tempo label) a literal is raised to 12 (owner 2026-10-19).
    // Sizes snap to an even whole number or .5 above it (owner 2026-10-19).
    expect(fsPx(9)).toBe('calc(18px * var(--ui-text-scale, 1))'); // 12 x 16/11 = 17.45 -> 18
    expect(fsPx(11)).toBe('calc(18px * var(--ui-text-scale, 1))');
    expect(fsPx(12)).toBe('calc(18px * var(--ui-text-scale, 1))');
    expect(fsPx(13)).toBe('calc(18.5px * var(--ui-text-scale, 1))'); // 18.91 -> 18.5
    expect(fsPx(15)).toBe('calc(22px * var(--ui-text-scale, 1))'); // 21.82 -> 22
  });

  it('snapTextPx(): even whole number, .0 or .5; nearest, a tie goes up; snapTextPxDown() never above', async () => {
    const { snapTextPx, snapTextPxDown } = await import('./themeStore');
    expect([16, 16.2, 16.25, 16.5, 17, 17.25, 17.3, 19.9].map(snapTextPx)).toEqual([16, 16, 16.5, 16.5, 16.5, 18, 18, 20]);
    expect([16, 16.4, 16.5, 17.9, 18].map(snapTextPxDown)).toEqual([16, 16, 16.5, 16.5, 18]);
  });

  it('one-time migration drops a stored text_px equal to the previous default 11, keeps others', async () => {
    localStorage.setItem('bb-ui-settings-v1', JSON.stringify({ schema: 'ui-settings/1', text_px: 11 }));
    let store = await freshStore();
    expect(store.getState().settings.text_px).toBeUndefined();
    expect(localStorage.getItem('bb-ui-settings-v1.text-base')).toBe('16px-1');
    // Runs once: an 11 chosen afterwards is kept.
    localStorage.setItem('bb-ui-settings-v1', JSON.stringify({ schema: 'ui-settings/1', text_px: 11 }));
    store = await freshStore();
    expect(store.getState().settings.text_px).toBe(11);
    localStorage.clear();
    localStorage.setItem('bb-ui-settings-v1', JSON.stringify({ schema: 'ui-settings/1', text_px: 20 }));
    store = await freshStore();
    expect(store.getState().settings.text_px).toBe(20);
  });

  it('control order can be reordered and clamps at the ends', async () => {
    const store = await freshStore();
    expect(store.getState().controlOrder[0]).toBe('theme');
    store.getState().moveControl('theme', -1);
    expect(store.getState().controlOrder[0]).toBe('theme'); // already first

    store.getState().moveControl('theme', 1);
    expect(store.getState().controlOrder[0]).toBe('colours');
    expect(store.getState().controlOrder[1]).toBe('theme');
  });

  it('resetAppearance clears theme, overrides and control order', async () => {
    const store = await freshStore();
    store.getState().setTheme('sf');
    store.getState().moveControl('theme', 1);
    store.getState().resetAppearance();

    expect(store.getState().settings.theme).toBe('modern');
    expect(store.getState().controlOrder[0]).toBe('theme');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
