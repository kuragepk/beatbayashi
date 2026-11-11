// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// What the cymbal family must still be after the 2026-10-27 retune: the floors
// the owner's "too light" complaint is measured against. Shared by the unit
// test (CymbalSynth.test.ts, recipe level), the browser-only render test
// (AudioEngine.real.test.ts) and the offline lab (tools/sound-lab/lab.ts), so
// the three cannot drift apart.
//
// Before (measured 2026-10-27, headless Chromium, 44.1 kHz, Tone.MetalSynth):
//   every cymbal-family preset had 99% of its power above 6 kHz, 0% under
//   2 kHz, spectral centroid 12.9-17.0 kHz; crash decay -20 dB at 0.38 s,
//   -40 dB at 0.70 s; ride 0.28 / 0.50 s; open hat 0.17 / 0.27 s.
// After (same method): see docs/SOUND_DESIGN_20260924_genre_presets.md,
// "2026-10-27 cymbal retune". The floors below sit about 20% under the
// measured values so a different browser's resampling or the noise's random
// draw does not fail them, and far above the "before" numbers.

export interface CymbalTarget {
  /** Seconds from the loudest 5 ms window to the last one within 20 / 40 dB of it (floor). */
  minDecay20: number;
  minDecay40: number;
  /** Share of total power under 2 kHz, percent (floor); the "body". */
  minPctBelow2k: number;
  /** Share of total power above 6 kHz, percent (ceiling): not just hiss. */
  maxPctAbove6k: number;
  /** Spectral centroid, Hz (ceiling). */
  maxCentroidHz: number;
}

export const CYMBAL_TARGETS: Record<string, CymbalTarget> = {
  metal_closed: { minDecay20: 0.02, minDecay40: 0.04, minPctBelow2k: 4, maxPctAbove6k: 80, maxCentroidHz: 9000 },
  metal_open: { minDecay20: 0.15, minDecay40: 0.3, minPctBelow2k: 8, maxPctAbove6k: 75, maxCentroidHz: 8500 },
  metal_ride: { minDecay20: 0.35, minDecay40: 0.7, minPctBelow2k: 20, maxPctAbove6k: 55, maxCentroidHz: 6500 },
  metal_crash: { minDecay20: 0.5, minDecay40: 1.0, minPctBelow2k: 8, maxPctAbove6k: 65, maxCentroidHz: 7500 },
};
