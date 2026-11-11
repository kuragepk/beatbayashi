// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// @vitest-environment jsdom
//
// retro-ux (owner 2026-10-29): off by default, the toggle sets <html data-ux>,
// is saved as bb-ui-settings-v1.ux, an older save without it reads as off, and
// retro-ux.css matches templates/ui-system/themes/retro-ux.json (border, spacing, blink).
// The json lives in the desk repository, outside this one: when it is not found the
// test falls back to the same numbers written out here.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CSS = readFileSync(resolve(process.cwd(), 'src/theme/retro-ux.css'), 'utf8');
const MAIN_TS = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
const KEY = 'bb-ui-settings-v1.ux';

async function freshStore() {
  vi.resetModules();
  document.documentElement.removeAttribute('data-ux');
  return (await import('./themeStore')).useThemeStore;
}

describe('retro-ux setting', () => {
  beforeEach(() => localStorage.clear());

  it('is off by default and sets no data-ux', async () => {
    const store = await freshStore();
    expect(store.getState().retroUx).toBe(false);
    expect(document.documentElement.hasAttribute('data-ux')).toBe(false);
  });

  it('turning it on sets data-ux="retro" and saves; turning it off removes both', async () => {
    const store = await freshStore();
    act(() => store.getState().setRetroUx(true));
    expect(document.documentElement.getAttribute('data-ux')).toBe('retro');
    expect(localStorage.getItem(KEY)).toBe('v1:retro');
    act(() => store.getState().setRetroUx(false));
    expect(document.documentElement.hasAttribute('data-ux')).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('reads the saved choice back after a reload', async () => {
    const first = await freshStore();
    act(() => first.getState().setRetroUx(true));
    document.documentElement.removeAttribute('data-ux');
    const second = await freshStore();
    expect(second.getState().retroUx).toBe(true);
    expect(document.documentElement.getAttribute('data-ux')).toBe('retro');
  });

  it('an older save (settings document without the item) reads as off; garbage reads as off', async () => {
    localStorage.setItem('bb-ui-settings-v1', JSON.stringify({ theme: 'modern', reduced_motion: false }));
    const old = await freshStore();
    expect(old.getState().retroUx).toBe(false);
    expect(document.documentElement.hasAttribute('data-ux')).toBe(false);
    localStorage.setItem(KEY, 'garbage');
    const bad = await freshStore();
    expect(bad.getState().retroUx).toBe(false);
  });

  it('works with another colour theme and the appearance reset turns it off', async () => {
    const store = await freshStore();
    act(() => store.getState().setTheme('8bit-game'));
    act(() => store.getState().setRetroUx(true));
    expect(document.documentElement.getAttribute('data-theme')).toBe('8bit-game');
    expect(document.documentElement.getAttribute('data-ux')).toBe('retro');
    act(() => store.getState().resetAppearance());
    expect(store.getState().retroUx).toBe(false);
    expect(document.documentElement.hasAttribute('data-ux')).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('the appearance tab has a checkbox that drives it', async () => {
    const store = await freshStore();
    const { AppearanceSection } = await import('./AppearanceSection');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<AppearanceSection />));
    const box = host.querySelector('[data-testid="retro-ux-toggle"]') as HTMLInputElement;
    expect(box.checked).toBe(false);
    act(() => box.click());
    expect(store.getState().retroUx).toBe(true);
    expect(document.documentElement.getAttribute('data-ux')).toBe('retro');
    act(() => root.unmount());
    host.remove();
  });
});

describe('retro-ux.css', () => {
  it('is imported by the app entry point', () => {
    expect(MAIN_TS).toMatch(/retro-ux\.css/);
  });

  it('every rule is scoped to data-ux="retro" (nothing changes while it is off)', () => {
    const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = withoutComments
      .split('}')
      .map((b) => b.split('{')[0].trim())
      .filter((s) => s && !s.startsWith('@') && !/^(0%|50%)$/.test(s));
    for (const sel of selectors.flatMap((s) => s.split(','))) {
      expect(sel.trim(), sel).toMatch(/^:root\[data-ux='retro'\]/);
    }
  });

  it('names no colour literal', () => {
    expect(CSS.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });

  const jsonPath = resolve(process.cwd(), '../../../../templates/ui-system/themes/retro-ux.json');
  const spec = existsSync(jsonPath)
    ? (JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        frame: { border_px: number; corner_notch_px: number };
        spacing: { unit: number; gap: number };
        cursor: { blink_ms: number };
      })
    : { frame: { border_px: 2, corner_notch_px: 1 }, spacing: { unit: 8, gap: 8 }, cursor: { blink_ms: 500 } };

  it('matches the retro-ux.json values (border, notch, gap, blink)', () => {
    expect(CSS).toContain(`border-width: ${spec.frame.border_px}px !important`);
    expect(CSS).toContain(`border-radius: ${spec.frame.corner_notch_px}px !important`);
    expect(CSS).toMatch(new RegExp(`gap: ${spec.spacing.gap}px;`));
    expect(CSS).toContain(`animation: retro-ux-blink ${spec.cursor.blink_ms * 2}ms steps(1, end) infinite`);
    expect(CSS).toMatch(/border-style: outset/);
    expect(CSS).toMatch(/border-style: inset/);
  });

  it('stops the blink for reduced motion (OS setting and the in-app toggle)', () => {
    expect(CSS).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
    expect(CSS).toMatch(/\[data-reduced-motion='true'\][^{]*:focus-visible::before\s*\{\s*animation: none/);
  });
});
