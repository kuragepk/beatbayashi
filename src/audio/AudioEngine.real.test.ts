// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// ISSUE-BEATBOX-014's scope calls for one test that does NOT fake Tone.js -
// every other AudioEngine test in this directory replaces Tone's classes
// with spy-tracking fakes (see AudioEngine.test.ts's own header comment),
// which is exactly how the frequency and resonance-range bugs this issue
// fixes shipped invisibly through 149 green tests: a fake MetalSynth doesn't
// care whether `frequency` was ever assigned, and a fake PluckSynth doesn't
// throw a RangeError the way the real Tone.js one does outside 0..1.
//
// This file imports the real `tone` package (no vi.mock) and renders through
// Tone.Offline, so it can only run wherever a real OfflineAudioContext
// exists. vitest's configured `environment: 'node'` (vitest.config.ts) does
// not provide one - confirmed by running this file directly: Tone.Offline
// throws "Missing the native OfflineAudioContext constructor" from
// standardized-audio-context, before either assertion below is reached.
// jsdom does not add one either (jsdom has no Web Audio API at all). Per the
// issue's own instruction, the test stays (documents what a real render must
// satisfy) but is skipped rather than failed when no OfflineAudioContext is
// present, and this repo's docs/HOW_TO_VERIFY.md says so under "what cannot
// be checked yet": these two claims are real-browser-only.
import { describe, expect, it } from 'vitest';
import * as Tone from 'tone';
import { measureShortSoundLoudness } from '@otoinki/loudness';
import { DRUM_LOUDNESS } from './drumLoudness';
import { measureNormalizationGain } from './AudioEngine';
import { CymbalSynth } from './CymbalSynth';
import { CYMBAL_TARGETS } from './cymbalTargets';
import { getPreset } from './synthPresets';
import { analyse } from '../../tools/sound-lab/analysis';

const hasOfflineAudioContext = typeof OfflineAudioContext !== 'undefined';

