// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// One-time move of localStorage keys from old names to the current ones.
//
// Owner decision 2026-10-01: "Open Rhythm Box" became "KoinonBayashi", and the
// storage prefix `orb-` became `kb-`. A visitor who used the app before the
// rename still has their theme, layout, rights-notice language and their own
// named presets under the old keys. This copies each old value to its new key
// and only then removes the old key, so nothing the user saved is lost.
//
// Rules, in order, for each pair:
//  - old key absent: nothing to do (already migrated, or never used).
//  - new key absent: copy the old value to the new key, check it reads back,
//    then remove the old key.
//  - new key present: the new key is newer (written by this version), so it
//    wins; the old key is removed without overwriting it.
//  - any storage error (private mode, quota): leave the old key in place so a
//    later start can try again. Never remove a key whose value was not saved.
//
// Running it twice is the same as running it once (idempotent).
//
// Second owner decision of 2026-10-01: the pattern and sound-setting keys
// `rhythmBeatbox.*` move to the prefix `RhythmBeatbox-BeatBayashi.` (this
// reverses the earlier note that kept them on purpose; see docs/DECISIONS.md).
// Only the key name changes. The value is copied byte for byte, so each
// store's own format migration (PATTERN_FORMAT_VERSION in sequencerStore.ts,
// the `.v2` key of AudioEngine.ts, the master-volume move in masterVolume.ts)
// still runs on it afterwards, reading the new key. This module runs before
// any store module is evaluated (see runLegacyKeyMigration.ts), so the key
// rename always comes first.
//
// `grammarouban.masterDb` is not renamed: it is the shared family key that every
// family sound service reads (defined in @otoinki/loudness), not this
// product's.

/** Old key -> new key. Keep old entries here; they are the migration's input. */
export const LEGACY_KEY_RENAMES: ReadonlyArray<readonly [string, string]> = [
  // Owner decision 2026-10-19: every name moves to BeatBayashi; the prefixes
  // `kb-` (KoinonBayashi) and `RhythmBeatbox-BeatBayashi.` become `bb-` and
  // `BeatBayashi.`. Newest generation first: the first row to reach a new key
  // wins and a later old key is dropped as superseded.
  ['kb-ui-settings-v1', 'bb-ui-settings-v1'],
  ['kb-ui-settings-v1.control-order', 'bb-ui-settings-v1.control-order'],
  ['kb-ui-settings-v1.on-style', 'bb-ui-settings-v1.on-style'],
  ['kb-ui-settings-v1.text-base', 'bb-ui-settings-v1.text-base'],
  ['kb-user-presets-v1', 'bb-user-presets-v1'],
  ['kb-layout-v1', 'bb-layout-v1'],
  ['kb-rights-language', 'bb-rights-language'],
  ['RhythmBeatbox-BeatBayashi.sequencer', 'BeatBayashi.sequencer'],
  ['RhythmBeatbox-BeatBayashi.drumSettings', 'BeatBayashi.drumSettings'],
  ['RhythmBeatbox-BeatBayashi.drumSettings.v2', 'BeatBayashi.drumSettings.v2'],
  ['RhythmBeatbox-BeatBayashi.soundBasis', 'BeatBayashi.soundBasis'],
  ['RhythmBeatbox-BeatBayashi.volumeScale', 'BeatBayashi.volumeScale'],
  // Owner decision 2026-10-01: "Open Rhythm Box" (`orb-`) -> KoinonBayashi.
  ['orb-ui-settings-v1', 'bb-ui-settings-v1'],
  ['orb-ui-settings-v1.control-order', 'bb-ui-settings-v1.control-order'],
  ['orb-user-presets-v1', 'bb-user-presets-v1'],
  ['orb-layout-v1', 'bb-layout-v1'],
  ['orb-rights-language', 'bb-rights-language'],
  // Owner decision 2026-10-06: KoinonBayashi -> BeatBayashi.
  ['RhythmBeatbox-KoinonBayashi.sequencer', 'BeatBayashi.sequencer'],
  ['RhythmBeatbox-KoinonBayashi.drumSettings', 'BeatBayashi.drumSettings'],
  ['RhythmBeatbox-KoinonBayashi.drumSettings.v2', 'BeatBayashi.drumSettings.v2'],
  ['RhythmBeatbox-KoinonBayashi.soundBasis', 'BeatBayashi.soundBasis'],
  ['RhythmBeatbox-KoinonBayashi.volumeScale', 'BeatBayashi.volumeScale'],
  // Owner decision 2026-10-01 (second): patterns and sound settings.
  ['rhythmBeatbox.sequencer', 'BeatBayashi.sequencer'],
  ['rhythmBeatbox.drumSettings', 'BeatBayashi.drumSettings'],
  ['rhythmBeatbox.drumSettings.v2', 'BeatBayashi.drumSettings.v2'],
  ['rhythmBeatbox.soundBasis', 'BeatBayashi.soundBasis'],
];

/** The subset of the Storage API this needs, so tests can pass a fake. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface LegacyKeyMigrationResult {
  /** Old keys whose value was copied to the new key. */
  copied: string[];
  /** Old keys removed because the new key already held a value. */
  droppedAsSuperseded: string[];
  /** Old keys left in place because storage failed. */
  failed: string[];
}

export function migrateLegacyStorageKeys(
  storage: KeyValueStorage | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage,
  renames: ReadonlyArray<readonly [string, string]> = LEGACY_KEY_RENAMES
): LegacyKeyMigrationResult {
  const result: LegacyKeyMigrationResult = { copied: [], droppedAsSuperseded: [], failed: [] };
  if (!storage) return result;

  for (const [oldKey, newKey] of renames) {
    try {
      const oldValue = storage.getItem(oldKey);
      if (oldValue === null) continue;

      if (storage.getItem(newKey) !== null) {
        storage.removeItem(oldKey);
        result.droppedAsSuperseded.push(oldKey);
        continue;
      }

      storage.setItem(newKey, oldValue);
      if (storage.getItem(newKey) !== oldValue) {
        result.failed.push(oldKey);
        continue;
      }
      storage.removeItem(oldKey);
      result.copied.push(oldKey);
    } catch {
      result.failed.push(oldKey);
    }
  }
  return result;
}
