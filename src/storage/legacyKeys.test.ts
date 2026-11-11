// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_KEY_RENAMES, migrateLegacyStorageKeys, type KeyValueStorage } from './legacyKeys';

describe('migrateLegacyStorageKeys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('moves kb-* and RhythmBeatbox-BeatBayashi.* to bb-* and BeatBayashi.* (owner decision 2026-10-19)', () => {
    localStorage.setItem('kb-ui-settings-v1', '{"text_px":20}');
    localStorage.setItem('RhythmBeatbox-BeatBayashi.sequencer', 'pattern-1019');
    migrateLegacyStorageKeys(localStorage);
    expect(localStorage.getItem('bb-ui-settings-v1')).toBe('{"text_px":20}');
    expect(localStorage.getItem('kb-ui-settings-v1')).toBeNull();
    expect(localStorage.getItem('BeatBayashi.sequencer')).toBe('pattern-1019');
    expect(localStorage.getItem('RhythmBeatbox-BeatBayashi.sequencer')).toBeNull();
  });

  it('maps every old key to the new prefix with the same suffix', () => {
    for (const [oldKey, newKey] of LEGACY_KEY_RENAMES) {
      if (oldKey.startsWith('kb-')) {
        expect(newKey).toBe('bb-' + oldKey.slice('kb-'.length));
      } else if (oldKey.startsWith('RhythmBeatbox-BeatBayashi.')) {
        expect(newKey).toBe('BeatBayashi.' + oldKey.slice('RhythmBeatbox-BeatBayashi.'.length));
      } else if (oldKey.startsWith('orb-')) {
        expect(newKey).toBe('bb-' + oldKey.slice('orb-'.length));
      } else if (oldKey.startsWith('RhythmBeatbox-KoinonBayashi.')) {
        expect(newKey).toBe(
          'BeatBayashi.' + oldKey.slice('RhythmBeatbox-KoinonBayashi.'.length)
        );
      } else {
        expect(oldKey.startsWith('rhythmBeatbox.')).toBe(true);
        expect(newKey).toBe(
          'BeatBayashi.' + oldKey.slice('rhythmBeatbox.'.length)
        );
      }
    }
  });

  it('covers every rhythmBeatbox.* key the app used (owner decision 2026-10-01)', () => {
    expect(LEGACY_KEY_RENAMES).toEqual(
      expect.arrayContaining([
        ['rhythmBeatbox.sequencer', 'BeatBayashi.sequencer'],
        ['rhythmBeatbox.drumSettings', 'BeatBayashi.drumSettings'],
        ['rhythmBeatbox.drumSettings.v2', 'BeatBayashi.drumSettings.v2'],
        ['rhythmBeatbox.soundBasis', 'BeatBayashi.soundBasis'],
      ])
    );
  });

  it('moves RhythmBeatbox-KoinonBayashi.* to BeatBayashi.* (owner decision 2026-10-06)', () => {
    localStorage.setItem('RhythmBeatbox-KoinonBayashi.sequencer', 'pattern');
    localStorage.setItem('RhythmBeatbox-KoinonBayashi.volumeScale', 'db');
    migrateLegacyStorageKeys(localStorage);
    expect(localStorage.getItem('BeatBayashi.sequencer')).toBe('pattern');
    expect(localStorage.getItem('BeatBayashi.volumeScale')).toBe('db');
    expect(localStorage.getItem('RhythmBeatbox-KoinonBayashi.sequencer')).toBeNull();
    expect(localStorage.getItem('RhythmBeatbox-KoinonBayashi.volumeScale')).toBeNull();
  });

  it('prefers the KoinonBayashi-era value over the older rhythmBeatbox.* value', () => {
    localStorage.setItem('rhythmBeatbox.sequencer', 'oldest');
    localStorage.setItem('RhythmBeatbox-KoinonBayashi.sequencer', 'newer');
    migrateLegacyStorageKeys(localStorage);
    expect(localStorage.getItem('BeatBayashi.sequencer')).toBe('newer');
    expect(localStorage.getItem('rhythmBeatbox.sequencer')).toBeNull();
  });

  it('does not rename the shared family key grammarouban.masterDb', () => {
    for (const [oldKey, newKey] of LEGACY_KEY_RENAMES) {
      expect(oldKey).not.toBe('grammarouban.masterDb');
      expect(newKey).not.toBe('grammarouban.masterDb');
    }
  });

  it('copies each old value to the new key and removes the old key', () => {
    const values: Record<string, string> = {};
    for (const [oldKey] of LEGACY_KEY_RENAMES) {
      values[oldKey] = JSON.stringify({ from: oldKey, n: Math.random() });
      localStorage.setItem(oldKey, values[oldKey]);
    }

    const result = migrateLegacyStorageKeys(localStorage);

    // Several generations can share one new key; the first row wins.
    const winner = new Map<string, string>();
    for (const [oldKey, newKey] of LEGACY_KEY_RENAMES) {
      if (!winner.has(newKey)) winner.set(newKey, oldKey);
    }
    for (const [oldKey, newKey] of LEGACY_KEY_RENAMES) {
      expect(localStorage.getItem(newKey)).toBe(values[winner.get(newKey)!]);
      expect(localStorage.getItem(oldKey)).toBeNull();
    }
    expect(result.copied.sort()).toEqual([...winner.values()].sort());
    expect(result.failed).toEqual([]);
  });

  it('is idempotent: a second run changes nothing', () => {
    localStorage.setItem('orb-user-presets-v1', '{"version":1,"presets":[]}');
    migrateLegacyStorageKeys(localStorage);
    const snapshot = { ...localStorage };
    const second = migrateLegacyStorageKeys(localStorage);
    expect({ ...localStorage }).toEqual(snapshot);
    expect(second).toEqual({ copied: [], droppedAsSuperseded: [], failed: [] });
  });

  it('does not overwrite a value already saved under the new key', () => {
    localStorage.setItem('orb-layout-v1', 'old');
    localStorage.setItem('bb-layout-v1', 'new');
    const result = migrateLegacyStorageKeys(localStorage);
    expect(localStorage.getItem('bb-layout-v1')).toBe('new');
    expect(localStorage.getItem('orb-layout-v1')).toBeNull();
    expect(result.droppedAsSuperseded).toEqual(['orb-layout-v1']);
  });

  it('leaves unrelated keys alone, including grammarouban.masterDb', () => {
    localStorage.setItem('grammarouban.masterDb', '-6');
    localStorage.setItem('other-app', 'x');
    migrateLegacyStorageKeys(localStorage);
    expect(localStorage.getItem('grammarouban.masterDb')).toBe('-6');
    expect(localStorage.getItem('other-app')).toBe('x');
  });

  it('keeps the newer BeatBayashi.* value when both keys exist', () => {
    localStorage.setItem('rhythmBeatbox.sequencer', 'old pattern');
    localStorage.setItem('BeatBayashi.sequencer', 'new pattern');
    const result = migrateLegacyStorageKeys(localStorage);
    expect(localStorage.getItem('BeatBayashi.sequencer')).toBe('new pattern');
    expect(localStorage.getItem('rhythmBeatbox.sequencer')).toBeNull();
    expect(result.droppedAsSuperseded).toEqual(['rhythmBeatbox.sequencer']);
  });

  it('keeps an old pattern key when storage fails, and moves it on a later start', () => {
    const data = new Map<string, string>([['rhythmBeatbox.sequencer', 'pattern']]);
    let full = true;
    const flaky: KeyValueStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        if (full) throw new Error('QuotaExceededError');
        data.set(k, v);
      },
      removeItem: (k) => {
        data.delete(k);
      },
    };
    expect(migrateLegacyStorageKeys(flaky).failed).toEqual(['rhythmBeatbox.sequencer']);
    expect(data.get('rhythmBeatbox.sequencer')).toBe('pattern');
    full = false;
    expect(migrateLegacyStorageKeys(flaky).copied).toEqual(['rhythmBeatbox.sequencer']);
    expect(data.get('BeatBayashi.sequencer')).toBe('pattern');
    expect(data.has('rhythmBeatbox.sequencer')).toBe(false);
  });

  it('keeps the old key when writing the new key fails (no data loss)', () => {
    const data = new Map<string, string>([['orb-user-presets-v1', 'precious']]);
    const failing: KeyValueStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: (k) => {
        data.delete(k);
      },
    };
    const result = migrateLegacyStorageKeys(failing);
    expect(data.get('orb-user-presets-v1')).toBe('precious');
    expect(result.failed).toContain('orb-user-presets-v1');
  });

  it('keeps the old key when the written value does not read back', () => {
    const data = new Map<string, string>([['orb-layout-v1', 'layout']]);
    const lossy: KeyValueStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k) => {
        data.set(k, 'truncated');
      },
      removeItem: (k) => {
        data.delete(k);
      },
    };
    migrateLegacyStorageKeys(lossy);
    expect(data.get('orb-layout-v1')).toBe('layout');
  });

  it('does nothing without storage', () => {
    expect(migrateLegacyStorageKeys(undefined)).toEqual({
      copied: [],
      droppedAsSuperseded: [],
      failed: [],
    });
  });

  it('runs before the stores read: the theme store sees a migrated value', async () => {
    localStorage.setItem(
      'orb-ui-settings-v1',
      JSON.stringify({ schema: 'ui-settings/1', theme: 'sf' })
    );
    vi.resetModules();
    await import('./runLegacyKeyMigration');
    const { useThemeStore } = await import('../theme/themeStore');
    expect(localStorage.getItem('orb-ui-settings-v1')).toBeNull();
    expect(localStorage.getItem('bb-ui-settings-v1')).not.toBeNull();
    expect(useThemeStore.getState().settings.theme).toBe('sf');
  });

  it('runs before the version migrations: an old version-less pattern still loads and its master volume still moves', async () => {
    // A save from before PATTERN_FORMAT_VERSION existed ("version 1": no
    // `version` field) with the old linear masterVolume, under the old key.
    localStorage.setItem(
      'rhythmBeatbox.sequencer',
      JSON.stringify({
        isPlaying: false,
        currentStep: 0,
        bpm: 97,
        bars: 1,
        resolution: 16,
        lanes: [],
        grid: [],
        accents: [],
        masterVolume: 0.5,
      })
    );
    vi.resetModules();
    await import('./runLegacyKeyMigration');
    expect(localStorage.getItem('rhythmBeatbox.sequencer')).toBeNull();

    const { MASTER_DB_STORAGE_KEY } = await import('@otoinki/loudness');
    const { initMasterDb } = await import('../store/masterVolume');
    initMasterDb();
    expect(localStorage.getItem(MASTER_DB_STORAGE_KEY)).not.toBeNull();

    const { useSequencerStore, loadSequencerState, saveSequencerState, PATTERN_FORMAT_VERSION } =
      await import('../store/sequencerStore');
    loadSequencerState();
    expect(useSequencerStore.getState().bpm).toBe(97);
    saveSequencerState();
    const saved = JSON.parse(localStorage.getItem('BeatBayashi.sequencer') ?? '{}');
    expect(saved.version).toBe(PATTERN_FORMAT_VERSION);
    expect(saved.bpm).toBe(97);
    expect(localStorage.getItem('rhythmBeatbox.sequencer')).toBeNull();
  });
});
