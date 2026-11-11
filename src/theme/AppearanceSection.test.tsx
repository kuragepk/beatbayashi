// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Text size control in the Appearance tab (UI rule C9, owner decisions
// 2026-10-04): px slider + number + 小さめ/標準/大きめ, a preview of the app's
// own words beside the slider, applied on release and saved.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

afterEach(cleanup);

async function renderFresh() {
  vi.resetModules();
  const { AppearanceSection } = await import('./AppearanceSection');
  const { useThemeStore } = await import('./themeStore');
  const view = render(<AppearanceSection />);
  return { view, useThemeStore };
}

describe('AppearanceSection text size control', () => {
  beforeEach(() => localStorage.clear());

  it('mounts the kit control with presets and a preview of app words beside the slider', async () => {
    await renderFresh();
    const control = document.querySelector('[data-ui-text-size-control]') as HTMLElement;
    expect(control).not.toBeNull();
    expect(control.getAttribute('data-preview-side')).toBe('right');
    const slider = control.querySelector('[data-ui-text-size-slider]') as HTMLInputElement;
    expect(slider.min).toBe('8');
    expect(slider.max).toBe('48');
    expect(slider.value).toBe('16'); // the app's normal body px (2026-10-19: 16)
    const presets = [...control.querySelectorAll('button[data-preset]')].map((b) => b.textContent);
    expect(presets).toEqual(['小さめ / Small', '標準 / Normal', '大きめ / Large']);
    const preview = control.querySelector('[data-ui-text-size-preview]') as HTMLElement;
    expect(preview.textContent).toContain('PLAY STOP Tempo 124 BPM');
    expect(preview.textContent).toContain('小節');
    const names = [...preview.querySelectorAll('[data-font-name]')].map((r) => r.getAttribute('data-font-name'));
    expect(names).toContain('Segoe UI');
    expect(names).toContain('DotGothic16');
    // The preview follows the slider while dragging, before anything is saved.
    act(() => {
      slider.value = '30';
      fireEvent.input(slider);
    });
    const sample = preview.querySelector('.ui-text-size-sample') as HTMLElement;
    expect(sample.style.fontSize).toBe('30px');
  });

  it('applies the px on release and saves it', async () => {
    const { useThemeStore } = await renderFresh();
    const slider = document.querySelector('[data-ui-text-size-slider]') as HTMLInputElement;
    act(() => {
      slider.value = '17';
      fireEvent.input(slider);
      fireEvent.change(slider);
    });
    expect(useThemeStore.getState().settings.text_px).toBe(17);
    expect(document.documentElement.style.getPropertyValue('--ui-text-scale')).toBe(String(17 / 16));
    expect(JSON.parse(localStorage.getItem('bb-ui-settings-v1') ?? '{}').text_px).toBe(17);

    act(() => {
      (document.querySelector('button[data-preset="normal"]') as HTMLButtonElement).click();
    });
    expect(useThemeStore.getState().settings.text_px).toBe(16);
    expect(document.documentElement.style.getPropertyValue('--ui-text-scale')).toBe('1');
  });

  it('keeps other settings when the text size is committed after they changed', async () => {
    const { useThemeStore } = await renderFresh();
    act(() => useThemeStore.getState().setReducedMotion(true));
    const slider = document.querySelector('[data-ui-text-size-slider]') as HTMLInputElement;
    act(() => {
      slider.value = '20';
      fireEvent.change(slider);
    });
    expect(useThemeStore.getState().settings.text_px).toBe(20);
    expect(useThemeStore.getState().settings.reduced_motion).toBe(true);
  });

  it('refreshes the preview fonts in place when the theme or font changes (kit 1.2.0)', async () => {
    const { useThemeStore } = await renderFresh();
    const control = document.querySelector('[data-ui-text-size-control]') as HTMLElement;
    const fontNames = () =>
      [...control.querySelectorAll('[data-ui-text-size-preview] [data-font-name]')].map((r) => r.getAttribute('data-font-name'));
    const before = fontNames();
    act(() => useThemeStore.getState().setTheme('8bit-game'));
    // Same control element (not rebuilt), different preview fonts.
    expect(document.querySelector('[data-ui-text-size-control]')).toBe(control);
    const afterTheme = fontNames();
    expect(afterTheme).not.toEqual(before);
    expect(afterTheme).toContain('Misaki');
    act(() => useThemeStore.getState().setFontSlot('dotgothic16'));
    expect(document.querySelector('[data-ui-text-size-control]')).toBe(control);
    expect(fontNames()).not.toEqual(afterTheme);
  });
});

describe('AppearanceSection "ON の表し方" option (owner 2026-10-05)', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to one level (owner 2026-10-06), switches to the centre mark, persists, and resets', async () => {
    const { useThemeStore } = await renderFresh();
    expect(useThemeStore.getState().onStyle).toBe('single');
    const radio = (id: string) =>
      document.querySelector(`[data-on-style="${id}"]`) as HTMLButtonElement;
    expect(radio('single').getAttribute('aria-checked')).toBe('true');
    expect(radio('brightness').getAttribute('aria-checked')).toBe('false');
    expect(radio('mark').getAttribute('aria-checked')).toBe('false');
    act(() => radio('mark').click());
    expect(useThemeStore.getState().onStyle).toBe('mark');
    expect(localStorage.getItem('bb-ui-settings-v1.on-style')).toBe('v1:mark');
    // A reload keeps it; an unreadable value falls back to the default.
    const reloaded = await renderFresh();
    expect(reloaded.useThemeStore.getState().onStyle).toBe('mark');
    localStorage.setItem('bb-ui-settings-v1.on-style', 'garbage');
    const bad = await renderFresh();
    expect(bad.useThemeStore.getState().onStyle).toBe('single');
    act(() => bad.useThemeStore.getState().setOnStyle('mark'));
    act(() => bad.useThemeStore.getState().resetAppearance());
    expect(bad.useThemeStore.getState().onStyle).toBe('single');
    expect(localStorage.getItem('bb-ui-settings-v1.on-style')).toBeNull();
  });
});

describe('ON style migration (owner 2026-10-06)', () => {
  beforeEach(() => localStorage.clear());
  it('keeps an explicit 3-level choice; no stored choice gets the single level', async () => {
    localStorage.setItem('bb-ui-settings-v1.on-style', 'v1:brightness');
    expect((await renderFresh()).useThemeStore.getState().onStyle).toBe('brightness');
    localStorage.removeItem('bb-ui-settings-v1.on-style');
    expect((await renderFresh()).useThemeStore.getState().onStyle).toBe('single');
  });
});
