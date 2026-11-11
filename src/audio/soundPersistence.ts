// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Saving and loading the per-lane sound document (presets, layers, sliders,
// lane effects) under LAYER_STORAGE_KEY. The engine builds and validates the
// document (AudioEngine.getSoundDocument / loadSoundDocument); this file only
// moves it in and out of localStorage and decides when to write.
//
// Every storage access is guarded: in private mode or with storage full,
// reading and writing fail quietly and the app carries on with defaults.

import type { AudioEngine } from './AudioEngine';
import { LAYER_STORAGE_KEY } from './soundStorageKey';

/** Wait this long after the last change before writing (same as the pattern
 *  autosave in sequencerStore.ts). */
export const SOUND_AUTOSAVE_DELAY_MS = 500;

/** What is stored, parsed but not yet validated; null when nothing usable is
 *  there (absent, unreadable, not JSON). The engine validates the content. */
export function readSoundDocument(): unknown {
  try {
    const raw = localStorage.getItem(LAYER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Writes the engine's current sound document. False if the write failed. */
export function writeSoundDocument(engine: Pick<AudioEngine, 'getSoundDocument'>): boolean {
  try {
    localStorage.setItem(LAYER_STORAGE_KEY, JSON.stringify(engine.getSoundDocument()));
    return true;
  } catch (error) {
    console.warn('Could not save the sound settings:', error);
    return false;
  }
}

export interface SoundAutosave {
  /** Writes now if a change is waiting. */
  flush(): void;
  /** Writes any waiting change, then stops listening. */
  stop(): void;
}

/** Saves the engine's sound document ~500 ms after its last change, and when
 *  the page is about to close (beforeunload, which on its own misses a crash
 *  or a killed tab). */
export function startSoundAutosave(
  engine: Pick<AudioEngine, 'getSoundDocument' | 'subscribeChange'>,
  delayMs = SOUND_AUTOSAVE_DELAY_MS
): SoundAutosave {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!dirty) return;
    dirty = false;
    writeSoundDocument(engine);
  };

  const unsubscribe = engine.subscribeChange(() => {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  });
  window.addEventListener('beforeunload', flush);

  return {
    flush,
    stop() {
      unsubscribe();
      window.removeEventListener('beforeunload', flush);
      flush();
    },
  };
}
