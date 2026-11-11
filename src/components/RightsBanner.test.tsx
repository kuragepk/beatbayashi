// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// ISSUE-BEATBOX-031: RightsBanner had no test file. Covers initial render,
// language preference load/save (including localStorage failure paths), and
// the detail dialog open/close/click-through behaviour.
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RightsBanner } from './RightsBanner';
import { RIGHTS_NOTICE } from '../rights/rightsNotice.generated';
import { act } from '@testing-library/react';
import { readInitialLanguage, useLanguageStore, type Language } from '../i18n/i18n';

const STORAGE_KEY = 'bb-rights-language';

function setLanguage(language: Language) {
  act(() => useLanguageStore.getState().setLanguage(language));
}

afterEach(() => {
  cleanup();
  act(() => useLanguageStore.setState({ language: 'en' }));
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('RightsBanner language (owner 2026-10-06: one language at a time)', () => {
  it('shows the headline in the language picked in the header', () => {
    render(<RightsBanner />);
    expect(screen.getByRole('heading', { name: RIGHTS_NOTICE.headline.en })).not.toBeNull();
    setLanguage('ja');
    expect(screen.getByRole('heading', { name: RIGHTS_NOTICE.headline.ja })).not.toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('ja');
  });

  it('reads a saved language, ignores an unknown one, survives a throwing localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, 'ko');
    expect(readInitialLanguage()).toBe('ko');
    window.localStorage.setItem(STORAGE_KEY, 'not-a-real-language');
    expect(readInitialLanguage()).not.toBe('not-a-real-language');
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('blocked in private mode');
    });
    expect(() => readInitialLanguage()).not.toThrow();
  });

  it('does not crash when localStorage.setItem throws', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    render(<RightsBanner />);
    expect(() => setLanguage('ja')).not.toThrow();
    expect(screen.getByRole('heading', { name: RIGHTS_NOTICE.headline.ja })).not.toBeNull();
  });

  for (const l of RIGHTS_NOTICE.languages) {
    it(`renders every part in ${l.code}, with dir=${l.dir} and no English beside it`, () => {
      setLanguage(l.code);
      render(<RightsBanner />);
      fireEvent.click(screen.getByRole('button', { expanded: false }));
      const section = screen.getByRole('heading', { name: RIGHTS_NOTICE.headline[l.code] })
        .closest('section')!;
      expect(section.getAttribute('dir')).toBe(l.dir);
      expect(section.textContent).toContain(RIGHTS_NOTICE.synthesis[l.code]);
      expect(section.textContent).toContain(RIGHTS_NOTICE.licenceTerms[l.code]);
      RIGHTS_NOTICE.permissions.forEach((p) => expect(section.textContent).toContain(p[l.code]));
      if (l.code !== 'en') {
        expect(section.textContent).not.toContain(RIGHTS_NOTICE.permissions[0].en);
      }
    });
  }

  it('shows the machine-translation note for every language except en', () => {
    for (const l of RIGHTS_NOTICE.languages) {
      setLanguage(l.code);
      render(<RightsBanner />);
      fireEvent.click(screen.getByRole('button', { expanded: false }));
      const note = screen.queryByTestId('machine-translation-note');
      if (l.reviewedByOwner) {
        expect(note).toBeNull();
      } else {
        expect(note?.textContent).toBe(RIGHTS_NOTICE.machineTranslationNote[l.code]);
      }
      cleanup();
    }
    expect(RIGHTS_NOTICE.languages.find((l) => l.code === 'en')?.reviewedByOwner).toBe(true);
    expect(RIGHTS_NOTICE.machineTranslationNote.ja).toBe(
      'この言語版と翻訳はデバイスで書いたものです。矛盾があれば、正確なのは英語の文です。'
    );
  });
});

