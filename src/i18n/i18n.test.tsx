// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Owner decision 2026-10-06: one UI language at a time, no "English /
// 日本語" pairs; every language in the notice has a full UI catalogue.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import {
  LANGUAGE_CODES,
  matchBrowserLanguage,
  translate,
  useLanguageStore,
  type Language,
} from './i18n';
import { UI_STRINGS, type UiKey } from './strings';
import { SequencerGrid } from '../components/SequencerGrid';
import { ControlPanel } from '../components/ControlPanel';
import { PresetDropdowns } from '../components/PresetDropdowns';
import { RightsBanner } from '../components/RightsBanner';
import { ClearConfirmDialog } from '../components/ClearConfirmDialog';
import { LanguagePicker } from '../components/LanguagePicker';
import { AppearanceSection } from '../theme/AppearanceSection';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  act(() => useLanguageStore.setState({ language: 'en' }));
});

describe('catalogue', () => {
  const keys = Object.keys(UI_STRINGS.en) as UiKey[];

  it('has every key in every language of the rights notice', () => {
    for (const code of LANGUAGE_CODES) {
      const missing = keys.filter((k) => UI_STRINGS[code]?.[k] === undefined);
      expect({ code, missing }).toEqual({ code, missing: [] });
    }
  });

  it('keeps the same {placeholders} as English', () => {
    const names = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const code of LANGUAGE_CODES) {
      for (const k of keys) {
        expect([code, k, names(translate(code, k))]).toEqual([code, k, names(UI_STRINGS.en[k])]);
      }
    }
  });

  it('fills placeholders', () => {
    expect(translate('en', 'bar', { n: 3 })).toBe('Bar 3');
    expect(translate('ja', 'bar', { n: 3 })).toBe('3小節');
  });

  it('maps browser languages, including the three Chinese variants', () => {
    expect(matchBrowserLanguage('zh-CN')).toBe('zh');
    expect(matchBrowserLanguage('zh-TW')).toBe('zh-Hant-TW');
    expect(matchBrowserLanguage('zh-Hant')).toBe('zh-Hant-TW');
    expect(matchBrowserLanguage('zh-HK')).toBe('zh-Hant-HK');
    expect(matchBrowserLanguage('es-MX')).toBe('es');
    expect(matchBrowserLanguage('ar-EG')).toBe('ar');
    expect(matchBrowserLanguage('de-DE')).toBeNull();
  });
});

/** "Latin text / CJK text" (or the reverse): the old side-by-side form. */
const PAIR = /[A-Za-z][^/]*\s\/\s[^/]*[぀-ヿ一-鿿]|[぀-ヿ一-鿿][^/]*\s\/\s[^/]*[A-Za-z]{3}/;

function renderedStrings(container: HTMLElement): string[] {
  const out: string[] = [];
  const walk = (el: Element) => {
    // Known exception: the shared UI-kit text-size control
    // (src/theme/kit/text-size-control.js, synced from the desk's
    // templates/ui-system) still writes its own "日本語 / English" labels.
    // Changing that is a kit change, not an app change.
    if (el.hasAttribute('data-ui-text-size-control')) return;
    for (const attr of ['aria-label', 'title', 'placeholder']) {
      const v = el.getAttribute(attr);
      if (v) out.push(v);
    }
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3 && n.textContent?.trim()) out.push(n.textContent.trim());
    });
    Array.from(el.children).forEach(walk);
  };
  walk(container);
  return out;
}

describe('no side-by-side language pairs in the rendered UI', () => {
  const screens: [string, () => React.ReactElement][] = [
    ['sequencer', () => <SequencerGrid audioEngine={null} onSoundChange={() => {}} />],
    ['controls', () => <ControlPanel audioEngine={null} onSoundChange={() => {}} />],
    ['presets', () => <PresetDropdowns activePresetId={null} onLoadPreset={() => {}} />],
    ['rights', () => <RightsBanner />],
    ['clear dialog', () => <ClearConfirmDialog onCancel={() => {}} onConfirm={() => {}} />],
    ['language picker', () => <LanguagePicker />],
    ['appearance', () => <AppearanceSection />],
  ];
  for (const language of ['en', 'ja', 'zh', 'ar'] as Language[]) {
    for (const [name, make] of screens) {
      it(`${name} in ${language}`, () => {
        act(() => useLanguageStore.setState({ language }));
        const { container } = render(make());
        const pairs = renderedStrings(container).filter((s) => PAIR.test(s));
        expect(pairs).toEqual([]);
      });
    }
  }
});

describe('header subtitle (owner 2026-10-06)', () => {
  it('has the owner wording in en and ja, and licence names kept in every language', () => {
    expect(translate('en', 'taglineFull')).toBe(
      'Electronic drum sequencer (output, modify, redistribute and sell — CC0 / MIT-0 sounds & MIT-0 app)'
    );
    expect(translate('ja', 'taglineFull')).toBe(
      '電子ドラムシーケンサー\n（出力・改変・再配布・販売可の CC0 / MIT-0 音源 & MIT-0 アプリ）'
    );
    for (const code of LANGUAGE_CODES) {
      expect(translate(code, 'taglineFull')).toContain('CC0 / MIT-0');
      expect(translate(code, 'taglineFull')).toContain('MIT-0');
    }
  });
});
