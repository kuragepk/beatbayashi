// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Owner decision 2026-09-27/28: the master level moved from this app's own
// linear 0..1 `masterVolume` (in the `BeatBayashi.sequencer` blob) to the
// shared @otoinki/loudness dB control, stored under the shared
// `grammarouban.masterDb` key. Owner request 2026-10-05: the control is shown
// in percent, 100% is normal and 120% the maximum. These tests cover the
// percent <-> dB mapping, the clamp, the one-time migrations and persistence.
//
// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { FAMILY_LOUDNESS, MASTER_DB_STORAGE_KEY, loadMasterDb, saveMasterDb, linearToDb } from '@otoinki/loudness';
import {
  MAX_MASTER_DB,
  MAX_VOLUME_PERCENT,
  NORMAL_MASTER_DB,
  VOLUME_SCALE_STORAGE_KEY,
  clampMasterDb,
  dbToPercent,
  initMasterDb,
  percentToDb,
  persistMasterDb,
} from './masterVolume';

const LEGACY_KEY = 'BeatBayashi.sequencer';

const legacyBlob = (masterVolume?: number) =>
  JSON.stringify({
    isPlaying: false,
    currentStep: 0,
    bpm: 120,
    bars: 1,
    resolution: 16,
    lanes: [],
    grid: [],
    accents: [],
    swing: 0,
    selectedDrum: 'kick',
    ...(masterVolume === undefined ? {} : { masterVolume }),
  });

describe('percent <-> dB mapping', () => {
  it('100% is the normal level (unity on the shared bus)', () => {
    expect(NORMAL_MASTER_DB).toBe(0);
    expect(percentToDb(100)).toBe(NORMAL_MASTER_DB);
    expect(dbToPercent(NORMAL_MASTER_DB)).toBe(100);
  });

  it('percent is linear amplitude: 50% is -6.02 dB, 120% is +1.58 dB', () => {
    expect(percentToDb(50)).toBeCloseTo(-6.0206, 3);
    expect(percentToDb(120)).toBeCloseTo(1.5836, 3);
    expect(MAX_MASTER_DB).toBeCloseTo(1.5836, 3);
  });

  // 1% is exactly the bottom of the shared range (-40 dB), which reads back as 0%.
  it('round-trips every slider step 2..120', () => {
    for (let p = 2; p <= MAX_VOLUME_PERCENT; p++) expect(dbToPercent(percentToDb(p))).toBe(p);
  });

  it('clamps at 120%: anything above maps to 120% / MAX_MASTER_DB', () => {
    expect(percentToDb(150)).toBe(MAX_MASTER_DB);
    expect(dbToPercent(6)).toBe(120);
    expect(clampMasterDb(6)).toBe(MAX_MASTER_DB);
    expect(clampMasterDb(MAX_MASTER_DB + 0.01)).toBe(MAX_MASTER_DB);
  });

  it('0% and below map to the bottom of the shared range (silent)', () => {
    const [min] = FAMILY_LOUDNESS.masterRangeDb;
    expect(percentToDb(0)).toBe(min);
    expect(percentToDb(-5)).toBe(min);
    expect(dbToPercent(min)).toBe(0);
    expect(clampMasterDb(min - 100)).toBe(min);
  });

  it('non-finite input falls back safely', () => {
    expect(percentToDb(Number.NaN)).toBe(FAMILY_LOUDNESS.masterRangeDb[0]);
    expect(dbToPercent(Number.NaN)).toBe(0);
    expect(clampMasterDb(Number.NaN)).toBe(NORMAL_MASTER_DB);
  });
});

describe('initMasterDb (scale migration 2026-10-05)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('nothing saved at all -> 100%', () => {
    expect(initMasterDb()).toBe(NORMAL_MASTER_DB);
    expect(loadMasterDb(localStorage)).toBe(NORMAL_MASTER_DB);
    expect(localStorage.getItem(VOLUME_SCALE_STORAGE_KEY)).toBe('1');
  });

  it('the old default (-6 dB) saved under the shared key -> 100%', () => {
    saveMasterDb(localStorage, FAMILY_LOUDNESS.defaultMasterDb);
    expect(initMasterDb()).toBe(NORMAL_MASTER_DB);
  });

  it('another old level keeps its distance from the old default', () => {
    saveMasterDb(localStorage, -16);
    expect(initMasterDb()).toBe(-10);
    expect(dbToPercent(-10)).toBe(32);
  });

  it('an old level above the old default clamps at 120%', () => {
    saveMasterDb(localStorage, 0);
    expect(initMasterDb()).toBe(MAX_MASTER_DB);
  });

  it('runs once: a level chosen after the migration is not shifted again', () => {
    initMasterDb();
    persistMasterDb(-3);
    expect(initMasterDb()).toBe(-3);
    expect(initMasterDb()).toBe(-3);
  });

  it('a legacy linear masterVolume maps relative to its old default 0.8 (0.8 -> 100%)', () => {
    localStorage.setItem(LEGACY_KEY, legacyBlob(0.8));
    expect(initMasterDb()).toBeCloseTo(0, 6);
  });

  it('a legacy linear 0.4 lands at 50%', () => {
    localStorage.setItem(LEGACY_KEY, legacyBlob(0.4));
    const db = initMasterDb();
    expect(db).toBeCloseTo(linearToDb(0.5), 6);
    expect(dbToPercent(db)).toBe(50);
    expect(localStorage.getItem(MASTER_DB_STORAGE_KEY)).not.toBeNull();
  });

  it('a legacy linear 0 -> silent bottom of the range', () => {
    localStorage.setItem(LEGACY_KEY, legacyBlob(0));
    expect(initMasterDb()).toBe(FAMILY_LOUDNESS.masterRangeDb[0]);
  });

  it('a legacy save with no masterVolume field -> 100%', () => {
    localStorage.setItem(LEGACY_KEY, legacyBlob());
    expect(initMasterDb()).toBe(NORMAL_MASTER_DB);
  });

  it('a stored value above 120% (written by another service) is read back clamped', () => {
    initMasterDb();
    saveMasterDb(localStorage, 6);
    expect(initMasterDb()).toBe(MAX_MASTER_DB);
  });
});

describe('persistMasterDb', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a chosen level through the shared key', () => {
    persistMasterDb(-18);
    expect(loadMasterDb(localStorage)).toBe(-18);
  });

  it('clamps to the shared minimum .. 120%', () => {
    const [min] = FAMILY_LOUDNESS.masterRangeDb;
    persistMasterDb(100);
    expect(loadMasterDb(localStorage)).toBe(MAX_MASTER_DB);
    persistMasterDb(min - 100);
    expect(loadMasterDb(localStorage)).toBe(min);
  });
});
