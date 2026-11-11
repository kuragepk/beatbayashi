// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0

import { describe, expect, it } from 'vitest';
import { CONTENT_RIGHTS_LINE, exportRightsFields, readContentRights } from './rights';

describe('export rights metadata', () => {
  it('keeps the code licence and the content rights in separate fields', () => {
    const f = exportRightsFields();
    expect(f.generatorLicence).toBe('MIT-0');
    expect(f.contentRights.spdx).toBe('CC0-1.0 OR MIT-0');
    expect(f.contentRights.url).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
    expect(f.contentRights.altUrl).toBe('https://opensource.org/license/mit-0');
    expect(f.contentRights.statement).toMatch(/CC0 1.0 or MIT-0/);
    expect(f.contentRights.statement).not.toMatch(/MIT licen[cs]e/i);
  });

  it('fits in a one-byte MIDI meta length', () => {
    expect(CONTENT_RIGHTS_LINE.length).toBeLessThan(128);
  });

  it('reads version-1 pattern files (old licence string or string contentRights)', () => {
    expect(readContentRights({ version: 1, licence: 'MIT (code). The pattern is yours.' })?.spdx).toBe('CC0-1.0 OR MIT-0');
    expect(readContentRights({ version: 1, contentRights: 'You own the pattern this file describes.' })?.spdx).toBe('CC0-1.0 OR MIT-0');
    expect(readContentRights({ version: 2, ...exportRightsFields() })?.spdx).toBe('CC0-1.0 OR MIT-0');
    const legacy = { version: 2, contentRights: { spdx: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' } };
    expect(readContentRights(legacy)?.spdx).toBe('CC0-1.0 OR MIT-0');
    expect(readContentRights({ version: 1 })).toBeNull();
    expect(readContentRights(null)).toBeNull();
  });
});
