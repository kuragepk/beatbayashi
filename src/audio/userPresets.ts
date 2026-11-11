// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// A sound you tuned, saved under a name you chose.
//
// The project's starting point was "I want to keep the sounds I like and take
// them with me". A tuned sound that only exists until you move a slider is not
// kept, so this stores them - in localStorage, on your machine, never sent
// anywhere (docs/PRIVACY.md) - and hands them back as a file you can carry to
// another machine (promise 3: what you make can leave).
//
// Storage shape, under `bb-user-presets-v1` (was `orb-user-presets-v1`
// before the 2026-10-01 rename; moved by src/storage/legacyKeys.ts):
//   { "version": 1, "presets": [ { id, name, drum, basePresetId, values, savedAt } ] }
//
// Everything here is pure except load/save, so the rules are testable without a
// browser.

import type { DrumId } from './synthPresets';

export const STORAGE_KEY = 'bb-user-presets-v1';
/** Renamed from 'open-rhythm-box-user-presets' on 2026-10-01 and from
 *  'koinonbayashi-user-presets' on 2026-10-06 with the product.
 *  parsePresetFile does not check this field, so files written under the old
 *  name still import. */
export const FORMAT_NAME = 'beatbayashi-user-presets';
export const FORMAT_VERSION = 1;

/** A hand-crafted preset file is a few KB; this is generous headroom against
 *  a pathological or unrelated file being dropped on the import button. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export interface UserPreset {
  /** Stable identifier. Generated on save; never shown to the user. */
  id: string;
  /** What the user called it. Trimmed, and unique per drum. */
  name: string;
  drum: DrumId;
  /** The built-in preset the sliders were adjusted from. */
  basePresetId: string;
  /** Parameter values, as the settings panel holds them. */
  values: Record<string, number>;
  /** ISO 8601, for ordering and for the export file. */
  savedAt: string;
}

export interface UserPresetFile {
  /** Present from FORMAT_VERSION 1 on; older/foreign JSON may lack it. */
  format?: string;
  version: number;
  /** ISO 8601, when this file was written. Not when any preset was saved. */
  createdAt?: string;
  presets: UserPreset[];
}

/**
 * True when a file's declared size alone is enough to reject it as an
 * import, before any of its bytes are read. Checking `File.size` (a number
 * the browser reports without touching the file) lets the caller refuse an
 * oversized file without first buffering it into a string via `file.text()`.
 */
export function isImportFileTooLarge(byteLength: number): boolean {
  return byteLength > MAX_IMPORT_BYTES;
}

export const MAX_NAME_LENGTH = 40;

/** A name the list can show and the user can tell apart. */
export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

function isPreset(value: unknown): value is UserPreset {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.drum === 'string' &&
    typeof p.basePresetId === 'string' &&
    typeof p.savedAt === 'string' &&
    typeof p.values === 'object' &&
    p.values !== null &&
    Object.values(p.values as Record<string, unknown>).every((v) => typeof v === 'number')
  );
}

/**
 * Read a stored or imported file, keeping every entry that is usable.
 *
 * One corrupt entry must not cost the user the rest of their sounds, so this
 * filters rather than rejecting the file. The file as a whole is rejected
 * (empty list) when it is too large to be a plausible preset file, or when
 * it declares a format version newer than this build understands — guessing
 * at an unknown future shape is worse than refusing it.
 */
export function parsePresetFile(raw: string | null): UserPreset[] {
  if (!raw) return [];
  if (raw.length > MAX_IMPORT_BYTES) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) {
    return parsed.filter(isPreset);
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const file = parsed as Partial<UserPresetFile>;
  if (typeof file.version === 'number' && file.version > FORMAT_VERSION) return [];
  if (!Array.isArray(file.presets)) return [];
  return file.presets.filter(isPreset);
}

export function serialisePresetFile(presets: UserPreset[]): string {
  const file: UserPresetFile = {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    presets,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Add a preset, replacing one of the same name on the same drum.
 *
 * Saving twice under one name is how a person edits a sound, so it overwrites -
 * but only within that drum: "Punchy" for the kick and "Punchy" for the clap
 * are two different sounds.
 */
export function upsert(presets: UserPreset[], incoming: UserPreset): UserPreset[] {
  const name = normaliseName(incoming.name);
  const next = presets.filter((p) => !(p.drum === incoming.drum && p.name === name));
  return [...next, { ...incoming, name }];
}

export function remove(presets: UserPreset[], id: string): UserPreset[] {
  return presets.filter((p) => p.id !== id);
}

export function forDrum(presets: UserPreset[], drum: DrumId): UserPreset[] {
  return presets
    .filter((p) => p.drum === drum)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Merge an imported file into what is already saved, imports winning on a name clash. */
export function merge(existing: UserPreset[], imported: UserPreset[]): UserPreset[] {
  return imported.reduce(upsert, existing);
}

export function createPreset(input: {
  name: string;
  drum: DrumId;
  basePresetId: string;
  values: Record<string, number>;
  /** Injected so tests do not depend on the clock or on crypto being present. */
  id?: string;
  savedAt?: string;
}): UserPreset {
  return {
    id: input.id ?? newId(),
    name: normaliseName(input.name),
    drum: input.drum,
    basePresetId: input.basePresetId,
    values: { ...input.values },
    savedAt: input.savedAt ?? new Date().toISOString(),
  };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// --- The two impure functions. Both survive a browser that refuses storage. ---

export function load(): UserPreset[] {
  try {
    return parsePresetFile(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private-mode browsers throw on localStorage. An empty list is correct.
    return [];
  }
}

/** Returns false when the browser refused to store, so the UI can say so. */
export function save(presets: UserPreset[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, serialisePresetFile(presets));
    return true;
  } catch {
    return false;
  }
}
