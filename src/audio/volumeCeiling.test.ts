// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Owner request 2026-10-05: volume up to 120% "as far as it stays clean".
// The guarantee comes from the shared @otoinki/loudness master bus: a hard-knee
// limiter at FAMILY_LOUDNESS.ceilingDbtp followed by a hard clipper
// (WaveShaperNode, ceilingClipCurve) at the same ceiling.
//
// Two checks:
// 1. node (always runs): the clipper curve, evaluated the way the Web Audio
//    spec's WaveShaper does (linear interpolation over [-1, 1], end values
//    beyond), never lets a sample above the ceiling through, for a signal
//    driven well past the loudest preset measured at 120%.
// 2. offline render (browser only, skipped where no OfflineAudioContext
//    exists, like AudioEngine.real.test.ts): the real bus at 120% (MAX_MASTER_DB)
//    with an input hotter than the loudest preset; no output sample exceeds
//    the ceiling.
//
// Measured 2026-10-05 in headless Chromium through the live engine chain
// (see the commit message): the loudest preset at 100% peaked at -3.25 dBFS
// before this change's +6 dB, i.e. about +2.75 dBFS into the bus at 100% and
// +4.33 dBFS at 120%. The test inputs below use +6 dBFS to leave margin.
import { describe, expect, it } from 'vitest';
import {
  FAMILY_LOUDNESS,
  ceilingClipCurve,
  createMasterBus,
  dbToLinear,
  type MinimalAudioContext,
} from '@otoinki/loudness';
import { MAX_MASTER_DB } from '../store/masterVolume';

const CEILING = dbToLinear(FAMILY_LOUDNESS.ceilingDbtp);
const HOT_INPUT_DBFS = 6;

/** WaveShaper transfer per the Web Audio spec: position (len-1)*(x+1)/2,
 *  linear interpolation, end values outside [-1, 1]. */
function shape(curve: Float32Array, x: number): number {
  const n = curve.length;
  const v = ((n - 1) * (x + 1)) / 2;
  if (v <= 0) return curve[0];
  if (v >= n - 1) return curve[n - 1];
  const k = Math.floor(v);
  const f = v - k;
  return (1 - f) * curve[k] + f * curve[k + 1];
}

describe('120% stays at or below the ceiling', () => {
  it('the bus ceiling clipper bounds every sample of a signal driven past the loudest preset at 120%', () => {
    const curve = ceilingClipCurve();
    const gain = dbToLinear(MAX_MASTER_DB) * dbToLinear(HOT_INPUT_DBFS);
    let peak = 0;
    for (let i = 0; i < 48000; i++) {
      const t = i / 48000;
      // A dense mix: kick-like low sine plus a bright partial plus a click.
      const x = 0.6 * Math.sin(2 * Math.PI * 55 * t) + 0.3 * Math.sin(2 * Math.PI * 3150 * t) + (i % 4800 === 0 ? 0.4 : 0);
      peak = Math.max(peak, Math.abs(shape(curve, x * gain)));
    }
    expect(peak).toBeLessThanOrEqual(CEILING + 1e-6);
  });

  it.skipIf(typeof OfflineAudioContext === 'undefined')(
    'offline render through the real master bus at 120%: no sample above the ceiling (browser only)',
    async () => {
      const sampleRate = 48000;
      const ctx = new OfflineAudioContext(2, sampleRate * 2, sampleRate);
      const bus = createMasterBus(ctx as unknown as MinimalAudioContext, { defaultMasterDb: MAX_MASTER_DB });
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 55;
      const drive = ctx.createGain();
      drive.gain.value = dbToLinear(HOT_INPUT_DBFS);
      osc.connect(drive);
      drive.connect(bus.input as unknown as AudioNode);
      osc.start(0);
      const rendered = await ctx.startRendering();
      let peak = 0;
      for (let c = 0; c < rendered.numberOfChannels; c++) {
        for (const s of rendered.getChannelData(c)) peak = Math.max(peak, Math.abs(s));
      }
      expect(peak).toBeGreaterThan(0);
      expect(peak).toBeLessThanOrEqual(CEILING + 1e-6);
    },
  );
});