describe('RightsBanner detail dialog', () => {
  it('opens the dialog when the trust button is clicked', () => {
    render(<RightsBanner />);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Project philosophy and policy' }));

    expect(screen.getByRole('dialog')).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Why you can trust this' })
    ).not.toBeNull();
  });

  it.each(RIGHTS_NOTICE.languages.map((l) => [l.code] as const))(
    'shows the detail dialog in the selected language (%s)',
    (code) => {
      setLanguage(code);
      render(<RightsBanner />);
      fireEvent.click(
        screen.getByRole('button', {
          name: RIGHTS_NOTICE.ui.trustButton[code] ?? RIGHTS_NOTICE.ui.trustButton.en,
        })
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('lang')).not.toBeNull();
      expect(screen.getByRole('heading', { name: RIGHTS_NOTICE.detail.title[code] })).not.toBeNull();
      const text = dialog.textContent ?? '';
      for (const s of RIGHTS_NOTICE.detail.sections) {
        expect(text).toContain(s.title[code]);
        expect(text).toContain(s.body[code]);
      }
      expect(text).toContain(RIGHTS_NOTICE.detail.dataFlow.web.body[code]);
      expect(text).toContain(RIGHTS_NOTICE.detail.footer[code]);
    }
  );

  it.each(
    RIGHTS_NOTICE.languages.filter((l) => !l.reviewedByOwner).map((l) => [l.code] as const)
  )('shows the machine-translation note, and not the "English text above" disclaimer, in the detail dialog without opening the pulldown (%s)', (code) => {
    setLanguage(code);
    render(<RightsBanner />);
    fireEvent.click(
      screen.getByRole('button', {
        name: RIGHTS_NOTICE.ui.trustButton[code] ?? RIGHTS_NOTICE.ui.trustButton.en,
      })
    );
    const dialog = screen.getByRole('dialog');
    const note = dialog.querySelector('[data-testid="detail-machine-translation-note"]');
    expect(note?.textContent).toBe(RIGHTS_NOTICE.machineTranslationNote[code]);
    // Owner 2026-10-20: the disclaimer speaks of "the English text above", which this dialog lacks.
    expect(dialog.querySelector('[data-testid="detail-translation-disclaimer"]')).toBeNull();
    expect(dialog.textContent).not.toContain(RIGHTS_NOTICE.translationDisclaimer);
  });

  it('shows neither the note nor the disclaimer in the detail dialog in English', () => {
    render(<RightsBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Project philosophy and policy' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[data-testid="detail-machine-translation-note"]')).toBeNull();
    expect(dialog.querySelector('[data-testid="detail-translation-disclaimer"]')).toBeNull();
    expect(dialog.textContent).not.toContain(RIGHTS_NOTICE.translationDisclaimer);
  });

  it('closes the dialog when the overlay is clicked', () => {
    render(<RightsBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Project philosophy and policy' }));

    fireEvent.click(screen.getByRole('dialog'));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the dialog when the Close button is clicked', () => {
    render(<RightsBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Project philosophy and policy' }));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not close the dialog when clicking inside its content', () => {
    render(<RightsBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Project philosophy and policy' }));

    fireEvent.click(
      screen.getByRole('heading', { name: 'Why you can trust this' })
    );

    expect(screen.getByRole('dialog')).not.toBeNull();
  });
});

describe('RightsBanner pulldown (owner 2026-10-06)', () => {
  it('starts closed with only the header line, and opens/closes with aria-expanded', () => {
    render(<RightsBanner />);
    const toggle = screen.getByRole('button', { expanded: false });
    expect(toggle.getAttribute('aria-controls')).toBe('rights-body');
    expect(screen.queryByText(RIGHTS_NOTICE.synthesis.en)).toBeNull();
    expect(screen.getByText(RIGHTS_NOTICE.ui.trustButton.en)).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(RIGHTS_NOTICE.synthesis.en)).not.toBeNull();
    expect(screen.getByText(RIGHTS_NOTICE.licenceTerms.en)).not.toBeNull();

    fireEvent.click(toggle);
    expect(screen.queryByText(RIGHTS_NOTICE.synthesis.en)).toBeNull();
  });
});