describe.skipIf(!hasOfflineAudioContext)(
  'real Tone.js render (ISSUE-BEATBOX-014) - browser only, see file header',
  () => {
    it('a metal preset with its frequency assigned renders an audible (RMS > 0) crash hit', async () => {
      const buffer = await Tone.Offline(() => {
        // Mirrors createInstrument()'s metal case in AudioEngine.ts: build,
        // then assign frequency, since the constructor option is ignored.
        const synth = new Tone.MetalSynth({
          envelope: { attack: 0.0008, decay: 1.2, release: 0.64 },
          harmonicity: 9,
          modulationIndex: 56,
          resonance: 9000,
          octaves: 2.1,
        }).toDestination();
        synth.frequency.value = 320; // metal_crash's preset frequency
        synth.triggerAttackRelease('2n', 0.005);
      }, 1);

      const data = buffer.getChannelData(0);
      let sumSquares = 0;
      for (const sample of data) sumSquares += sample * sample;
      const rms = Math.sqrt(sumSquares / data.length);

      expect(rms).toBeGreaterThan(0);
    });

    it('Wood Block resonance at 0.9 (top of the corrected 0..1 range) builds and triggers without throwing', async () => {
      await expect(
        Tone.Offline(() => {
          const pluck = new Tone.PluckSynth({
            attackNoise: 2.4,
            dampening: 3500,
            resonance: 0.9,
          }).toDestination();
          pluck.triggerAttack('C5', 0.005);
        }, 0.5)
      ).resolves.toBeDefined();
    });

    // Owner decision 2026-09-27/28: per-sound loudness normalisation via the
    // shared @otoinki/loudness part. Same browser-only limitation as the two
    // tests above (needs a real OfflineAudioContext) -- skipped rather than
    // failed outside a browser, per this file's header.
    it('a quiet and a loud rendering of the same preset both normalise within 0.5 LU of DRUM_LOUDNESS.targetLufs, never exceeding the ceiling', async () => {
      // 'membrane_808' is a real registered kick preset (synthPresets.ts);
      // measureNormalizationGain only uses its `type`/`trigger` from the
      // preset lookup, actual synth params (including `volume`, here pushed
      // apart to fake "quiet" vs "loud") are the ones passed in, exactly like
      // buildLayer's own resolveParams(preset, overrides) does.
      const quietParams = { pitchDecay: 0.04, octaves: 10, envelope: { attack: 0.0008, decay: 0.4, sustain: 0 }, volume: -30 };
      const loudParams = { pitchDecay: 0.04, octaves: 10, envelope: { attack: 0.0008, decay: 0.4, sustain: 0 }, volume: 6 };

      const quietGain = await measureNormalizationGain('kick', 'membrane_808', quietParams);
      const loudGain = await measureNormalizationGain('kick', 'membrane_808', loudParams);

      // Re-render each at its measured gain and check where it actually lands
      // (measureNormalizationGain itself only returns a number; this
      // independently verifies what applying that gain does, the same way
      // buildLayer's normGain node would).
      // Rendered through a Tone.Panner like buildLayer's chain (normGain ->
      // panner): 2026-10-01 the normalisation was found measured without it,
      // landing every lane 3.01 dB under the target at centre pan.
      async function renderNormalized(params: Record<string, unknown>, gain: number, pan = 0) {
        const buffer = await Tone.Offline(() => {
          const synth = new Tone.MembraneSynth(params);
          const g = new Tone.Gain(gain);
          const panner = new Tone.Panner(pan).toDestination();
          synth.connect(g);
          g.connect(panner);
          synth.triggerAttackRelease('C1', '8n', 0.005);
        }, 1);
        // Measure every channel, as played. Tone's destination is stereo, so a
        // mono source comes out dual-mono; measuring only channel 0 as mono
        // reads 3 LU low (checked in Chromium 2026-09-28: -27.01 mono vs
        // -24.00 as two channels, the latter matching the then target of -24).
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
        // One isolated hit: measured the way measureNormalizationGain
        // measures it (short-sound meter, @otoinki/loudness 0.5.0).
        return measureShortSoundLoudness(channels, buffer.sampleRate, channels.length);
      }

      const quietMeasured = await renderNormalized(quietParams, quietGain);
      const loudMeasured = await renderNormalized(loudParams, loudGain);

      expect(Math.abs(quietMeasured.integratedLufs - DRUM_LOUDNESS.targetLufs)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(loudMeasured.integratedLufs - DRUM_LOUDNESS.targetLufs)).toBeLessThanOrEqual(0.5);
      expect(quietMeasured.truePeakDbfs).toBeLessThanOrEqual(DRUM_LOUDNESS.ceilingDbtp + 1e-6);
      expect(loudMeasured.truePeakDbfs).toBeLessThanOrEqual(DRUM_LOUDNESS.ceilingDbtp + 1e-6);

      // Equal-power pan law: the same loudness at every pan, and the
      // ceiling holds even at hard pan (the worst case for peak).
      for (const pan of [-1, -0.5, 0.5, 1]) {
        const panned = await renderNormalized(loudParams, loudGain, pan);
        expect(Math.abs(panned.integratedLufs - loudMeasured.integratedLufs)).toBeLessThanOrEqual(0.5);
        expect(panned.truePeakDbfs).toBeLessThanOrEqual(DRUM_LOUDNESS.ceilingDbtp + 1e-6);
      }
    });

    it('caches the measured gain: a second call for the same preset+params returns the same value without re-rendering', async () => {
      const params = { pitchDecay: 0.025, octaves: 6, envelope: { attack: 0.0008, decay: 0.25, sustain: 0 } };
      const first = await measureNormalizationGain('kick', 'membrane_909', params);
      const second = await measureNormalizationGain('kick', 'membrane_909', params);
      expect(second).toBe(first);
    });
  }
);

describe.skipIf(!hasOfflineAudioContext)(
  'real cymbal render against cymbalTargets.ts (2026-10-27) - browser only, see file header',
  () => {
    // The same numbers the offline lab (tools/sound-lab) reports: decay to
    // -20 / -40 dB, share of power under 2 kHz and over 6 kHz, centroid.
    // Before the retune (Tone.MetalSynth) every preset had 0% under 2 kHz and
    // a centroid of 12.9-17 kHz.
    it.each(Object.keys(CYMBAL_TARGETS))('%s renders with decay and low-mid body above the floors', async (id) => {
      const t = CYMBAL_TARGETS[id];
      const params = getPreset('cymbal', id)!.params;
      const buffer = await Tone.Offline(() => {
        const voice = new CymbalSynth(params).connect(Tone.getDestination());
        voice.trigger(0.01, 1);
      }, 3);
      const m = analyse({ sampleRate: buffer.sampleRate, channels: [buffer.getChannelData(0)] });
      expect(m.decay20).toBeGreaterThanOrEqual(t.minDecay20);
      expect(m.decay40).toBeGreaterThanOrEqual(t.minDecay40);
      expect(m.pctBelow2k).toBeGreaterThanOrEqual(t.minPctBelow2k);
      expect(m.pctAbove6k).toBeLessThanOrEqual(t.maxPctAbove6k);
      expect(m.centroidHz).toBeLessThanOrEqual(t.maxCentroidHz);
    });
  }
);
