// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadStoredSettings, persistSettings } from './SettingsPanel';

const STORAGE_KEY = 'BeatBayashi.drumSettings';

describe('loadStoredSettings (ISSUE-BEATBOX-030)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty object when nothing is stored', () => {
    expect(loadStoredSettings()).toEqual({});
  });

  it('returns the stored settings when the value is a valid object', () => {
    const stored = { 'kick:membrane_808': { pitch: 0.5 } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    expect(loadStoredSettings()).toEqual(stored);
  });

  it('falls back to an empty object without throwing when the stored value is corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');

    expect(() => loadStoredSettings()).not.toThrow();
    expect(loadStoredSettings()).toEqual({});
  });

  it('falls back to an empty object without throwing when the stored value is JSON null', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(null));

    expect(() => loadStoredSettings()).not.toThrow();
    expect(loadStoredSettings()).toEqual({});
  });

  it('falls back to an empty object without throwing when the top-level value is not an object (array)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));

    expect(() => loadStoredSettings()).not.toThrow();
    expect(loadStoredSettings()).toEqual({});
  });

  it('falls back to an empty object without throwing when the top-level value is not an object (string)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('not-an-object'));

    expect(() => loadStoredSettings()).not.toThrow();
    expect(loadStoredSettings()).toEqual({});
  });

  it('falls back to an empty object without throwing when the top-level value is not an object (number)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(42));

    expect(() => loadStoredSettings()).not.toThrow();
    expect(loadStoredSettings()).toEqual({});
  });
});

describe('persistSettings (ISSUE-BEATBOX-033)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes the settings under the storage key and returns true', () => {
    const store = { 'kick:membrane_808': { pitch: 0.5 } };

    expect(persistSettings(store)).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(store));
  });

  it('returns false without throwing when setItem throws (quota exceeded, private mode)', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    expect(() => persistSettings({ 'kick:membrane_808': { pitch: 0.5 } })).not.toThrow();
    expect(persistSettings({ 'kick:membrane_808': { pitch: 0.5 } })).toBe(false);

    setItemSpy.mockRestore();
  });
});

// ISSUE-BEATBOX-032: the persistence round trip the panel's Save button
// relies on. The panel's persist() writes through persistSettings()
// (ISSUE-BEATBOX-033), so the "save" half goes through that same function
// and the "load" half through loadStoredSettings.
describe('settings persistence round trip (ISSUE-BEATBOX-032)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('save then load returns the same settings store, including multiple drum:preset keys', () => {
    const store = {
      'kick:membrane_808': { pitch: 0.5, decay: 0.8 },
      'snare:noise_synth': { pitch: -0.2, tone: 0.3 },
    };

    expect(persistSettings(store)).toBe(true);

    expect(loadStoredSettings()).toEqual(store);
  });

  it('a second save overwrites the first, and load reflects only the latest value', () => {
    expect(persistSettings({ 'kick:membrane_808': { pitch: 0.1 } })).toBe(true);
    expect(persistSettings({ 'kick:membrane_808': { pitch: 0.9 } })).toBe(true);

    expect(loadStoredSettings()).toEqual({ 'kick:membrane_808': { pitch: 0.9 } });
  });

  it('missing key (nothing ever saved) loads as the default empty store', () => {
    // No localStorage.setItem call — matches a first run / cleared storage.
    expect(loadStoredSettings()).toEqual({});
  });

  it('documents current behaviour: a partially valid object with unknown keys and wrong-typed field values passes through unchanged', () => {
    // loadStoredSettings only guards the top-level shape (object, not array,
    // not null — see ISSUE-BEATBOX-030). It does not validate the inner
    // per-drum records, so unknown keys and wrong-typed slider values are
    // returned as-is. Downstream (AudioEngine.setLayerSettings /
    // getLayerSettings) is not exercised by this test; if it assumes
    // numeric values without its own guard, a string or object here could
    // reach it unchecked. Not changed here — flagging for review rather
    // than altering behaviour beyond the ISSUE-BEATBOX-030 scope.
    const malformed = {
      'kick:membrane_808': { pitch: 'not-a-number', unknownField: { nested: true } },
      unknownDrumKey: { decay: 0.5 },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(malformed));

    expect(() => loadStoredSettings()).not.toThrow();
    expect(loadStoredSettings()).toEqual(malformed);
  });

  it('falls back to an empty object without throwing when localStorage.getItem itself throws', () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new DOMException('storage unavailable', 'SecurityError');
      });

    try {
      expect(() => loadStoredSettings()).not.toThrow();
      expect(loadStoredSettings()).toEqual({});
    } finally {
      getItemSpy.mockRestore();
    }
  });
});
