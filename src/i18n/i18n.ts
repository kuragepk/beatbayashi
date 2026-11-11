// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0

/**
 * UI language (owner decision 2026-10-06): the app shows one language at a
 * time, the one picked in the header's language pulldown, instead of English
 * and Japanese side by side. The first visit follows the browser's language,
 * falling back to English. The choice is kept under the key the rights
 * notice already used, so an earlier choice carries over.
 *
 * Languages other than English are machine-written. The list, text
 * direction and reviewedByOwner flags come from docs/rights-notice.json (via
 * the generated module), so the rights notice and the UI cannot disagree on
 * which languages exist.
 */
import { create } from 'zustand';
import { RIGHTS_NOTICE, type NoticeLanguage } from '../rights/rightsNotice.generated';
import { UI_STRINGS, type UiKey } from './strings';

export type Language = NoticeLanguage;

export const LANGUAGE_STORAGE_KEY = 'bb-rights-language';

export const LANGUAGE_CODES: Language[] = RIGHTS_NOTICE.languages.map((l) => l.code);

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGE_CODES as string[]).includes(value);
}

/** BCP 47 tag for the lang attribute ('zh' in the notice is Simplified). */
export function langTag(language: Language): string {
  return language === 'zh' ? 'zh-Hans' : language;
}

export function textDir(language: Language): 'ltr' | 'rtl' {
  return RIGHTS_NOTICE.languages.find((l) => l.code === language)?.dir ?? 'ltr';
}

export function needsMachineTranslationNote(language: Language): boolean {
  return RIGHTS_NOTICE.languages.find((l) => l.code === language)?.reviewedByOwner === false;
}

/** Best match for a browser language tag, or null. */
export function matchBrowserLanguage(tag: string): Language | null {
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) {
    if (lower.includes('hk') || lower.includes('mo')) return 'zh-Hant-HK';
    if (lower.includes('tw') || lower.includes('hant')) return 'zh-Hant-TW';
    return 'zh';
  }
  const base = lower.split('-')[0];
  return isLanguage(base) ? base : null;
}

export function readInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // Private-mode browsers can throw on localStorage; fall through.
  }
  try {
    const tags = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
    for (const tag of tags) {
      const match = tag ? matchBrowserLanguage(tag) : null;
      if (match) return match;
    }
  } catch {
    // No navigator: English.
  }
  return 'en';
}

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: readInitialLanguage(),
  setLanguage: (language) => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // A convenience; failing to keep it changes nothing else.
    }
    set({ language });
  },
}));

/** One UI string in `language`, English when that language lacks it, with
 *  `{name}` placeholders filled from `vars`. */
export function translate(
  language: Language,
  key: UiKey,
  vars: Record<string, string | number> = {}
): string {
  const template = UI_STRINGS[language]?.[key] ?? UI_STRINGS.en[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}

export type Translate = (key: UiKey, vars?: Record<string, string | number>) => string;

/** The current language's translate function (re-renders on change). */
export function useT(): Translate {
  const language = useLanguageStore((s) => s.language);
  return (key, vars) => translate(language, key, vars);
}
