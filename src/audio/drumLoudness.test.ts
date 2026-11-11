// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// The drum loudness numbers shared with the phone (owner decision 2026-10-29):
// -16 LUFS, -1 dBTP, one JSON for both sides, one limiter function for both
// sides, and the search for the gain through the limiter.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FAMILY_LOUDNESS, measureShortSoundLoudness } from '@otoinki/loudness';
import {
  DRUM_LOUDNESS,
  PEAK_LIMITER,
  limitedGainDb,
  peakLimiterCurve,
  softPeakLimit,
  type RenderedHit,
} from './drumLoudness';
import shared from './drumLoudness.json';

const require = createRequire(import.meta.url);
const DRUM_DSP_PATH = fileURLToPath(new URL('../../../beatbayashi-mobile/scripts/drum-dsp.js', import.meta.url));

describe('DRUM_LOUDNESS', () => {
  it('is -16 LUFS and -1 dBTP, from the JSON the phone reads', () => {
    expect(DRUM_LOUDNESS.targetLufs).toBe(-16);
    expect(DRUM_LOUDNESS.ceilingDbtp).toBe(-1);
    expect(DRUM_LOUDNESS.targetLufs).toBe(shared.targetLufs);
    expect(DRUM_LOUDNESS.ceilingDbtp).toBe(shared.ceilingDbtp);
  });

  it('keeps the family package untouched and its master settings', () => {
    expect(FAMILY_LOUDNESS.targetLufs).toBe(-24);
    expect(DRUM_LOUDNESS.defaultMasterDb).toBe(FAMILY_LOUDNESS.defaultMasterDb);
    expect(DRUM_LOUDNESS.masterRangeDb).toEqual(FAMILY_LOUDNESS.masterRangeDb);
  });
});

describe('softPeakLimit', () => {
  it('leaves everything under the threshold alone, is odd-symmetric and monotone, and stays under the ceiling', () => {
    expect(softPeakLimit(0.2)).toBe(0.2);
    expect(softPeakLimit(-PEAK_LIMITER.threshold)).toBe(-PEAK_LIMITER.threshold);
    let last = 0;
    for (let x = 0; x <= 12; x += 0.01) {
      const y = softPeakLimit(x);
      expect(y).toBeGreaterThanOrEqual(last);
      expect(y).toBeLessThan(PEAK_LIMITER.limit + 1e-12);
      expect(softPeakLimit(-x)).toBe(-y);
      last = y;
    }
  });

  // The phone app is not in the public copy of the repository, so this one is skipped there.
  it.skipIf(!existsSync(DRUM_DSP_PATH))('is the same function as the phone generator (drum-dsp.js) for the same numbers', () => {
    const dsp = require(DRUM_DSP_PATH);
    for (let x = -6; x <= 6; x += 0.037) {
      expect(dsp.softPeakLimit(x, PEAK_LIMITER.threshold, PEAK_LIMITER.limit)).toBe(softPeakLimit(x));
    }
  });

  it('the WaveShaper curve is the function over [-domain, domain]', () => {
    const curve = peakLimiterCurve();
    expect(curve.length).toBe(8193);
    for (const i of [0, 100, 2048, 4096, 5000, 8192]) {
      const x = ((2 * i) / (curve.length - 1) - 1) * PEAK_LIMITER.domain;
      expect(curve[i]).toBeCloseTo(softPeakLimit(x), 6);
    }
    expect(curve[4096]).toBe(0);
  });
});

describe('limitedGainDb', () => {
  // A spiky, noise-like hit: a decaying noise bed with a few tall heads.
  function spikyHit(sampleRate: number): RenderedHit {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    const n = Math.round(0.3 * sampleRate);
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = rnd() * Math.exp(-i / (0.05 * sampleRate)) * 0.1;
    for (let i = 0; i < 12; i++) ch[100 + i * 37] = 0.9 * (i % 2 ? 1 : -1);
    return { sampleRate, channels: [ch, new Float32Array(n)] };
  }

  it('brings a spiky hit to the target through the limiter, within the bounded push, without passing the ceiling', () => {
    const hit = spikyHit(44100);
    const plain = measureShortSoundLoudness(hit.channels, hit.sampleRate, 2);
    const startDb = Math.min(DRUM_LOUDNESS.targetLufs - plain.integratedLufs, DRUM_LOUDNESS.ceilingDbtp - plain.truePeakDbfs);
    const db = limitedGainDb([hit], startDb, plain.truePeakDbfs);
    expect(db).toBeGreaterThan(startDb);
    expect(db).toBeLessThanOrEqual(DRUM_LOUDNESS.ceilingDbtp + PEAK_LIMITER.maxOverCeilingDb - plain.truePeakDbfs + 1e-9);
    const g = Math.pow(10, db / 20);
    const limited = hit.channels.map((c) => Float32Array.from(c, (x) => softPeakLimit(x * g)));
    const m = measureShortSoundLoudness(limited, hit.sampleRate, 2);
    expect(m.truePeakDbfs).toBeLessThanOrEqual(DRUM_LOUDNESS.ceilingDbtp + 0.05);
    // Reached the target, or stopped at the bounded push.
    const atCap = Math.abs(db - (DRUM_LOUDNESS.ceilingDbtp + PEAK_LIMITER.maxOverCeilingDb - plain.truePeakDbfs)) < 1e-6;
    if (!atCap) expect(Math.abs(m.integratedLufs - DRUM_LOUDNESS.targetLufs)).toBeLessThan(0.05);
  });

  it('gives the same answer on every call', () => {
    const hit = spikyHit(44100);
    expect(limitedGainDb([hit], 3, -8)).toBe(limitedGainDb([hit], 3, -8));
  });
});
