// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// The drum sounds' loudness target, one place for web and phone (owner
// decision 2026-10-29: "make the web and the app sound the same through
// speakers and headphones"). The numbers live in drumLoudness.json, which the
// phone's generator reads too. FAMILY_LOUDNESS comes from the shared
// @otoinki/loudness package (targetLufs -24) and is not ours to edit, so the
// drum normalisation uses this copy with the target replaced and everything
// else (default master level, master range, ceiling) left as the family's.
//
// Also here: the soft peak limiter some voices run through, and the search for
// the gain that brings such a voice to the target through it. The phone's
// generator has the same function and the same search
// (beatbayashi-mobile/scripts/generate-drum-samples.js).
import { FAMILY_LOUDNESS, measureShortSoundLoudness } from '@otoinki/loudness';
import data from './drumLoudness.json';

export const DRUM_LOUDNESS = {
  ...FAMILY_LOUDNESS,
  targetLufs: data.targetLufs,
  ceilingDbtp: data.ceilingDbtp,
};

const dbToLinear = (db: number) => Math.pow(10, db / 20);

/** The limiter's numbers, linear: the knee starts at `threshold`, and `limit`
 *  (the true-peak ceiling) is what the output approaches and never reaches. */
export const PEAK_LIMITER = {
  threshold: dbToLinear(data.peakLimiter.thresholdDbfs),
  limit: dbToLinear(data.ceilingDbtp),
  maxOverCeilingDb: data.peakLimiter.maxOverCeilingDb,
  domain: data.peakLimiter.domainLinear,
};

/** Soft-knee peak shaper: identity up to `threshold`, then the excess is
 *  folded toward `limit` (tanh). Odd-symmetric, no memory. */
export function softPeakLimit(x: number, threshold = PEAK_LIMITER.threshold, limit = PEAK_LIMITER.limit): number {
  const a = Math.abs(x);
  if (a <= threshold) return x;
  return Math.sign(x) * (threshold + (limit - threshold) * Math.tanh((a - threshold) / (limit - threshold)));
}

/** The WaveShaper curve for softPeakLimit over [-domain, domain]; the shaper's
 *  input is scaled by 1 / domain, so its output is in true amplitude. */
export function peakLimiterCurve(points = 8193): Float32Array {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) curve[i] = softPeakLimit(((2 * i) / (points - 1) - 1) * PEAK_LIMITER.domain);
  return curve;
}

/** One hit's samples as rendered at unit gain (every channel). */
export interface RenderedHit {
  sampleRate: number;
  channels: Float32Array[];
}

/** A hit cut down to what the search needs: only the channels that carry
 *  sound (the measurement pans hard left, so the other is silent) and only up
 *  to the last sample above -60 dB of its peak. Leaves the loudness as it was
 *  (silent blocks are gated out anyway) and makes each pass about 10x cheaper,
 *  which matters: the search runs on the main thread when a sound is built. */
function activePart(hit: RenderedHit): RenderedHit {
  let peak = 0;
  for (const ch of hit.channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  const floor = peak * 1e-3;
  const channels = hit.channels.filter((ch) => ch.some((x) => Math.abs(x) > 0));
  let end = 0;
  for (const ch of channels) for (let i = ch.length - 1; i >= end; i--) if (Math.abs(ch[i]) > floor) { end = i + 1; break; }
  return { sampleRate: hit.sampleRate, channels: channels.map((ch) => ch.subarray(0, Math.max(end, 1))) };
}

/** Loudness of the hits (power mean, as combineHitMeasurements) after `gainDb`
 *  and the limiter. `subdivisions` is the short-sound meter's grid count (16 =
 *  the family default; fewer is cheaper and coarser, up to 0.26 LU at 4). */
function limitedLufs(hits: RenderedHit[], gainDb: number, subdivisions = 16): number {
  const g = dbToLinear(gainDb);
  let energy = 0;
  for (const hit of hits) {
    const limited = hit.channels.map((ch) => Float32Array.from(ch, (x) => softPeakLimit(x * g)));
    const m = measureShortSoundLoudness(limited, hit.sampleRate, limited.length, { subdivisions });
    if (Number.isFinite(m.integratedLufs)) energy += Math.pow(10, m.integratedLufs / 10);
  }
  return energy > 0 ? 10 * Math.log10(energy / hits.length) : -Infinity;
}

/**
 * The gain, dB, that brings a voice to the target through the peak limiter.
 * `startDb` is the plain gain (the smaller of "reaches the target" and "puts
 * the true peak at the ceiling", gainForTarget's answer) and `peakDbfs` the
 * voice's unit-gain true peak. The search goes up from `startDb` to at most
 * (ceiling + maxOverCeilingDb - peak): a bounded push, so the limiter shaves
 * heads and never flattens the sound. A coarse bisection (half the hits, 4
 * grids) finds the neighbourhood, then three corrections on all hits at the
 * full 16 grids settle it.
 */
export function limitedGainDb(rendered: RenderedHit[], startDb: number, peakDbfs: number, targetLufs = DRUM_LOUDNESS.targetLufs): number {
  const hits = rendered.map(activePart);
  const maxDb = Math.max(startDb, DRUM_LOUDNESS.ceilingDbtp + PEAK_LIMITER.maxOverCeilingDb - peakDbfs);
  if (limitedLufs(hits, maxDb) <= targetLufs) return maxDb;
  // The coarse pass takes every other hit (they sit evenly across the render
  // quantum, so half of them still span it).
  const coarse = hits.length > 4 ? hits.filter((_, i) => i % 2 === 0) : hits;
  let lo = startDb;
  let hi = maxDb;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (limitedLufs(coarse, mid, 4) < targetLufs) lo = mid;
    else hi = mid;
  }
  let db = (lo + hi) / 2;
  for (let i = 0; i < 3; i++) {
    db = Math.min(maxDb, Math.max(startDb, db + (targetLufs - limitedLufs(hits, db))));
  }
  return db;
}
