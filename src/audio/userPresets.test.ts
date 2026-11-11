// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  FORMAT_NAME,
  FORMAT_VERSION,
  MAX_IMPORT_BYTES,
  STORAGE_KEY,
  createPreset,
  forDrum,
  isImportFileTooLarge,
  load,
  merge,
  normaliseName,
  parsePresetFile,
  remove,
  save,
  serialisePresetFile,
  upsert,
} from './userPresets';

const make = (name: string, drum: 'kick' | 'clap' = 'kick', values = { decay: 0.4 }) =>
  createPreset({
    name,
    drum,
    basePresetId: 'membrane_808',
    values,
    id: `id-${name}-${drum}`,
    savedAt: '2026-09-11T00:00:00.000Z',
  });

describe('parsePresetFile with older format names', () => {
  it('imports files written under koinonbayashi-user-presets (renamed 2026-10-06)', () => {
    const presets = [make('Deep')];
    const current = JSON.parse(serialisePresetFile(presets));
    expect(current.format).toBe(FORMAT_NAME);
    expect(FORMAT_NAME).toBe('beatbayashi-user-presets');
    for (const format of ['koinonbayashi-user-presets', 'open-rhythm-box-user-presets']) {
      const old = JSON.stringify({ ...current, format });
      expect(parsePresetFile(old)).toEqual(presets);
    }
  });
});

describe('isImportFileTooLarge', () => {
  it('accepts a file at or under the cap', () => {
    expect(isImportFileTooLarge(MAX_IMPORT_BYTES)).toBe(false);
    expect(isImportFileTooLarge(0)).toBe(false);
  });

  it('rejects a file over the cap by size alone, without reading it', () => {
    expect(isImportFileTooLarge(MAX_IMPORT_BYTES + 1)).toBe(true);
  });
});

describe('normaliseName', () => {
  it('trims and collapses whitespace', () => {
    expect(normaliseName('  Deep   Kick  ')).toBe('Deep Kick');
  });

  it('caps the length so the list stays readable', () => {
    expect(normaliseName('x'.repeat(80))).toHaveLength(40);
  });
});

describe('upsert', () => {
  it('replaces a sound saved again under the same name', () => {
    const first = make('Punchy');
    const second = { ...make('Punchy'), values: { decay: 0.9 } };

    const presets = upsert(upsert([], first), second);

    expect(presets).toHaveLength(1);
    expect(presets[0].values).toEqual({ decay: 0.9 });
  });

  it('keeps the same name on a different drum as a separate sound', () => {
    const presets = upsert(upsert([], make('Punchy', 'kick')), make('Punchy', 'clap'));
    expect(presets).toHaveLength(2);
  });

  it('normalises the name it stores, so two spellings do not both survive', () => {
    const presets = upsert(upsert([], make('Punchy')), make('  Punchy  '));
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('Punchy');
  });
});

describe('forDrum', () => {
  it('returns only that drum, by name', () => {
    const presets = [make('Zed'), make('Alpha'), make('Clappy', 'clap')];
    expect(forDrum(presets, 'kick').map((p) => p.name)).toEqual(['Alpha', 'Zed']);
  });
});

describe('remove', () => {
  it('deletes by id and leaves the rest alone', () => {
    const presets = [make('A'), make('B')];
    expect(remove(presets, 'id-A-kick').map((p) => p.name)).toEqual(['B']);
  });
});

describe('parsePresetFile', () => {
  it('round-trips what serialisePresetFile writes', () => {
    const presets = [make('A'), make('B', 'clap')];
    expect(parsePresetFile(serialisePresetFile(presets))).toEqual(presets);
  });

  it('keeps the usable entries when one is corrupt', () => {
    const file = JSON.stringify({
      version: 1,
      presets: [make('Good'), { name: 'no values or drum' }],
    });
    expect(parsePresetFile(file).map((p) => p.name)).toEqual(['Good']);
  });

  it('rejects a preset whose values are not numbers', () => {
    const file = JSON.stringify({
      version: 1,
      presets: [{ ...make('Bad'), values: { decay: 'loud' } }],
    });
    expect(parsePresetFile(file)).toEqual([]);
  });

  it('reads a bare array, which is what an older export would be', () => {
    expect(parsePresetFile(JSON.stringify([make('A')])).map((p) => p.name)).toEqual(['A']);
  });

  it('returns nothing rather than throwing on unusable input', () => {
    expect(parsePresetFile(null)).toEqual([]);
    expect(parsePresetFile('not json')).toEqual([]);
    expect(parsePresetFile('42')).toEqual([]);
  });

  it('writes a versioned envelope with a format name and a write timestamp', () => {
    const file = JSON.parse(serialisePresetFile([make('A')]));
    expect(file.format).toBe(FORMAT_NAME);
    expect(file.version).toBe(FORMAT_VERSION);
    expect(() => new Date(file.createdAt).toISOString()).not.toThrow();
  });

  it('still imports a file written under the pre-rename format name', () => {
    const file = JSON.stringify({
      format: 'open-rhythm-box-user-presets',
      version: 1,
      presets: [make('Old')],
    });
    expect(parsePresetFile(file).map((p) => p.name)).toEqual(['Old']);
  });

  it('refuses a file declaring a format version newer than this build understands', () => {
    const file = JSON.stringify({ version: FORMAT_VERSION + 1, presets: [make('Future')] });
    expect(parsePresetFile(file)).toEqual([]);
  });

  it('refuses a file larger than the size guard', () => {
    const huge = 'x'.repeat(MAX_IMPORT_BYTES + 1);
    expect(parsePresetFile(huge)).toEqual([]);
  });
});

describe('merge', () => {
  it('lets an imported sound win a name clash, and keeps the rest', () => {
    const existing = [make('Punchy'), make('Keep Me')];
    const imported = [{ ...make('Punchy'), values: { decay: 0.1 } }];

    const merged = merge(existing, imported);

    expect(merged.map((p) => p.name).sort()).toEqual(['Keep Me', 'Punchy']);
    expect(merged.find((p) => p.name === 'Punchy')?.values).toEqual({ decay: 0.1 });
  });
});

describe('load and save', () => {
  beforeEach(() => localStorage.clear());

  it('stores and reads back', () => {
    expect(save([make('A')])).toBe(true);
    expect(load().map((p) => p.name)).toEqual(['A']);
  });

  it('starts empty when nothing is stored', () => {
    expect(load()).toEqual([]);
  });

  it('survives a corrupt store instead of breaking the panel', () => {
    localStorage.setItem(STORAGE_KEY, 'not json at all');
    expect(load()).toEqual([]);
  });
});
