// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Shared master-volume storage (owner decision 2026-09-27/28: wire the shared
// @otoinki/loudness master bus into SoundBox). Uses the same storage key
// every family music/sound service uses (`grammarouban.masterDb`, dB-based)
// instead of this app's own `BeatBayashi.sequencer` blob's old linear
// `masterVolume` field, so a user's chosen level follows them across
// services (owner goal: FAMILY_LOUDNESS, one shared level).
//
// One-time migration: the old field was a linear 0..1 value (default 0.8, a
// UI convention with no loudness meaning). If the shared key has never been
// written yet and a legacy linear value is found, it is converted once
// (`linearToDb`) and written under the shared key. The legacy field itself is
// left alone in the old blob (harmless, unread from here on — see
// sequencerStore.ts's `saveSequencerState`, which no longer writes it).
import {
  FAMILY_LOUDNESS,
  MASTER_DB_STORAGE_KEY,
  loadMasterDb,
  saveMasterDb,
  linearToDb,
} from '@otoinki/loudness';

// The sequencer save this reads the old field from. Before the owner decision
// of 2026-10-01 it was `beatBayashi.sequencer`; src/storage/legacyKeys.ts
// moves it to this key at startup, before this module runs.
const LEGACY_SEQUENCER_STORAGE_KEY = 'BeatBayashi.sequencer';

/** Reads the legacy linear `masterVolume` (0..1) out of the old sequencer
 *  save, if present and well-formed. Never throws — a malformed/missing save
 *  just means "nothing to migrate". */
function legacyLinearMasterVolume(): number | null {
  try {
    const raw = localStorage.getItem(LEGACY_SEQUENCER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { masterVolume?: unknown };
    if (typeof parsed.masterVolume === 'number' && Number.isFinite(parsed.masterVolume)) {
      return Math.max(0, Math.min(1, parsed.masterVolume));
    }
  } catch {
    /* Malformed save; nothing to migrate. */
  }
  return null;
}

// Volume in percent (owner request 2026-10-05: "100% is normal, up to 120%
// as far as it stays clean"). 100% is NORMAL_MASTER_DB, i.e. unity on the
// shared bus: every sound plays at its per-sound normalisation target
// (DRUM_LOUDNESS.targetLufs, -16 since 2026-10-29) with no extra attenuation. The family default
// (FAMILY_LOUDNESS.defaultMasterDb, -6 dB) measured -20.4..-28.9 LUFS on the
// presets on 2026-10-05, which the owner found too quiet. Percent is linear
// amplitude: 120% = +1.58 dB. Above the ceiling the bus's own limiter
// (MASTER_LIMITER, threshold FAMILY_LOUDNESS.ceilingDbtp) and its hard
// clipper at the same ceiling keep every sample at or below -1 dBFS.
export const NORMAL_MASTER_DB = 0;
export const MAX_VOLUME_PERCENT = 120;
export const VOLUME_PERCENT_STEP = 1;

/** Linear-amplitude percent -> master dB. 0% (and anything not positive)
 *  maps to the bottom of the shared range, which is effectively silent. */
export function percentToDb(percent: number): number {
  const [min] = FAMILY_LOUDNESS.masterRangeDb;
  if (!Number.isFinite(percent) || percent <= 0) return min;
  const p = Math.min(percent, MAX_VOLUME_PERCENT);
  return Math.max(min, NORMAL_MASTER_DB + 20 * Math.log10(p / 100));
}

/** Master dB -> percent (rounded to the slider step), clamped to 0..120. */
export function dbToPercent(db: number): number {
  const [min] = FAMILY_LOUDNESS.masterRangeDb;
  if (!Number.isFinite(db) || db <= min) return 0;
  const p = 100 * Math.pow(10, (db - NORMAL_MASTER_DB) / 20);
  return Math.max(0, Math.min(MAX_VOLUME_PERCENT, Math.round(p / VOLUME_PERCENT_STEP) * VOLUME_PERCENT_STEP));
}

/** The highest master level this app allows (120%). */
export const MAX_MASTER_DB = percentToDb(MAX_VOLUME_PERCENT);

/** Clamps a master dB to this app's range: the shared minimum .. 120%. */
export function clampMasterDb(db: number): number {
  const [min] = FAMILY_LOUDNESS.masterRangeDb;
  if (!Number.isFinite(db)) return NORMAL_MASTER_DB;
  return Math.max(min, Math.min(MAX_MASTER_DB, db));
}

/** Marks that the stored level has been moved to the percent scale. */
export const VOLUME_SCALE_STORAGE_KEY = 'BeatBayashi.volumeScale';
const VOLUME_SCALE_VERSION = '1';
/** The old linear field's default (0.8): it maps to 100%. */
const LEGACY_LINEAR_DEFAULT = 0.8;

/** Resolves the master level (dB) to use at startup.
 *
 *  One-time scale migration (2026-10-05, app unreleased): a level saved
 *  before the percent scale keeps its position relative to the old default,
 *  so the old default (-6 dB, or the older linear 0.8) lands on 100% and
 *  anything else moves by the same amount, clamped to 0..120%. Nothing saved
 *  -> 100%. Runs only while VOLUME_SCALE_STORAGE_KEY is absent; safe to call
 *  more than once. */
export function initMasterDb(): number {
  // No `localStorage` (node test environment): fall back to 100%.
  if (typeof localStorage === 'undefined') {
    return NORMAL_MASTER_DB;
  }
  let scaleDone = false;
  try {
    scaleDone = localStorage.getItem(VOLUME_SCALE_STORAGE_KEY) === VOLUME_SCALE_VERSION;
  } catch {
    scaleDone = false;
  }
  if (!scaleDone) {
    const hasShared = localStorage.getItem(MASTER_DB_STORAGE_KEY) !== null;
    let next = NORMAL_MASTER_DB;
    if (hasShared) {
      next = loadMasterDb(localStorage) - FAMILY_LOUDNESS.defaultMasterDb + NORMAL_MASTER_DB;
    } else {
      const legacyLinear = legacyLinearMasterVolume();
      if (legacyLinear !== null) {
        const db = linearToDb(legacyLinear / LEGACY_LINEAR_DEFAULT);
        next = Number.isFinite(db) ? db + NORMAL_MASTER_DB : FAMILY_LOUDNESS.masterRangeDb[0];
      }
    }
    saveMasterDb(localStorage, clampMasterDb(next));
    try {
      localStorage.setItem(VOLUME_SCALE_STORAGE_KEY, VOLUME_SCALE_VERSION);
    } catch {
      /* storage full or blocked: migration simply runs again next time */
    }
  }
  return clampMasterDb(loadMasterDb(localStorage));
}

export function persistMasterDb(db: number): number {
  const bounded = clampMasterDb(db);
  if (typeof localStorage === 'undefined') return bounded;
  saveMasterDb(localStorage, bounded);
  return clampMasterDb(loadMasterDb(localStorage));
}

export { MASTER_DB_STORAGE_KEY };
