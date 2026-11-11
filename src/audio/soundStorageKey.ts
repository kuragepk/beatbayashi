// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

/** localStorage key of the per-lane sound document (presets, layers, sliders,
 *  lane effects). Kept in its own tiny module so soundPersistence.ts can use
 *  it without importing the whole AudioEngine (and Tone.js) just for a
 *  string; AudioEngine.ts re-exports it under its old name.
 *
 *  Same key as the earlier unused `getAllLayers()` slot ("v2" is the key's
 *  generation, not the document's: the document carries its own `version`,
 *  see SOUND_DOCUMENT_VERSION in AudioEngine.ts). */
export const LAYER_STORAGE_KEY = 'BeatBayashi.drumSettings.v2';
