// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Copilot review B1-B3 (2026-10-08): every key that English has must exist in
// every language, for the UI strings and for every localised entry of the
// rights notice (including `detail`). A localised entry is any object with a
// string `en` field.

import { describe, expect, it } from 'vitest';
import { RIGHTS_NOTICE } from '../rights/rightsNotice.generated';
import { UI_STRINGS } from './strings';
import { LANGUAGE_CODES } from './i18n';

/** Paths of every object in the notice that carries an English string. */
function localisedEntries(node: unknown, path: string, out: [string, Record<string, unknown>][]) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => localisedEntries(v, `${path}[${i}]`, out));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.en === 'string') out.push([path, obj]);
  for (const [k, v] of Object.entries(obj)) localisedEntries(v, `${path}.${k}`, out);
}

describe('translation completeness', () => {
  it('UI strings: every language has every English key', () => {
    const keys = Object.keys(UI_STRINGS.en);
    for (const code of LANGUAGE_CODES) {
      const have = UI_STRINGS[code] as Record<string, unknown> | undefined;
      const missing = keys.filter((k) => typeof have?.[k] !== 'string');
      expect({ code, missing }).toEqual({ code, missing: [] });
    }
  });

  it('rights notice: every localised entry has every language', () => {
    const entries: [string, Record<string, unknown>][] = [];
    localisedEntries(RIGHTS_NOTICE, 'notice', entries);
    expect(entries.some(([p]) => p.startsWith('notice.detail.'))).toBe(true);
    const missing: string[] = [];
    for (const [path, entry] of entries) {
      for (const code of LANGUAGE_CODES) {
        if (typeof entry[code] !== 'string' || entry[code] === '') missing.push(`${path}.${code}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('rights notice: detail has no English-only strings left', () => {
    const strays: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === 'string') strays.push(path);
      else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        if (typeof obj.en === 'string') return;
        for (const [k, v] of Object.entries(obj)) walk(v, `${path}.${k}`);
      }
    };
    walk(RIGHTS_NOTICE.detail, 'detail');
    expect(strays).toEqual([]);
  });
});
