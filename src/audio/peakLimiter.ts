// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// The live node for the soft peak limiter (see drumLoudness.ts): input gain
// 1 / domain into a WaveShaper whose curve is softPeakLimit over that domain.
// Not oversampled on purpose: 4x oversampling measured +0.1..+0.8 dBTP out of
// a limiter whose samples never pass -1 dBFS (the resampling filter rings on
// the folded heads), which would break the -1 dBTP ceiling; the phone's WAVs
// are made without oversampling too, so both sides are the same. Sits right after a layer's
// normGain, before its panner, for presets marked `peakLimit`.
import * as Tone from 'tone';
import { PEAK_LIMITER, peakLimiterCurve } from './drumLoudness';

export class PeakLimiterNode {
  readonly input: Tone.Gain;
  readonly output: Tone.WaveShaper;

  constructor() {
    this.input = new Tone.Gain(1 / PEAK_LIMITER.domain);
    // Mono in, like the Tone.Panner after it (which pins channelCount 1,
    // explicit): a stereo source (Tone's noise is two decorrelated channels) is
    // averaged to mono BEFORE the limiter, so the limiter sees the same signal
    // the loudness measurement does. Measured 2026-10-29: limiting the two
    // channels apart and averaging after left noise_clap 1.7 LU under the
    // search's prediction.
    const node = this.input.input as unknown as GainNode;
    node.channelCount = 1;
    node.channelCountMode = 'explicit';
    this.output = new Tone.WaveShaper(peakLimiterCurve());
    this.input.connect(this.output);
  }

  dispose(): void {
    this.input.dispose();
    this.output.dispose();
  }
}
