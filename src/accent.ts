// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Per-step accent (P2-16). A leaf module with no dependencies on the store or
// the audio engine, so both can import it without either depending on the
// other.

/** 0 = weak, 1 = mid, 2 = strong. */
export type Accent = 0 | 1 | 2;

export const DEFAULT_ACCENT: Accent = 1;

export const ACCENT_LABELS: Record<Accent, string> = {
  0: 'weak',
  1: 'mid',
  2: 'strong',
};

/** Tone.js instrument velocity (0..1) for each accent level. */
export const ACCENT_VELOCITY: Record<Accent, number> = {
  0: 0.55,
  1: 0.85,
  2: 1.0,
};

/** MIDI velocity (0..127) for each accent level, for the .mid export. */
export const ACCENT_MIDI_VELOCITY: Record<Accent, number> = {
  0: 70,
  1: 100,
  2: 127,
};
