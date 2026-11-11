// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import * as Tone from 'tone';
import {
  measureShortSoundLoudness,
  gainForTarget,
  type LoudnessMeasurement,
  createMasterBus,
  armCompressorColdStart,
  type AudioParamLike,
  type MasterBus,
  type MinimalAudioContext,
} from '@otoinki/loudness';
import { DRUM_LOUDNESS, limitedGainDb, type RenderedHit } from './drumLoudness';
import { PeakLimiterNode } from './peakLimiter';
import { renderOffline, withLiveContext } from '@otoinki/offline-render';
import { CymbalSynth } from './CymbalSynth';
import {
  SYNTH_PRESETS,
  DEFAULT_LAYERS,
  DEFAULT_LANES,
  cloneDefaultLayersFor,
  getPreset,
  getPresetDefaults,
  getPresetParameters,
  type DrumId,
  type Lane,
  type SynthConfig,
  type LayerConfig,
} from './synthPresets';
import { type Accent, ACCENT_VELOCITY, DEFAULT_ACCENT } from '../accent';
import type { LaneFx, SpaceSpec, BasisEntry } from './soundBasis';
import { isLaneAudible } from '../store/sequencerStore';
import { NORMAL_MASTER_DB, clampMasterDb } from '../store/masterVolume';

type DrumInstrument =
  | Tone.MembraneSynth
  | Tone.NoiseSynth
  | Tone.MetalSynth
  | CymbalSynth
  | Tone.FMSynth
  | Tone.AMSynth
  | Tone.MonoSynth
  | Tone.DuoSynth
  | Tone.Synth
  | Tone.PluckSynth;

/** Every Tone.Offline call in this module goes through @otoinki/offline-render:
 *  one render at a time, and the live context is put back right after the
 *  callback has run up to its first await -- see that package's README. */
function runOffline(
  callback: () => void | Promise<void>,
  duration: number
): Promise<Tone.ToneAudioBuffer> {
  return renderOffline(Tone, callback, duration);
}

/** Params the settings panel owns; everything else comes from the preset. */
const ENVELOPE_KEYS = ['attack', 'decay', 'release'];

/**
 * When an offline render triggers its one hit.
 *
 * Not zero: MetalSynth renders silence when triggered at exactly the start of
 * an offline context, which is how the cymbal came out of the SFZ export as an
 * empty file. playDrum nudges past "now" for the same family of reasons. 5ms
 * is inaudible ahead of a drum hit and is trimmed off the sample anyway.
 */
const OFFLINE_TRIGGER_AT = 0.005;

/**
 * Instruments per lane in an offline render.
 *
 * Four means a hit only shares an instrument with the fourth hit after it, far
 * enough apart for any of these drums to have finished ringing.
 */
const VOICES_PER_LANE = 4;

/** Raw audio, as src/export/wav.ts wants it. */
export interface RenderedAudio {
  sampleRate: number;
  channels: Float32Array[];
}

/**
 * Take the rendered buffer's channels, minus the lead-in.
 *
 * Everything is triggered OFFLINE_TRIGGER_AT into the render (plus, for an
 * export, EXPORT_PREROLL_SECONDS), so the file would otherwise start with
 * silence - latency on every note of a sampled one-shot.
 */
function trimmed(
  buffer: Tone.ToneAudioBuffer,
  leadInSeconds = OFFLINE_TRIGGER_AT
): RenderedAudio | null {
  const leadIn = Math.round(leadInSeconds * buffer.sampleRate);
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    channels.push(buffer.getChannelData(channel).slice(leadIn));
  }
  return channels.length > 0 ? { sampleRate: buffer.sampleRate, channels } : null;
}

/**
 * Build a Tone instrument for a preset type.
 *
 * Module-level because the offline render needs the same instrument in a
 * different audio context: two copies of this switch would be two sounds.
 */
function createInstrument(
  type: SynthConfig['type'],
  params: Record<string, unknown>
): DrumInstrument | null {
  switch (type) {
    case 'membrane':
      return new Tone.MembraneSynth(params);
    case 'noise':
      return new Tone.NoiseSynth(params);
    case 'metal': {
      // ISSUE-BEATBOX-014 (audit finding 1): tone 14.9.17's MetalSynth
      // constructor builds `frequency` as a bare Signal and never reads a
      // `frequency` option out of `params` (MetalSynth.js:41-44; passing it
      // in the constructor is also a TS2353 excess-property error). Every
      // metal preset (hats/ride/crash/rimshot) tunes itself entirely through
      // this field, so without the explicit assignment below all five play
      // at Tone's default Signal value of 0 Hz instead of the preset's
      // frequency.
      const metal = new Tone.MetalSynth(params);
      const frequency = params.frequency;
      if (typeof frequency === 'number') {
        metal.frequency.value = frequency;
      }
      return metal;
    }
    case 'cymbal':
      // The cymbal family's own voice (CymbalSynth.ts); it reads `frequency`
      // from params itself, so no assignment after construction is needed.
      return new CymbalSynth(params);
    case 'fm':
      return new Tone.FMSynth(params);
    case 'am':
      return new Tone.AMSynth(params);
    case 'mono':
      return new Tone.MonoSynth(params);
    case 'duo':
      return new Tone.DuoSynth(params);
    case 'synth':
      return new Tone.Synth(params);
    case 'pluck':
      return new Tone.PluckSynth(params);
    default:
      return null;
  }
}

/**
 * Triggers one already-built instrument for one hit, at a specific time.
 *
 * Module-level, and shared by every place that fires a voice (live, offline
 * pattern render, offline one-shot render), so this arg-shape decision is
 * made in exactly one place. NoiseSynth's triggerAttackRelease takes
 * (duration, time, velocity); every other instrument type inherits
 * (note, duration, time, velocity) — including the percussive ones (metal,
 * the cymbal family) that have no musical note and tune themselves once via
 * `frequency` at build time instead. Branching on "does this preset have a
 * note" instead of "is this a NoiseSynth" used to send those a 2-argument
 * call, which silently shifted duration into the note slot and dropped time
 * — the instrument then triggered at "now" (live) or the render's start
 * (offline) instead of the time this call was actually given.
 */
function triggerVoiceAt(
  instrument: DrumInstrument,
  preset: SynthConfig,
  time: number,
  velocity = 1
): void {
  const { note, duration } = preset.trigger;
  if (preset.type === 'noise') {
    (instrument as Tone.NoiseSynth).triggerAttackRelease(duration, time, velocity);
    return;
  }
  if (preset.type === 'pluck') {
    // ISSUE-BEATBOX-014 (audit finding 7): PluckSynth.triggerAttack(note,
    // time) takes no velocity argument at all (PluckSynth.js) - Karplus-
    // Strong has no amplitude parameter to feed one. The accent is applied
    // one layer up instead (buildLayer's per-hit gain, see playDrumAt).
    (instrument as Tone.PluckSynth).triggerAttack(note ?? 'C5', time);
    return;
  }
  // The metal (cymbal) family has no musical note - it's tuned once via
  // `frequency` at build time (createInstrument's metal case) - but every
  // Tone instrument here, metal included, still inherits the 4-argument
  // triggerAttackRelease(note, duration, time, velocity), and Monophonic's
  // triggerAttack calls setNote(note) on every hit. No metal preset defines
  // trigger.note, so a fixed 'C1' fallback retuned every hat/ride/crash/rim
  // to 32.7 Hz on each hit, discarding the preset frequency. Pass the
  // instrument's own build-time frequency back instead so setNote is a no-op.
  if (preset.type === 'cymbal') {
    // Rings out for its own `decay`; the step length does not cut it.
    (instrument as CymbalSynth).trigger(time, velocity);
    return;
  }
  if (preset.type === 'metal' && note === undefined) {
    const metal = instrument as Tone.MetalSynth;
    metal.triggerAttackRelease(metal.frequency.value, duration, time, velocity);
    return;
  }
  (instrument as Tone.MembraneSynth).triggerAttackRelease(note ?? 'C1', duration, time, velocity);
}

/** Merge preset params with saved slider overrides. Envelope settings merge
 *  into the preset's own envelope rather than replacing it wholesale. */
function resolveParams(
  preset: SynthConfig,
  overrides: Record<string, number>
): Record<string, unknown> {
  const params: Record<string, unknown> = JSON.parse(JSON.stringify(preset.params));
  Object.entries(overrides).forEach(([key, value]) => {
    if (ENVELOPE_KEYS.includes(key)) {
      const envelope = (params.envelope ?? {}) as Record<string, unknown>;
      params.envelope = { ...envelope, [key]: value };
    } else {
      params[key] = value;
    }
  });
  return params;
}

/** Preset lookup + override merge + synth construction, in one place, so live
 *  playback and the offline renderers build the same sound. Logs and returns
 *  null on an unknown preset or synth type. */
function buildInstrument(
  drum: DrumId,
  presetId: string,
  overrides: Record<string, number>
): DrumInstrument | null {
  const preset = getPreset(drum, presetId);
  if (!preset) {
    console.error(`Unknown preset: ${drum}/${presetId}`);
    return null;
  }
  const instrument = createInstrument(preset.type, resolveParams(preset, overrides));
  if (!instrument) {
    console.error(`Unhandled synth type: ${preset.type}`);
  }
  return instrument;
}

/** Offline copy of one layer's live chain (panner -> gain -> delay), so a
 *  render sounds like playback did. Returns the node instruments feed. */
function offlineLayerChain(layer: LayerConfig, out: Tone.ToneAudioNode): Tone.ToneAudioNode {
  const panner = new Tone.Panner(layer.pan);
  const gain = new Tone.Gain(layer.gainDb, 'decibels');
  const delay = new Tone.FeedbackDelay(layer.delay.timeMs / 1000, layer.delay.feedback);
  delay.wet.value = layer.delay.enabled ? layer.delay.wet : 0;
  panner.connect(gain);
  gain.connect(delay);
  delay.connect(out);
  return panner;
}

/** Neutral space until a sound basis is applied: a short tail, lows cut. */
const DEFAULT_SPACE: Pick<
  SpaceSpec,
  'reverbDecay' | 'preDelay' | 'delayTime' | 'delayFeedback' | 'returnHighpassHz'
> = {
  reverbDecay: 1,
  preDelay: 0.02,
  delayTime: '8n',
  delayFeedback: 0.2,
  returnHighpassHz: 300,
};

export type SpaceSettings = typeof DEFAULT_SPACE;

/** A note value ("8n", "8n." dotted, ...) in seconds at `bpm`. Computed here
 *  rather than handed to Tone as a string: Tone converts a string against its
 *  own Transport tempo at construction, and an offline render's Transport is
 *  always at its default 120 BPM, not the pattern's tempo. */
export function noteValueSeconds(value: SpaceSettings['delayTime'], bpm: number): number {
  const quarter = 60 / clampFinite(bpm, 20, 1000, 120);
  const dotted = value.endsWith('.');
  const division = Number(value.replace(/n\.?$/, ''));
  const seconds = quarter * (4 / division) * (dotted ? 1.5 : 1);
  // FeedbackDelay's default maxDelay is 1 s.
  return Math.min(1, seconds);
}

/** Upper bound on a lane's reverb/delay send, so a send can never be louder
 *  than the lane's own dry signal. */
export const MAX_SEND = 0.8;

/** The shared space: send -> high-pass -> Reverb / FeedbackDelay -> out.
 *  The high-pass sits before both effects so kick and sub never reach them
 *  (design doc §4). Module-level so live playback and the offline renders
 *  build the same thing. */
interface SharedSpace {
  reverbIn: Tone.Filter;
  reverb: Tone.Reverb;
  delayIn: Tone.Filter;
  delay: Tone.FeedbackDelay;
}

function buildSharedSpace(
  space: SpaceSettings,
  out: Tone.ToneAudioNode,
  bpm: number
): SharedSpace {
  const highpass = () =>
    new Tone.Filter({
      type: 'highpass',
      frequency: clampFinite(space.returnHighpassHz, 20, 2000, 300),
      rolloff: -24,
    });
  const reverbIn = highpass();
  const reverb = new Tone.Reverb({
    decay: clampFinite(space.reverbDecay, 0.1, 8, 1),
    preDelay: clampFinite(space.preDelay, 0, 0.2, 0.02),
    wet: 1,
  });
  reverbIn.connect(reverb);
  reverb.connect(out);

  const delayIn = highpass();
  const delay = new Tone.FeedbackDelay(
    noteValueSeconds(space.delayTime, bpm),
    clampFinite(space.delayFeedback, 0, 0.6, 0.2)
  );
  delay.wet.value = 1;
  delayIn.connect(delay);
  delay.connect(out);
  return { reverbIn, reverb, delayIn, delay };
}

function disposeSharedSpace(space: SharedSpace): void {
  space.reverbIn.dispose();
  space.reverb.dispose();
  space.delayIn.dispose();
  space.delay.dispose();
}

/** One lane's effect chain: input -> Filter -> Distortion -> dynamics ->
 *  out, with the dynamics stage's output also feeding the two shared sends.
 *  An effect the lane does not use is built neutral (distortion wet 0) or,
 *  for the filter, not built at all.
 *
 *  A lane without a filter setting gets no filter. It used to get a
 *  "wide open" Tone.Filter (lowpass 20 kHz, Q 1, -12 dB/oct), which is not
 *  flat: in headless Chromium at 44.1 kHz (2026-10-01) it made the metal
 *  presets 0.29-0.37 LU louder (metal_crash 0.31 LU quieter) than the
 *  per-sound normalisation had measured them, kick and tom unchanged (the
 *  biquad changes the top octave, where a cymbal has its energy).
 *
 *  The dynamics stage is the lane's Tone.Compressor only when it actually
 *  compresses (ratio > 1). A neutral compressor (ratio 1) is not built at
 *  all, because a DynamicsCompressorNode at ratio 1 is unity only once it
 *  has settled: headless Chromium (2026-10-01) measured its first hit 6.7 dB
 *  low cold and 0.38 dB low with the cold-start window, its later hits
 *  within 0.0001 dB (max sample difference 1.4e-5) -- knee 30 or 0 made no
 *  difference. In its place sits a plain delay of the compressor's fixed
 *  look-ahead, which is exactly unity (sample-identical) and keeps a neutral
 *  lane sample-aligned with a compressing one (see
 *  compressorLookaheadSeconds). */
interface LaneChain {
  /** Where the lane's bus (live) or layer chains (offline) connect: the
   *  filter, or the distortion when the lane has no filter. */
  input: Tone.ToneAudioNode;
  /** The lane's filter, or null when its settings have none. */
  filter: Tone.Filter | null;
  distortion: Tone.Distortion;
  /** The lane's compressor, or null when its settings are neutral. */
  compressor: Tone.Compressor | null;
  /** What sits after the distortion: the compressor, or the look-ahead
   *  alignment delay when the compressor is neutral. */
  dynamics: Tone.Compressor | Tone.Delay;
  /** The compressor's configured release, seconds -- kept because its
   *  `release` param reads 0 while a cold-start window is open. */
  compressorReleaseSeconds: number;
  reverbSend: Tone.Gain;
  delaySend: Tone.Gain;
}

/** The fixed look-ahead ("pre-delay") every Web Audio DynamicsCompressorNode
 *  applies: 6 ms in Chromium (DynamicsCompressorKernel's default pre-delay,
 *  whole frames), measured 2026-10-01 as 264 frames at 44.1 kHz. Firefox and
 *  WebKit ship the same kernel (not measured here). */
const COMPRESSOR_PRE_DELAY_SECONDS = 0.006;

/** The compressor look-ahead in whole frames at `sampleRate`, as seconds --
 *  whole frames so the alignment delay never interpolates between samples. */
export function compressorLookaheadSeconds(sampleRate: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return COMPRESSOR_PRE_DELAY_SECONDS;
  return Math.floor(COMPRESSOR_PRE_DELAY_SECONDS * sampleRate) / sampleRate;
}

/** True when the lane's compressor settings do not compress: ratio 1 (after
 *  the same clamp buildLaneChain applies), or no compressor at all. */
export function isNeutralCompressor(compressor: LaneFx['compressor']): boolean {
  return clampFinite(compressor?.ratio ?? 1, 1, 20, 1) <= 1;
}

function buildLaneChain(
  fx: LaneFx,
  out: Tone.ToneAudioNode,
  space: SharedSpace | null
): LaneChain {
  const filter = fx.filter
    ? new Tone.Filter({
        type: fx.filter.type,
        frequency: clampFinite(fx.filter.frequency, 20, 20000, 20000),
        Q: clampFinite(fx.filter.Q ?? 1, 0.1, 20, 1),
        rolloff: fx.filter.rolloff ?? -12,
      })
    : null;
  const distortion = new Tone.Distortion(clampFinite(fx.distortion?.amount ?? 0, 0, 1, 0));
  distortion.wet.value = clampFinite(fx.distortion?.wet ?? 0, 0, 1, 0);
  const compressorReleaseSeconds = clampFinite(fx.compressor?.release ?? 0.25, 0, 1, 0.25);
  const compressor = isNeutralCompressor(fx.compressor)
    ? null
    : new Tone.Compressor({
        threshold: clampFinite(fx.compressor?.threshold ?? 0, -60, 0, 0),
        ratio: clampFinite(fx.compressor?.ratio ?? 1, 1, 20, 1),
        attack: clampFinite(fx.compressor?.attack ?? 0.003, 0, 1, 0.003),
        release: compressorReleaseSeconds,
      });
  const dynamics: Tone.Compressor | Tone.Delay =
    compressor ??
    (() => {
      const lookahead = compressorLookaheadSeconds(Tone.getContext().sampleRate);
      return new Tone.Delay(lookahead, Math.max(lookahead, 0.01));
    })();
  const reverbSend = new Tone.Gain(clampFinite(fx.reverbSend ?? 0, 0, MAX_SEND, 0));
  const delaySend = new Tone.Gain(clampFinite(fx.delaySend ?? 0, 0, MAX_SEND, 0));

  filter?.connect(distortion);
  distortion.connect(dynamics);
  dynamics.connect(out);
  dynamics.connect(reverbSend);
  dynamics.connect(delaySend);
  if (space) {
    reverbSend.connect(space.reverbIn);
    delaySend.connect(space.delayIn);
  }
  return {
    input: filter ?? distortion,
    filter,
    distortion,
    compressor,
    dynamics,
    compressorReleaseSeconds,
    reverbSend,
    delaySend,
  };
}

/** Release of renderPattern's export limiter: Tone.Limiter's own value. */
const EXPORT_LIMITER_RELEASE_SECONDS = 0.01;

/**
 * Silence rendered before an export's first hit and trimmed off the output.
 *
 * The offline renders (renderPattern, renderOneShot) build fresh
 * compressors -- each compressing lane's, and renderPattern's limiter --
 * inside the OfflineContext, and a fresh DynamicsCompressorNode is cold: it
 * acts as if it starts out attenuating and recovers through its release, so the
 * first hit of a file came out quieter than the same hit later on. Half a
 * second of silence lets every compressor recover before anything sounds.
 * Measured 2026-10-01 in headless Chromium, first hit minus a hit 4 s later,
 * no other arming: with no pre-roll -0.9 dB (the limiter) to -2.4 dB (a
 * ratio-2 glue compressor); with 0.1 s within 0.2 dB except a neutral one
 * (-0.85 dB); with 0.5 s within 0.07 dB for all
 * of limiter, ratio 2/4/6/20 and release 0.01-1 s. Silence warmed them up
 * exactly as well as low-level pink noise did, so nothing but silence is
 * rendered there. This replaces arming the offline compressors with the
 * live cold-start window (release 0 for 0.5 s), which over-corrected a real
 * compressor: a ratio-6 compressor's first hit came out ~5 dB louder than
 * its later ones.
 */
export const EXPORT_PREROLL_SECONDS = 0.5;

/** When an export's (renderPattern / renderOneShot) first event sounds. */
const EXPORT_START = EXPORT_PREROLL_SECONDS + OFFLINE_TRIGGER_AT;

function disposeLaneChain(chain: LaneChain): void {
  chain.filter?.dispose();
  chain.distortion.dispose();
  chain.dynamics.dispose();
  chain.reverbSend.dispose();
  chain.delaySend.dispose();
}

function usesSpace(fx: LaneFx | undefined): boolean {
  return (fx?.reverbSend ?? 0) > 0 || (fx?.delaySend ?? 0) > 0;
}

/** ISSUE-LAYER-001 §6-Q2: at most 3 synths stacked per voice, at least 1
 *  (a voice can never go silent by running out of layers). */
export const MAX_LAYERS_PER_VOICE = 3;
export const MIN_LAYERS_PER_VOICE = 1;

/** The pre-layer format (`BeatBayashi.drumSettings`, owned and read/written
 *  by SettingsPanel.tsx) can't represent more than one preset per drum, so the
 *  layered shape needs a new key. SettingsPanel.tsx is frozen for this issue
 *  (ISSUE-LAYER-001 §8-a) and keeps using its own old key for its own
 *  layer-0-only reads/writes; this key is for whoever persists the full
 *  `VoiceLayers` state (LAYER-002) via getAllLayers()/loadAllLayers() below. */
export { LAYER_STORAGE_KEY } from './soundStorageKey';

/** Version of the persisted sound document (`getSoundDocument()`), stored in
 *  its `version` field. A document with another version is ignored, so the
 *  shape can change later without a stale save being mis-read. */
export const SOUND_DOCUMENT_VERSION = 1;

/** One lane's persisted sound: everything the player can change per lane that
 *  is not already part of the sequencer's own save. */
export interface SavedLaneSound {
  /** The lane's preset category. A saved lane whose category no longer
   *  matches the live lane of that id is dropped (the id was reused). */
  category: DrumId;
  layers: LayerConfig[];
  /** Layer 0's slider overrides, keyed by preset id. */
  mainSettings: Record<string, Record<string, number>>;
  /** Layers 1+ slider overrides, keyed by layer id. */
  layerSettings: Record<string, Record<string, number>>;
  fx: LaneFx;
}

export interface SavedSoundDocument {
  version: typeof SOUND_DOCUMENT_VERSION;
  lanes: Record<string, SavedLaneSound>;
}

/** One layer's live Tone.js node chain:
 *  instrument -> normGain (per-sound loudness normalisation, see
 *  measureNormalizationGain below) -> panner -> gain -> delay (parallel wet
 *  mix via Effect's own wet crossfade; wet=0 when the layer's delay is
 *  disabled) -> role bus. */
interface LayerVoice {
  layerId: string;
  instrument: DrumInstrument;
  /** Starts at unity and ramps to the measured normalisation gain once
   *  `measureNormalizationGain` resolves (owner decision 2026-09-27/28: wire
   *  the shared @otoinki/loudness part in) -- so a voice is never silent
   *  while its measurement is pending, just briefly at its own raw level. */
  normGain: Tone.Gain;
  /** Between normGain and panner, for presets marked `peakLimit` only. */
  limiter: PeakLimiterNode | null;
  panner: Tone.Panner;
  gain: Tone.Gain<'decibels'>;
  delay: Tone.FeedbackDelay;
}

/** Per-(category, presetId, resolved params) cache of the linear gain that
 *  brings that preset's own rendered loudness to FAMILY_LOUDNESS.targetLufs
 *  without crossing FAMILY_LOUDNESS.ceilingDbtp (owner decision 2026-09-27/28:
 *  every sound normalised to the shared family target, measured once). Two
 *  lanes playing the same preset+overrides share one cache entry. */
const loudnessGainCache = new Map<string, number>();

/** Version of the normalisation measurement, part of every cache key so a
 *  gain measured the old way is never reused after the method changes.
 *  v2 (2026-10-01): `measureShortSoundLoudness` (@otoinki/loudness 0.5.0)
 *  instead of `measureLoudness` -- the trimmed hit starts at about sample 0,
 *  where the plain meter under-counts the first 300 ms.
 *  v3 (2026-10-01): a metal preset is measured as the power mean of
 *  NORMALIZATION_HITS hits spread over one render quantum instead of a
 *  single hit (see normalizationTriggerTime); other types are unchanged. */
export const NORMALIZATION_CACHE_VERSION = 3;

export function loudnessCacheKey(
  category: DrumId,
  presetId: string,
  params: Record<string, unknown>
): string {
  return `v${NORMALIZATION_CACHE_VERSION}:${category}:${presetId}:${JSON.stringify(params)}`;
}

/**
 * The pan law of the panner every layer goes through (live and export):
 * Tone.Panner (tone 14.9) wraps a native StereoPannerNode and pins its
 * `channelCount` to 1 with `channelCountMode = "explicit"`, so its input is
 * always mono and the Web Audio API's mono equal-power law applies (W3C Web
 * Audio API, StereoPannerNode, "Panning Algorithm", mono input case,
 * https://www.w3.org/TR/webaudio/#stereopanner-algorithm):
 *
 *   x = (pan + 1) / 2;  gainL = cos(x * PI / 2);  gainR = sin(x * PI / 2)
 *
 * So centre pan is cos(PI/4) = 0.7071 (-3.01 dB) on each channel, and
 * gainL^2 + gainR^2 = 1 at every pan. BS.1770 loudness sums the channels'
 * (K-weighted) energy with weight 1 for L and R, so the panned loudness is
 * the mono source's own loudness at *every* pan position -- 3.01 dB below
 * the dual-mono level a bare mono instrument reaches when it is upmixed
 * straight into the stereo destination (which is what the normalisation
 * used to measure, 2026-10-01 finding). The per-channel peak is pan
 * dependent: max(gainL, gainR) peaks at 1 at |pan| = 1.
 */
export function stereoPannerGains(pan: number): { left: number; right: number } {
  const clamped = Math.min(1, Math.max(-1, pan));
  const x = (clamped + 1) / 2;
  return { left: Math.cos((x * Math.PI) / 2), right: Math.sin((x * Math.PI) / 2) };
}

/**
 * The pan the normalisation is measured at, through a real Tone.Panner (the
 * same node type as the layer's own). Any pan gives the same loudness (see
 * stereoPannerGains), so one measurement holds wherever the user moves the
 * pan and the cache needs no pan in its key. Hard left is chosen because it
 * is the worst case for the true-peak ceiling: gainL = cos(0) = 1, so the
 * measured peak is the highest any pan position can produce.
 */
export const NORMALIZATION_MEASURE_PAN = -1;

/** Frames per Web Audio render quantum (W3C Web Audio API 1.0: 128; the
 *  1.1 draft's configurable size is not used here). */
export const RENDER_QUANTUM_FRAMES = 128;

/** How many hits the normalisation measures and averages for a metal
 *  preset, each in its own render and triggered at a different position in
 *  the render quantum. */
export const NORMALIZATION_HITS = 8;

/**
 * Hits measured per sound: one for the types whose level does not depend on
 * the hit (membrane, fm, am, duo: under 1 LU in the 2026-10-01 sweep), and
 * NORMALIZATION_HITS for every other type (metal, cymbal, mono, synth, noise,
 * pluck).
 *
 * History: 2026-10-01 only the metal family got several hits (its quantum-
 * position dependence was the finding) and the rest was left "as a separate
 * decision". 2026-10-27 that decision, from two measurements:
 *  - the same headless Chromium sweep (16 positions, raw LUFS spread) had
 *    mono_analog 8.1 and synth_blip 3.2 -- the kick's second layers in every
 *    genre of the sound basis and in the default kit -- against 1 LU or less
 *    for the types kept at one hit. A rendered mono_analog layer sat 7.7 LU
 *    under the others after normalisation: one draw from an 8 LU spread.
 *  - the noise voices (clap, snare, brush, noise hat, and the cymbal's wash)
 *    draw new random noise on every render. Two identical full renders of the
 *    same kit (2026-10-27) put noise_clap at -26.8 and -30.2 LUFS after
 *    normalisation, and a pattern's clap lane 1.9 LU apart.
 * Eight hits cost eight renders (about 0.13 s -> 1.1 s per sound), once per
 * distinct sound, during which a new voice plays at its raw level.
 */
export function normalizationHitCount(type: SynthConfig['type']): number {
  return type === 'membrane' || type === 'fm' || type === 'am' || type === 'duo' ? 1 : NORMALIZATION_HITS;
}

/**
 * When hit `hit` (0-based) of the normalisation measurement is triggered:
 * OFFLINE_TRIGGER_AT plus `hit / NORMALIZATION_HITS` of a render quantum,
 * so the hits sit evenly across the quantum.
 *
 * Why (2026-10-01, headless Chromium, 44.1 kHz): a MetalSynth hit's
 * loudness depends on where its trigger time falls inside the 128-frame
 * render quantum -- by 1.4 LU for metal_closed (-28.20 to -26.77 LUFS raw
 * over all 128 positions), 0.9 LU for metal_rim, 0.2-0.35 LU for the other
 * metal presets, 0.06 LU for a membrane kick. The pattern repeats exactly
 * every 128 frames, and an offline render and a live hit at the same
 * position measure the same to 0.01 LU, so this is how the instrument
 * renders, not a difference between the two paths. Which Web Audio stage
 * makes it quantum dependent was not pinned down (one FMOscillator alone
 * varies 0.1 LU; six summed through the swept high-pass, 1.3 LU) --
 * unverified. A single measured hit is therefore one draw from that spread
 * (the old single hit at 220.5 frames happened to sit near the mean for
 * metal_closed, 0.18 LU off it for metal_rim); live hits land wherever the
 * clock puts them, so the measurement takes the mean over positions.
 * Eight positions came within 0.07 LU of the mean over all 128 for every
 * metal preset.
 */
export function normalizationTriggerTime(hit: number, sampleRate: number): number {
  return OFFLINE_TRIGGER_AT + (hit * RENDER_QUANTUM_FRAMES) / (NORMALIZATION_HITS * sampleRate);
}

/** The upper median: the middle value, or the higher of the two middle
 *  values for an even count. */
function upperMedian(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * One measurement for the normalisation from several hits of the same
 * sound: the power mean of their loudness (the loudness of the average hit's
 * energy) and the upper median of their peaks. Silent hits count as zero
 * energy. Null when there are no hits or all are silent.
 *
 * Median rather than maximum peak: the ceiling clamp in gainForTarget used
 * to see one hit's peak, a typical one. The highest of eight noise bursts'
 * peaks is an outlier -- in headless Chromium (2026-10-01) taking it pulled
 * noise_clap 2.5 dB under the target live. A hit that peaks above the
 * typical one is still held at the ceiling by the master bus limiter.
 */
export function combineHitMeasurements(hits: LoudnessMeasurement[]): LoudnessMeasurement | null {
  if (hits.length === 0) return null;
  const energy = hits.reduce(
    (sum, m) => sum + (Number.isFinite(m.integratedLufs) ? Math.pow(10, m.integratedLufs / 10) : 0),
    0
  );
  if (energy <= 0) return null;
  return {
    integratedLufs: 10 * Math.log10(energy / hits.length),
    truePeakDbfs: upperMedian(hits.map((m) => m.truePeakDbfs)),
    samplePeakDbfs: upperMedian(hits.map((m) => m.samplePeakDbfs)),
  };
}

/**
 * Renders normalizationHitCount single hits of `presetId` alone (no lane fx, no
 * shared space; one render each, triggered at normalizationTriggerTime)
 * through a Tone.Panner at NORMALIZATION_MEASURE_PAN -- i.e. the level after
 * the same panner `buildLayer`'s normGain feeds, valid at every pan --
 * offline, measures each via the shared `@otoinki/loudness` part, combines
 * them (combineHitMeasurements), and returns
 * the linear gain that would bring it to DRUM_LOUDNESS.targetLufs (-16, the
 * same value the phone's WAVs are levelled to; drumLoudness.json) without
 * exceeding DRUM_LOUDNESS.ceilingDbtp true peak. Cached by
 * (category, presetId, resolved params) -- deterministic rendering (this
 * package's existing guarantee, see renderChime-equivalent renderOneShot)
 * means the same key always measures the same, so this only runs once per
 * distinct sound. Falls back to unity gain (logged, not thrown) on any
 * render/measurement failure -- a mis-measured preset should stay audible at
 * its own level, not go silent or crash playback.
 */
export async function measureNormalizationGain(
  category: DrumId,
  presetId: string,
  params: Record<string, unknown>
): Promise<number> {
  const key = loudnessCacheKey(category, presetId, params);
  const cached = loudnessGainCache.get(key);
  if (cached !== undefined) return cached;

  const preset = getPreset(category, presetId);
  if (!preset) return 1;

  try {
    // All renders are queued at once (renderOffline runs them one at a
    // time), each a fresh instrument with one hit.
    const renderedHits: RenderedHit[] = [];
    const renders = Array.from({ length: normalizationHitCount(preset.type) }, async (_, hit) => {
      let triggerAt = OFFLINE_TRIGGER_AT;
      const buffer = await runOffline(() => {
        triggerAt = normalizationTriggerTime(hit, Tone.getContext().sampleRate);
        const instrument = createInstrument(preset.type, params);
        if (!instrument) return;
        // Through the same panner type the live layer uses (normGain ->
        // panner), so what is measured is what the layer plays at any pan.
        const panner = new Tone.Panner(NORMALIZATION_MEASURE_PAN).toDestination();
        instrument.connect(panner);
        triggerVoiceAt(instrument, preset, triggerAt);
      }, 2);
      const rendered = trimmed(buffer, triggerAt);
      if (!rendered) return null;
      if (preset.peakLimit) renderedHits.push(rendered);
      // One isolated hit trimmed to its trigger point, so it starts at about
      // sample 0: measured as a short sound (padded with silence, gating
      // grids pooled), which does not depend on where the hit sits in the
      // buffer.
      return measureShortSoundLoudness(
        rendered.channels,
        rendered.sampleRate,
        rendered.channels.length
      );
    });
    const hits = (await Promise.all(renders)).filter(
      (m): m is LoudnessMeasurement => m !== null
    );
    const measurement = combineHitMeasurements(hits);
    if (!measurement) {
      loudnessGainCache.set(key, 1);
      return 1;
    }
    let gain = gainForTarget(measurement, {
      targetLufs: DRUM_LOUDNESS.targetLufs,
      ceilingDbtp: DRUM_LOUDNESS.ceilingDbtp,
    });
    // A voice marked `peakLimit` plays through the soft peak limiter after this
    // gain, so the gain is searched for the limited sound (a bounded push; see
    // limitedGainDb).
    if (preset.peakLimit && renderedHits.length > 0) {
      gain = Math.pow(
        10,
        limitedGainDb(renderedHits, 20 * Math.log10(gain), measurement.truePeakDbfs) / 20
      );
    }
    loudnessGainCache.set(key, gain);
    return gain;
  } catch (error) {
    console.error(`Loudness normalisation measurement failed for ${category}/${presetId}:`, error);
    loudnessGainCache.set(key, 1);
    return 1;
  }
}

/**
 * One hit of `presetId` rendered through the live layer chain (instrument ->
 * normGain at the measured gain -> the soft peak limiter for marked presets ->
 * panner at NORMALIZATION_MEASURE_PAN), offline, trimmed to the hit. What a
 * lane's layer sends to its bus at unit layer gain. Used by the sound lab to
 * compare the web's loudness with the phone's (tools/sound-lab/lab.ts);
 * `hit` picks the trigger offset like the normalisation's own hits.
 */
export async function renderLayerHit(
  category: DrumId,
  presetId: string,
  params: Record<string, unknown>,
  hit = 0
): Promise<RenderedAudio | null> {
  const preset = getPreset(category, presetId);
  if (!preset) return null;
  const gain = await measureNormalizationGain(category, presetId, params);
  let triggerAt = OFFLINE_TRIGGER_AT;
  const buffer = await runOffline(() => {
    triggerAt = normalizationTriggerTime(hit, Tone.getContext().sampleRate);
    const instrument = createInstrument(preset.type, params);
    if (!instrument) return;
    const normGain = new Tone.Gain(gain);
    const panner = new Tone.Panner(NORMALIZATION_MEASURE_PAN).toDestination();
    instrument.connect(normGain);
    if (preset.peakLimit) {
      const limiter = new PeakLimiterNode();
      normGain.connect(limiter.input);
      limiter.output.connect(panner);
    } else {
      normGain.connect(panner);
    }
    triggerVoiceAt(instrument, preset, triggerAt);
  }, 3);
  return trimmed(buffer, triggerAt);
}

function cloneLayer(layer: LayerConfig): LayerConfig {
  return { ...layer, delay: { ...layer.delay } };
}

function cloneLayers(layers: LayerConfig[]): LayerConfig[] {
  return layers.map(cloneLayer);
}

function newLayerId(laneId: string): string {
  return `${laneId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Clamps a single ranged value, falling back to `fallback` when the input
 *  isn't a finite number at all (NaN/Infinity from a corrupt save or a bad
 *  caller) rather than letting it through as-is. */
function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** ISSUE-LAYER-001 L-1 (relayed via ISSUE-LAYER-002 "前提"): gainDb/pan/
 *  timeMs/feedback/wet are documented ranges in synthPresets.ts's jsdoc, but
 *  nothing enforced them at runtime — a slider one keystroke off, or a
 *  hand-edited save, could reach the Tone.js constructors unclamped. This is
 *  the single place that enforces those ranges, shared by every write path
 *  (addLayer, updateLayer, loadAllLayers) so none of them can drift out of
 *  sync with the others. */
function clampLayerPatch(
  patch: Partial<Omit<LayerConfig, 'layerId'>>
): Partial<Omit<LayerConfig, 'layerId'>> {
  const out: Partial<Omit<LayerConfig, 'layerId'>> = { ...patch };
  if (out.gainDb !== undefined) {
    out.gainDb = clampFinite(out.gainDb, -24, 6, 0);
  }
  if (out.pan !== undefined) {
    out.pan = clampFinite(out.pan, -1, 1, 0);
  }
  if (out.delay !== undefined) {
    out.delay = {
      ...out.delay,
      timeMs: clampFinite(out.delay.timeMs, 5, 400, 5),
      feedback: clampFinite(out.delay.feedback, 0, 0.6, 0),
      wet: clampFinite(out.delay.wet, 0, 1, 0),
    };
  }
  return out;
}

/** ISSUE-LAYER-001 M-3 (relayed via ISSUE-LAYER-002 "前提"): validates one
 *  persisted layer field-by-field, the same way layoutStore.ts's
 *  loadSaved() validates a saved panel layout — not just Array.isArray, but
 *  every field's presence/type, and the preset actually existing. A layer
 *  that fails any check is dropped rather than patched, so a NaN or a
 *  reference to a deleted preset can never reach buildLayer()/Tone.js. */
function isValidSavedLayer(category: DrumId, value: unknown): value is LayerConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.layerId !== 'string' || candidate.layerId === '') return false;
  if (typeof candidate.presetId !== 'string' || !getPreset(category, candidate.presetId)) {
    return false;
  }
  if (typeof candidate.gainDb !== 'number' || !Number.isFinite(candidate.gainDb)) return false;
  if (typeof candidate.pan !== 'number' || !Number.isFinite(candidate.pan)) return false;

  const delay = candidate.delay;
  if (!delay || typeof delay !== 'object') return false;
  const d = delay as Record<string, unknown>;
  if (typeof d.enabled !== 'boolean') return false;
  if (typeof d.timeMs !== 'number' || !Number.isFinite(d.timeMs)) return false;
  if (typeof d.feedback !== 'number' || !Number.isFinite(d.feedback)) return false;
  if (typeof d.wet !== 'number' || !Number.isFinite(d.wet)) return false;

  return true;
}

/** ISSUE-BEATBOX-015 finding 10: validates one preset's saved slider
 *  overrides field-by-field against PARAMETER_SPECS, the same "drop the bad
 *  field, keep the rest" approach isValidSavedLayer/clampLayerPatch already
 *  apply to layers — a `NaN`, a string, or a value outside the slider's
 *  documented min/max never reaches buildInstrument()/Tone.js; the value
 *  simply falls back to that preset's own default for the dropped key. An
 *  unknown preset (or a non-object `values`) drops the whole entry, since
 *  there is no spec list to check individual fields against. */
function sanitizeSavedLayerSettings(
  category: DrumId,
  presetId: string,
  values: unknown
): Record<string, number> {
  if (!values || typeof values !== 'object') return {};
  if (!getPreset(category, presetId)) return {};

  const raw = values as Record<string, unknown>;
  const out: Record<string, number> = {};
  getPresetParameters(category, presetId).forEach((spec) => {
    const candidate = raw[spec.key];
    if (
      typeof candidate === 'number' &&
      Number.isFinite(candidate) &&
      candidate >= spec.min &&
      candidate <= spec.max
    ) {
      out[spec.key] = candidate;
    }
  });
  return out;
}

/** Validates one lane's saved effects field by field against the ranges
 *  buildLaneChain clamps to (and the filter types Tone accepts here). A field
 *  that is missing or malformed is left out, so that effect is simply off, as
 *  for a lane the basis gives none. Never throws. */
function sanitizeSavedLaneFx(value: unknown): LaneFx {
  const out: LaneFx = {};
  const asObject = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const num = (v: unknown, min: number, max: number): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

  const root = asObject(value);
  if (!root) return out;

  const filter = asObject(root.filter);
  if (filter) {
    const frequency = num(filter.frequency, 20, 20000);
    if (
      (filter.type === 'lowpass' || filter.type === 'highpass' || filter.type === 'bandpass') &&
      frequency !== undefined
    ) {
      out.filter = { type: filter.type, frequency };
      const q = num(filter.Q, 0.1, 20);
      if (q !== undefined) out.filter.Q = q;
      if (filter.rolloff === -12 || filter.rolloff === -24 || filter.rolloff === -48) {
        out.filter.rolloff = filter.rolloff;
      }
    }
  }
  const distortion = asObject(root.distortion);
  if (distortion) {
    const amount = num(distortion.amount, 0, 1);
    const wet = num(distortion.wet, 0, 1);
    if (amount !== undefined && wet !== undefined) out.distortion = { amount, wet };
  }
  const compressor = asObject(root.compressor);
  if (compressor) {
    const threshold = num(compressor.threshold, -60, 0);
    const ratio = num(compressor.ratio, 1, 20);
    const attack = num(compressor.attack, 0, 1);
    const release = num(compressor.release, 0, 1);
    if (
      threshold !== undefined &&
      ratio !== undefined &&
      attack !== undefined &&
      release !== undefined
    ) {
      out.compressor = { threshold, ratio, attack, release };
    }
  }
  const reverbSend = num(root.reverbSend, 0, MAX_SEND);
  if (reverbSend !== undefined) out.reverbSend = reverbSend;
  const delaySend = num(root.delaySend, 0, MAX_SEND);
  if (delaySend !== undefined) out.delaySend = delaySend;
  return out;
}

export class AudioEngine {
  /** Every layer's live node chain, in the same order as voiceLayers[laneId]. */
  private instruments: Record<string, LayerVoice[]> = {};
  /** Per-lane bus all of that lane's layers mix into before the master. */
  private buses: Record<string, Tone.Gain> = {};
  /** Unity Tone.Gain every lane chain and the shared space mix into; the
   *  Tone-side entry point of `masterBus`. */
  private masterInput: Tone.Gain;
  /** The shared @otoinki/loudness master bus (master level -> safety
   *  limiter at the -1 dBTP family ceiling -> makeup compensation ->
   *  destination), built on the live context's raw AudioContext. Its limiter
   *  is the ceiling that stops several drums firing on one step from
   *  clipping (REL-004). */
  private masterBus: MasterBus;
  private isInitialized = false;
  private isAudioStarted = false;

  /** ISSUE-BEATBOX-014 (audit finding 2): the most recent buildLayer()
   *  failure, so a caller (settings UI, a future error toast) can surface
   *  "this preset/override didn't apply" instead of the failure being
   *  console-only. Cleared on the next successful buildLayer() for that lane
   *  is not attempted here — it's a last-error slot, not a per-lane map — a
   *  fresh failure simply overwrites it. */
  private lastError: { laneId: string; message: string } | null = null;

  /** Which synths are stacked on each lane, and how. Index 0 of each array
   *  is "layer 0" — the one the pre-layer API (§8-a) exclusively operates on. */
  private voiceLayers: Record<string, LayerConfig[]> = {};

  /** Which preset category (kick/tom/cymbal/clap) each lane draws from
   *  (P2-17) — a lane's id is its own identity, distinct from the category
   *  once there's more than one lane per category. */
  private laneCategory: Record<string, DrumId> = {};

  /** Layer-0 slider overrides, keyed `${laneId}:${presetId}` — this is the
   *  exact pre-layer format/semantics, unchanged, because SettingsPanel.tsx's
   *  getSettings/setSettings/clearSettings/getAllSettings/loadAllSettings
   *  calls must keep behaving exactly as before (ISSUE-LAYER-001 §8-a). Keyed
   *  by lane id rather than category since P2-17, so two lanes sharing a
   *  category don't share overrides either. */
  private settings: Record<string, Record<string, number>> = {};

  /** Slider overrides for layers 1+ (new API, not yet called from any UI),
   *  keyed by layerId so two layers on the same preset don't collide. */
  private layerOverrides: Record<string, Record<string, number>> = {};

  /** Per-lane effect settings (sound basis) and the live chains built from
   *  them. A lane with no entry uses a neutral chain. */
  private laneFx: Record<string, LaneFx> = {};
  private laneChains: Record<string, LaneChain> = {};
  /** Lanes whose live effect chain was (re)built and has not sounded yet, so
   *  its compressor is still cold (see armLaneCompressor). */
  private coldLaneChains = new Set<string>();
  private spaceSettings: SpaceSettings = { ...DEFAULT_SPACE };
  private sharedSpace: SharedSpace | null = null;
  /** Last tempo given to setTransportBpm, for the delay's note value. */
  private bpm = 120;
  /** The context the master chain was built on; all live nodes must share it. */
  private readonly liveContext: Tone.BaseContext;

  constructor() {
    // Signal path: layers -> per-lane bus -> master -> limiter -> makeup
    // compensation -> out.
    // The buses are LAYER-001's, the limiter ceiling is REL-004's; neither
    // replaces the other. Lanes themselves (P2-17) are registered in
    // initialize(), not here — building their Tone chain needs the audio
    // context started first.
    //
    // Master level now starts at the shared FAMILY_LOUDNESS.defaultMasterDb
    // (owner decision 2026-09-27/28), not the previous fixed linear 0.7
    // (~-3.1 dB) -- see CONTRACT.md's "SoundBox findings" in
    // @otoinki/loudness for the before/after. setMasterDb/getMasterDb below
    // are the dB-based control.
    //
    // 2026-10-01: the master level, limiter and output are now the shared
    // @otoinki/loudness `createMasterBus` (0.3.0) on the live context's raw
    // AudioContext instead of this engine's own Tone.Gain('decibels') ->
    // Tone.Limiter(-1) chain, so SoundBox gets the shared package's two
    // fixes (cancelling the limiter's automatic makeup gain, and starting
    // the limiter at release 0 so the first sound is not attenuated) with no
    // copy of that math here. The -1 dBTP ceiling is the same
    // (FAMILY_LOUDNESS.ceilingDbtp); the limiter itself is now the family's
    // hard-knee one (MASTER_LIMITER) rather than Tone.Limiter's 30 dB knee.
    this.liveContext = Tone.getContext();
    this.masterBus = createMasterBus(this.liveContext.rawContext as unknown as MinimalAudioContext, {
      // 100% on this app's volume scale (2026-10-05, ../store/masterVolume.ts),
      // not the quieter family default.
      defaultMasterDb: NORMAL_MASTER_DB,
      // Same slider ramp the previous Tone.js chain used.
      rampSeconds: 0.1,
    });
    this.masterInput = new Tone.Gain(1);
    this.masterInput.connect(this.masterBus.input as unknown as AudioNode);
  }

  /** Runs `build` with the global Tone context pinned to this engine's live
   *  context, restoring whatever was global before. Every live node
   *  (layers, buses, lane chains, shared space) is constructed inside this,
   *  because an in-flight Tone.Offline (loudness measurement, WAV export)
   *  leaves the global context pointing at its OfflineContext while it
   *  awaits -- see runOffline. */
  private withLiveContext<T>(build: () => T): T {
    return withLiveContext(Tone, this.liveContext, build);
  }

  /** A phone call or another app can interrupt the audio context while the
   *  page stays open. Mobile browsers then leave it "interrupted" or
   *  "suspended", and nothing resumes it by itself, so the app stays silent
   *  until a user gesture calls resume(). The app calls this on taps and
   *  before each Play. A failed resume is not thrown; the next gesture tries
   *  again. Does nothing while the context is running. */
  resumeIfInterrupted(): Promise<void> {
    if (this.liveContext.state === 'running') return Promise.resolve();
    return this.liveContext.resume().catch(() => undefined);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const ctx = this.liveContext;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (!this.isAudioStarted) {
        await Tone.start();
        this.isAudioStarted = true;
      }

      // First call: register the four starting lanes. Registration only
      // (laneCategory/voiceLayers/buses) happens here rather than through
      // addLane(), which also builds the Tone chain immediately — this
      // engine isn't "initialized" yet, so that build happens in the
      // isInitialized-independent pass below instead, same as it always has.
      if (Object.keys(this.laneCategory).length === 0) {
        DEFAULT_LANES.forEach((lane) => this.registerLane(lane));
      }
      Object.keys(this.laneCategory).forEach((laneId) => this.rebuildVoice(laneId));
      // Built after the voices so the shared nodes never sit between the
      // per-lane buses in construction order.
      this.sharedSpace = this.withLiveContext(() =>
        buildSharedSpace(this.spaceSettings, this.masterInput, this.bpm)
      );
      Object.keys(this.laneCategory).forEach((laneId) => this.rebuildLaneChain(laneId));
      await this.sharedSpace.reverb.ready;
      this.isInitialized = true;
      console.log('Audio engine ready');
    } catch (error) {
      console.error('Audio initialization failed:', error);
      this.isInitialized = false;
      // Rethrown so the caller (App.initAudioEngine) can show the error and
      // offer a retry. Swallowing it here used to hand back an engine that
      // looked ready but whose playDrumAt() silently did nothing.
      throw error;
    }
  }

  /** Adds the lane's bookkeeping (category, default layers, bus) without
   *  building its Tone chain — initialize() does that separately for every
   *  registered lane at once; addLane() (below) builds it immediately since
   *  by the time a caller can reach that, the engine already is initialized. */
  private registerLane(lane: Lane): void {
    this.laneCategory[lane.id] = lane.category;
    this.voiceLayers[lane.id] = cloneDefaultLayersFor(lane.id, lane.category);
    this.instruments[lane.id] = [];
    // Connected to its effect chain by rebuildLaneChain(), not to the master
    // directly: bus -> Filter -> Distortion -> dynamics -> master (+ sends).
    this.buses[lane.id] = this.withLiveContext(() => new Tone.Gain(1));
  }

  /** (Re)builds a lane's effect chain from laneFx and reconnects its bus. */
  private rebuildLaneChain(laneId: string): void {
    const bus = this.buses[laneId];
    if (!bus) return;
    const existing = this.laneChains[laneId];
    bus.disconnect();
    const chain = this.withLiveContext(() =>
      buildLaneChain(this.laneFx[laneId] ?? {}, this.masterInput, this.sharedSpace)
    );
    bus.connect(chain.input);
    this.laneChains[laneId] = chain;
    this.coldLaneChains.add(laneId);
    if (existing) disposeLaneChain(existing);
  }

  /** Opens the shared cold-start window (@otoinki/loudness
   *  `armCompressorColdStart`: release 0 for 0.5 s from now) on a lane's
   *  compressor right before the first hit after its chain was built. A
   *  fresh `DynamicsCompressorNode` attenuates its first sound whatever its
   *  ratio (the spec's envelope follower starts cold). Until 2026-10-01
   *  SoundBox built one per lane even when the lane's compressor was neutral
   *  (ratio 1; now bypassed, see LaneChain): headless Chromium measured the first 100 ms of the first Play ~2.4 dB
   *  quieter than later plays with autoplay allowed, ~0.6 dB without, with
   *  the master bus already re-armed. 2026-10-01. */
  private armLaneCompressor(laneId: string): void {
    if (!this.coldLaneChains.has(laneId)) return;
    const chain = this.laneChains[laneId];
    this.coldLaneChains.delete(laneId);
    if (!chain?.compressor) return;
    armCompressorColdStart(
      chain.compressor as unknown as { release: AudioParamLike },
      this.liveContext.rawContext.currentTime,
      chain.compressorReleaseSeconds
    );
  }

  /** Adds a new lane (P2-17) — a copy of `category`'s default layers, live
   *  immediately if the engine is already running. A no-op if `laneId` is
   *  already registered (the store's own id generation avoids collisions;
   *  this is just defence against calling it twice for the same lane). */
  addLane(laneId: string, category: DrumId): void {
    if (this.laneCategory[laneId]) return;
    this.registerLane({ id: laneId, category, label: '', muted: false, solo: false });
    if (this.isInitialized) {
      this.rebuildVoice(laneId);
      this.rebuildLaneChain(laneId);
    }
    this.notifyChange();
  }

  /** Removes a lane and disposes everything it owns, including its layer-0
   *  `settings` entries and any layer-1+ `layerOverrides` (ISSUE-BEATBOX-015
   *  finding 9). Left unswept, these used to survive under the old laneId:
   *  `nextLaneId()` reuses the smallest free number, so re-adding a lane
   *  (e.g. `kick-2` after it was removed) got the *previous* occupant's
   *  overrides rather than the fresh preset's own defaults. */
  removeLane(laneId: string): void {
    this.instruments[laneId]?.forEach((voice) => this.disposeVoice(voice));
    this.buses[laneId]?.dispose();
    if (this.laneChains[laneId]) disposeLaneChain(this.laneChains[laneId]);
    delete this.laneChains[laneId];
    this.coldLaneChains.delete(laneId);
    delete this.laneFx[laneId];
    this.voiceLayers[laneId]?.forEach((layer) => {
      delete this.layerOverrides[layer.layerId];
    });
    Object.keys(this.settings)
      .filter((key) => key.startsWith(`${laneId}:`))
      .forEach((key) => {
        delete this.settings[key];
      });
    delete this.instruments[laneId];
    delete this.buses[laneId];
    delete this.voiceLayers[laneId];
    delete this.laneCategory[laneId];
    this.notifyChange();
  }

  /** Layer 0 keeps the pre-layer override format (keyed by preset, so
   *  switching presets back and forth on that slot remembers each preset's
   *  sliders, exactly as before). Layers 1+ are keyed by layerId instead. */
  private overridesForLayer(laneId: string, layerIndex: number): Record<string, number> {
    const layer = this.voiceLayers[laneId][layerIndex];
    if (!layer) return {};
    if (layerIndex === 0) {
      return this.settings[`${laneId}:${layer.presetId}`] ?? {};
    }
    return this.layerOverrides[layer.layerId] ?? {};
  }

  private disposeVoice(voice: LayerVoice): void {
    voice.instrument.dispose();
    voice.normGain.dispose();
    voice.limiter?.dispose();
    voice.panner.dispose();
    voice.gain.dispose();
    voice.delay.dispose();
  }

  /** (Re)builds a single layer's node chain in place, without touching its
   *  siblings. Used for anything that changes one layer's preset/params. */
  private buildLayer(laneId: string, layerIndex: number): void {
    this.withLiveContext(() => this.buildLayerInLiveContext(laneId, layerIndex));
  }

  private buildLayerInLiveContext(laneId: string, layerIndex: number): void {
    const layer = this.voiceLayers[laneId][layerIndex];
    if (!layer) return;

    const existing = this.instruments[laneId][layerIndex];

    // buildInstrument() owns preset lookup, override merging and the synth
    // switch, so live playback and the offline renderers cannot drift apart.
    const category = this.laneCategory[laneId];
    const overrides = this.overridesForLayer(laneId, layerIndex);

    // ISSUE-BEATBOX-014 (audit finding 2): a slider override that Tone.js
    // rejects (e.g. the Wood Block's resonance, pre-fix, out of PluckSynth's
    // 0..1 range) used to throw here after the old voice was already
    // disposed, leaving that lane permanently silent. The old voice is now
    // only disposed once the replacement has been built successfully, and a
    // failure is recorded in lastError instead of just a console line, so
    // something downstream of the engine can surface it.
    let instrument: DrumInstrument | null;
    try {
      instrument = buildInstrument(category, layer.presetId, overrides);
    } catch (error) {
      this.lastError = { laneId, message: error instanceof Error ? error.message : String(error) };
      console.error(`Failed to build ${laneId} layer ${layerIndex}:`, error);
      return;
    }
    if (!instrument) return;

    const normGain = new Tone.Gain(1);
    const limiter = getPreset(category, layer.presetId)?.peakLimit ? new PeakLimiterNode() : null;
    const panner = new Tone.Panner(layer.pan);
    const gain = new Tone.Gain(layer.gainDb, 'decibels');
    const delay = new Tone.FeedbackDelay(layer.delay.timeMs / 1000, layer.delay.feedback);
    // Tone's Effect base class already crossfades dry/wet internally (a
    // parallel send/return around the delay node), so routing every layer
    // through it and driving that crossfade with `wet` *is* the parallel-wet
    // mix ISSUE-LAYER-001 §2 asks for — disabled just means wet=0, i.e. the
    // delay node passes its input straight through unprocessed.
    delay.wet.value = layer.delay.enabled ? layer.delay.wet : 0;

    instrument.connect(normGain);
    if (limiter) {
      normGain.connect(limiter.input);
      limiter.output.connect(panner);
    } else {
      normGain.connect(panner);
    }
    panner.connect(gain);
    gain.connect(delay);
    delay.connect(this.buses[laneId]);

    if (existing) {
      this.disposeVoice(existing);
    }

    this.instruments[laneId][layerIndex] = {
      layerId: layer.layerId,
      instrument,
      normGain,
      limiter,
      panner,
      gain,
      delay,
    };

    // Per-sound loudness normalisation (owner decision 2026-09-27/28):
    // measured asynchronously (an offline render), cached by preset+params,
    // then ramped onto normGain once known -- guarded by layerId so a stale
    // resolution from a since-replaced/removed voice never writes into a
    // disposed (or a different) node.
    const normPreset = getPreset(category, layer.presetId);
    const normParams = normPreset ? resolveParams(normPreset, overrides) : {};
    void measureNormalizationGain(category, layer.presetId, normParams).then((normalizedGain) => {
      const current = this.instruments[laneId]?.[layerIndex];
      if (current && current.layerId === layer.layerId) {
        current.normGain.gain.rampTo(normalizedGain, 0.05);
      }
    });
  }

  /** Disposes and rebuilds every layer of a lane. Needed after add/remove,
   *  since layer indices shift. */
  private rebuildVoice(laneId: string): void {
    this.instruments[laneId].forEach((voice) => this.disposeVoice(voice));
    this.instruments[laneId] = [];
    this.voiceLayers[laneId].forEach((_layer, index) => this.buildLayer(laneId, index));
  }

  /** Triggers every layer stacked on this voice at once, at a specific
   *  scheduled time — what the Transport-driven sequencer (below) needs to
   *  stay sample-accurate. `velocity` (0..1, default 1) is P2-16's per-step
   *  accent. playDrum() is this called with "now" and full velocity. */
  playDrumAt(
    laneId: string,
    time: number,
    velocity = 1,
    /** Which layer indices fire (0 = main, 1+ = subs). Omitted: all of them. */
    layerOn?: (layerIndex: number) => boolean
  ): void {
    if (!this.isInitialized || !this.isAudioStarted) return;

    const layers = this.voiceLayers[laneId];
    const voices = this.instruments[laneId];
    if (!layers?.length || !voices?.length) return;

    const category = this.laneCategory[laneId];
    this.armMasterBus();
    this.armLaneCompressor(laneId);
    try {
      layers.forEach((layer, index) => {
        const preset = getPreset(category, layer.presetId);
        const voice = voices[index];
        if (!preset || !voice) return;
        if (layerOn && !layerOn(index)) return;
        if (preset.type === 'pluck') {
          // ISSUE-BEATBOX-014 (audit finding 7): PluckSynth.triggerAttack
          // has no velocity argument (Karplus-Strong has no per-hit
          // amplitude parameter), so the accent is applied here instead, on
          // the layer's own gain node, scaled off that layer's configured
          // level rather than replacing it.
          voice.gain.gain.setValueAtTime(Tone.dbToGain(layer.gainDb) * velocity, time);
        }
        triggerVoiceAt(voice.instrument, preset, time, velocity);
      });
    } catch (error) {
      console.error(`Error playing ${laneId}:`, error);
    }
  }

  /** Triggers every layer stacked on this voice at once — this is the
   *  "+layer" thickness feature: one hit, several synths firing together. */
  playDrum(laneId: string, velocity = 1): void {
    // Nudge the trigger past "now" — Tone throws if two events land on the
    // same timestamp, which happens when several drums fire on one step.
    this.playDrumAt(laneId, this.liveContext.now() + 0.001, velocity);
  }

  // ---------------------------------------------------------------------
  // Transport-driven sequencing (P2-14).
  //
  // App.tsx used to step the sequencer with a plain JS setInterval. That
  // callback has no promise of running when scheduled — a GC pause, other
  // work on the main thread, or a backgrounded tab all push it late, which
  // is audible as drift (or, backgrounded, a dead stop: browsers throttle
  // timers in tabs that aren't visible). Tone.Transport instead schedules
  // against the Web Audio clock, which keeps running regardless of the main
  // thread, and a tempo change just updates its BPM signal rather than
  // requiring the schedule to be torn down and rebuilt.
  //
  // AudioEngine only wraps the Tone.Transport primitives here; App.tsx still
  // owns *what* runs on each step (reading the grid, advancing the step
  // counter, wrapping at the pattern's length) exactly as it did with the
  // interval, just handed a precise clock to run on instead of one.
  // ---------------------------------------------------------------------

  /** Runs `callback` every `resolution`th-note once the transport is
   *  running (startTransport). Returns an id for clearScheduled(). */
  scheduleRepeat(callback: (time: number) => void, resolution: number): number {
    return Tone.Transport.scheduleRepeat(callback, `${resolution}n`);
  }

  clearScheduled(id: number): void {
    Tone.Transport.clear(id);
  }

  startTransport(): void {
    this.armMasterBus();
    Tone.Transport.start();
  }

  /** Re-arms the shared bus's limiter cold-start window right before the
   *  first sound (@otoinki/loudness 0.4.0 `MasterBus.arm`). The bus is
   *  built in the constructor; when the context is already running then
   *  (autoplay allowed, e.g. the desktop build) the window scheduled at
   *  creation has expired by the first hit, and headless Chromium measured
   *  the first 100 ms of the first Play ~3 dB quieter than later plays.
   *  Only the first arm() does anything, so calling it on every hit/start is
   *  cheap. 2026-10-01. */
  private armMasterBus(): void {
    this.masterBus.arm();
  }

  /** Stops the transport. Tone resets its position to 0 as part of stopping,
   *  so the next start always begins from the top of the pattern. */
  stopTransport(): void {
    Tone.Transport.stop();
  }

  /** Updates the transport's tempo in place — no schedule to tear down, so
   *  changing BPM mid-playback doesn't skip or double a step the way
   *  rebuilding a setInterval could (ISSUE-REL-004 IT-4 was this same bug,
   *  for grid edits instead of tempo). */
  setTransportBpm(bpm: number): void {
    Tone.Transport.bpm.value = bpm;
    this.bpm = bpm;
    // Keep the shared delay on the same note value at the new tempo.
    if (this.sharedSpace) {
      this.sharedSpace.delay.delayTime.value = noteValueSeconds(this.spaceSettings.delayTime, bpm);
    }
  }

  /** Runs `callback` near the real time `time` refers to, instead of
   *  whenever the Transport's lookahead callback happens to fire — Tone
   *  schedules audio events up to its lookAhead (~100ms) before they
   *  sound, and reading `callback` straight from scheduleRepeat would make
   *  the playhead highlight visibly lead the audio. */
  drawAt(time: number, callback: () => void): void {
    Tone.Draw.schedule(callback, time);
  }

  // ---------------------------------------------------------------------
  // Pre-layer compatibility surface (ISSUE-LAYER-001 §8-a). Every method in
  // this section operates on layer 0 only, with the exact signature and
  // behaviour the pre-layer engine had, so SequencerGrid.tsx, SettingsPanel.tsx
  // and soundRecipe.ts keep working unmodified.
  // ---------------------------------------------------------------------

  changeDrumPreset(laneId: string, presetId: string): void {
    const category = this.laneCategory[laneId];
    if (!SYNTH_PRESETS[category]?.[presetId]) {
      console.error(`Invalid preset: ${laneId}/${presetId}`);
      return;
    }

    this.voiceLayers[laneId][0].presetId = presetId;
    if (this.isInitialized) {
      this.buildLayer(laneId, 0);
    }
    this.notifyChange();
  }

  getCurrentPreset(laneId: string): string {
    const category = this.laneCategory[laneId];
    return this.voiceLayers[laneId]?.[0]?.presetId ?? DEFAULT_LAYERS[category][0].presetId;
  }

  /** Settings for layer 0's currently selected preset. */
  getSettings(laneId: string): Record<string, number> {
    const category = this.laneCategory[laneId];
    const presetId = this.voiceLayers[laneId][0].presetId;
    const key = `${laneId}:${presetId}`;
    return this.settings[key] ?? getPresetDefaults(category, presetId);
  }

  /** BB-T16: slider values from the panel or from an imported preset file
   *  pass through the same PARAMETER_SPECS check as a saved layer
   *  (sanitizeSavedLayerSettings), so an Infinity (JSON 1e999) or a value
   *  outside the slider's range never reaches Tone.js. A dropped field takes
   *  the preset's own default, and the stored map stays complete so the
   *  settings panel always has a value for every slider. */
  private checkedOverrides(
    laneId: string,
    presetId: string,
    values: unknown
  ): Record<string, number> {
    const category = this.laneCategory[laneId];
    return {
      ...getPresetDefaults(category, presetId),
      ...sanitizeSavedLayerSettings(category, presetId, values),
    };
  }

  setSettings(laneId: string, values: Record<string, number>): void {
    const presetId = this.voiceLayers[laneId][0].presetId;
    this.settings[`${laneId}:${presetId}`] = this.checkedOverrides(laneId, presetId, values);
    if (this.isInitialized) {
      this.buildLayer(laneId, 0);
    }
    this.notifyChange();
  }

  clearSettings(laneId: string): void {
    const presetId = this.voiceLayers[laneId][0].presetId;
    delete this.settings[`${laneId}:${presetId}`];
    if (this.isInitialized) {
      this.buildLayer(laneId, 0);
    }
    this.notifyChange();
  }

  /** Bulk-load persisted layer-0 overrides (keyed `${laneId}:${presetId}`).
   *  Each entry is validated field-by-field (sanitizeSavedLayerSettings)
   *  before it's trusted (ISSUE-BEATBOX-015 finding 10); an entry for a lane
   *  this engine doesn't know about is dropped too. */
  loadAllSettings(saved: Record<string, Record<string, number>>): void {
    const sanitized: Record<string, Record<string, number>> = {};
    Object.entries(saved ?? {}).forEach(([key, values]) => {
      const separatorIndex = key.indexOf(':');
      if (separatorIndex === -1) return;
      const laneId = key.slice(0, separatorIndex);
      const presetId = key.slice(separatorIndex + 1);
      const category = this.laneCategory[laneId];
      if (!category || !getPreset(category, presetId)) return;
      sanitized[key] = sanitizeSavedLayerSettings(category, presetId, values);
    });
    this.settings = sanitized;
    if (this.isInitialized) {
      Object.keys(this.laneCategory).forEach((laneId) => this.buildLayer(laneId, 0));
    }
  }

  getAllSettings(): Record<string, Record<string, number>> {
    return { ...this.settings };
  }

  // ---------------------------------------------------------------------
  // Layer management (new in ISSUE-LAYER-001). Nothing in the current UI
  // calls these yet — wiring them to the "+ Add layer" control etc. is
  // LAYER-002's job.
  // ---------------------------------------------------------------------

  /** Read-only snapshot of a lane's layers, deep-copied so callers can't
   *  mutate engine state by holding onto the returned objects. */
  getLayers(laneId: string): LayerConfig[] {
    return cloneLayers(this.voiceLayers[laneId] ?? []);
  }

  addLayer(laneId: string, presetId?: string): LayerConfig | null {
    const layers = this.voiceLayers[laneId];
    const category = this.laneCategory[laneId];
    if (!layers) return null;
    if (layers.length >= MAX_LAYERS_PER_VOICE) {
      console.warn(`${laneId} already has the maximum of ${MAX_LAYERS_PER_VOICE} layers`);
      return null;
    }

    const fallbackPresetId =
      presetId ?? layers[0]?.presetId ?? DEFAULT_LAYERS[category][0].presetId;
    if (!getPreset(category, fallbackPresetId)) {
      console.error(`Cannot add layer with unknown preset: ${laneId}/${fallbackPresetId}`);
      return null;
    }

    // New layers default well below unity so stacking doesn't just raise the
    // level (ISSUE-LAYER-001 §4's "-6dB or more" rule of thumb). Routed
    // through the same clamp updateLayer uses so this initial patch can
    // never drift out of the documented ranges either.
    const defaults = clampLayerPatch({
      gainDb: -6,
      pan: 0,
      delay: { enabled: false, timeMs: 10, feedback: 0, wet: 0 },
    });

    const layer: LayerConfig = {
      layerId: newLayerId(laneId),
      presetId: fallbackPresetId,
      gainDb: defaults.gainDb ?? -6,
      pan: defaults.pan ?? 0,
      delay: defaults.delay ?? { enabled: false, timeMs: 10, feedback: 0, wet: 0 },
    };

    layers.push(layer);
    if (this.isInitialized) {
      this.buildLayer(laneId, layers.length - 1);
    }
    this.notifyChange();
    return cloneLayer(layer);
  }

  removeLayer(laneId: string, layerId: string): boolean {
    const layers = this.voiceLayers[laneId];
    if (!layers || layers.length <= MIN_LAYERS_PER_VOICE) {
      console.warn(`${laneId} must keep at least ${MIN_LAYERS_PER_VOICE} layer`);
      return false;
    }

    const index = layers.findIndex((layer) => layer.layerId === layerId);
    if (index === -1) return false;

    delete this.layerOverrides[layerId];
    layers.splice(index, 1);
    if (this.isInitialized) {
      this.rebuildVoice(laneId);
    }
    this.notifyChange();
    return true;
  }

  /** Patches gain/pan/delay/preset on one existing layer (any index,
   *  including 0 — patching layer 0 through here is equivalent to
   *  changeDrumPreset + the gain/pan/delay it doesn't otherwise expose). */
  updateLayer(
    laneId: string,
    layerId: string,
    patch: Partial<Omit<LayerConfig, 'layerId'>>
  ): boolean {
    const layers = this.voiceLayers[laneId];
    if (!layers) return false;
    const index = layers.findIndex((layer) => layer.layerId === layerId);
    if (index === -1) return false;

    const category = this.laneCategory[laneId];
    if (patch.presetId && !getPreset(category, patch.presetId)) {
      console.error(`Cannot update layer to unknown preset: ${laneId}/${patch.presetId}`);
      return false;
    }

    const clampedPatch = clampLayerPatch(patch);
    const current = layers[index];

    // ISSUE-LAYER-001 M-4 (relayed via ISSUE-LAYER-002 "前提"): layer 0's
    // slider overrides are keyed `${laneId}:${presetId}` (preset-scoped by
    // construction — see overridesForLayer/settings above), so switching
    // its preset naturally lands on a different key. Layers 1+ are keyed by
    // layerId alone (setLayerSettings), which does NOT change when the
    // preset does — so without this, switching a layer-1+ slot's preset
    // would carry the old preset's overrides straight into the new
    // preset's synth. Clear them here, the one write path that changes a
    // layer's preset.
    if (
      index > 0 &&
      clampedPatch.presetId !== undefined &&
      clampedPatch.presetId !== current.presetId
    ) {
      delete this.layerOverrides[layerId];
    }

    layers[index] = {
      ...current,
      ...clampedPatch,
      delay: { ...current.delay, ...(clampedPatch.delay ?? {}) },
    };

    if (this.isInitialized) {
      this.buildLayer(laneId, index);
    }
    this.notifyChange();
    return true;
  }

  /** Slider overrides for a specific layer. Layer 0 is routed through the
   *  compat `settings` map (so it stays interchangeable with setSettings). */
  setLayerSettings(laneId: string, layerId: string, values: Record<string, number>): boolean {
    const layers = this.voiceLayers[laneId];
    if (!layers) return false;
    const index = layers.findIndex((layer) => layer.layerId === layerId);
    if (index === -1) return false;

    if (index === 0) {
      this.setSettings(laneId, values);
      return true;
    }

    this.layerOverrides[layerId] = this.checkedOverrides(laneId, layers[index].presetId, values);
    if (this.isInitialized) {
      this.buildLayer(laneId, index);
    }
    this.notifyChange();
    return true;
  }

  /** Read counterpart to setLayerSettings(), needed by the settings UI
   *  (LAYER-002) so a layer's sliders can show its persisted overrides
   *  instead of always resetting to the preset's own defaults. Layer 0
   *  reads through the compat `getSettings` (same preset-scoped key);
   *  layers 1+ read `layerOverrides`, falling back to that layer's own
   *  preset defaults when nothing has been overridden yet. */
  getLayerSettings(laneId: string, layerId: string): Record<string, number> {
    const layers = this.voiceLayers[laneId];
    if (!layers) return {};
    const index = layers.findIndex((layer) => layer.layerId === layerId);
    if (index === -1) return {};

    if (index === 0) {
      return this.getSettings(laneId);
    }

    const category = this.laneCategory[laneId];
    const layer = layers[index];
    return this.layerOverrides[layerId] ?? getPresetDefaults(category, layer.presetId);
  }

  /** Clear counterpart to setLayerSettings()/getLayerSettings(), backing the
   *  settings UI's per-layer "Reset" action (LAYER-002). Layer 0 clears
   *  through the compat `clearSettings`; layers 1+ drop their
   *  `layerOverrides` entry. */
  clearLayerSettings(laneId: string, layerId: string): void {
    const layers = this.voiceLayers[laneId];
    if (!layers) return;
    const index = layers.findIndex((layer) => layer.layerId === layerId);
    if (index === -1) return;

    if (index === 0) {
      this.clearSettings(laneId);
      return;
    }

    delete this.layerOverrides[layerId];
    if (this.isInitialized) {
      this.buildLayer(laneId, index);
    }
    this.notifyChange();
  }

  /** Full multi-layer snapshot, keyed by lane id, for whoever ends up
   *  persisting it under LAYER_STORAGE_KEY (LAYER-002). */
  getAllLayers(): Record<string, LayerConfig[]> {
    const out: Record<string, LayerConfig[]> = {};
    Object.keys(this.voiceLayers).forEach((laneId) => {
      out[laneId] = cloneLayers(this.voiceLayers[laneId]);
    });
    return out;
  }

  /** Bulk-load persisted layers (ISSUE-LAYER-001 M-3, relayed via
   *  ISSUE-LAYER-002 "前提"), keyed by lane id. Each candidate layer is
   *  validated field-by-field (isValidSavedLayer) and range-clamped
   *  (clampLayerPatch) before it's trusted; anything malformed is dropped
   *  rather than passed through, and a lane whose saved layers were *all*
   *  malformed keeps its current (shipped-default) layers instead of being
   *  left with zero — a voice can never go silent by running out of layers,
   *  the same guarantee removeLayer enforces at runtime. Only touches lanes
   *  that are already registered; it doesn't add or remove lanes themselves. */
  loadAllLayers(saved: Record<string, LayerConfig[]>): void {
    Object.keys(this.laneCategory).forEach((laneId) => {
      const rawLayers = saved?.[laneId];
      if (!Array.isArray(rawLayers)) return;

      const category = this.laneCategory[laneId];
      const validLayers = rawLayers
        .filter((layer): layer is LayerConfig => isValidSavedLayer(category, layer))
        .map((layer) => clampLayerPatch(cloneLayer(layer)) as LayerConfig)
        .slice(0, MAX_LAYERS_PER_VOICE);

      if (validLayers.length < MIN_LAYERS_PER_VOICE) return;

      this.voiceLayers[laneId] = validLayers;
    });
    if (this.isInitialized) {
      Object.keys(this.laneCategory).forEach((laneId) => this.rebuildVoice(laneId));
    }
  }

  // ---------------------------------------------------------------------
  // Persisted sound document: what each lane sounds like (presets, stacked
  // layers, sliders, lane effects), so a reload brings back the same sounds.
  // The storage itself lives in soundPersistence.ts; the engine only builds
  // and validates the document and tells listeners when it may have changed.
  // ---------------------------------------------------------------------

  private changeListeners = new Set<() => void>();

  /** Calls `listener` after any change that alters the sound document (a
   *  preset, layer, slider or lane-effect edit, a lane added or removed, a
   *  sound-basis change). Bulk loads at start-up (loadAll*, loadSoundDocument)
   *  do not notify. Returns the unsubscribe function. */
  subscribeChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyChange(): void {
    this.changeListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('Sound change listener failed:', error);
      }
    });
  }

  /** The current per-lane sound, as a versioned, JSON-safe document. */
  getSoundDocument(): SavedSoundDocument {
    const lanes: Record<string, SavedLaneSound> = {};
    Object.keys(this.laneCategory).forEach((laneId) => {
      const layers = cloneLayers(this.voiceLayers[laneId] ?? []);
      const mainSettings: Record<string, Record<string, number>> = {};
      const prefix = `${laneId}:`;
      Object.entries(this.settings).forEach(([key, values]) => {
        if (key.startsWith(prefix)) mainSettings[key.slice(prefix.length)] = { ...values };
      });
      const layerSettings: Record<string, Record<string, number>> = {};
      layers.slice(1).forEach((layer) => {
        const values = this.layerOverrides[layer.layerId];
        if (values) layerSettings[layer.layerId] = { ...values };
      });
      lanes[laneId] = {
        category: this.laneCategory[laneId],
        layers,
        mainSettings,
        layerSettings,
        fx: JSON.parse(JSON.stringify(this.laneFx[laneId] ?? {})),
      };
    });
    return { version: SOUND_DOCUMENT_VERSION, lanes };
  }

  /** Applies a saved sound document (anything read from storage: it is
   *  untrusted). Every lane the document names and this engine also has, with
   *  the same category, is replaced wholesale by its saved layers, sliders and
   *  effects, each value passed through the same validators and range clamps as
   *  loadAllLayers / loadAllSettings; a lane the document lacks, or that no
   *  longer exists, is left alone (and a saved lane that is not live is
   *  ignored). A document that is not this version, or not an object at all,
   *  changes nothing. Returns the ids of the lanes restored, so the sound-basis
   *  step can leave exactly those alone (applySoundBasis `keepLanes`). Does not
   *  notify: this is loading, not editing. */
  loadSoundDocument(doc: unknown): string[] {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return [];
    const root = doc as Record<string, unknown>;
    if (root.version !== SOUND_DOCUMENT_VERSION) return [];
    const lanesRaw = root.lanes;
    if (!lanesRaw || typeof lanesRaw !== 'object' || Array.isArray(lanesRaw)) return [];

    const restored: string[] = [];
    // layerIds key layerOverrides for the whole engine, so a document that
    // repeats one across layers or lanes must not make two layers share it.
    const seenLayerIds = new Set<string>();
    Object.entries(lanesRaw as Record<string, unknown>).forEach(([laneId, entry]) => {
      const category = this.laneCategory[laneId];
      if (!category || !entry || typeof entry !== 'object') return;
      const saved = entry as Record<string, unknown>;
      if (saved.category !== category) return;

      const layers = (Array.isArray(saved.layers) ? saved.layers : [])
        .filter((layer): layer is LayerConfig => isValidSavedLayer(category, layer))
        .filter((layer) => {
          if (seenLayerIds.has(layer.layerId)) return false;
          seenLayerIds.add(layer.layerId);
          return true;
        })
        .map((layer) => clampLayerPatch(cloneLayer(layer)) as LayerConfig)
        .slice(0, MAX_LAYERS_PER_VOICE);
      if (layers.length < MIN_LAYERS_PER_VOICE) return;

      // Replace what this lane had: its old extra-layer overrides and its
      // layer-0 slider sets, so a value the player cleared stays cleared.
      this.voiceLayers[laneId]?.forEach((layer) => {
        delete this.layerOverrides[layer.layerId];
      });
      Object.keys(this.settings)
        .filter((key) => key.startsWith(`${laneId}:`))
        .forEach((key) => {
          delete this.settings[key];
        });

      this.voiceLayers[laneId] = layers;

      const mainSettings = saved.mainSettings;
      if (mainSettings && typeof mainSettings === 'object' && !Array.isArray(mainSettings)) {
        Object.entries(mainSettings as Record<string, unknown>).forEach(([presetId, values]) => {
          const clean = sanitizeSavedLayerSettings(category, presetId, values);
          if (Object.keys(clean).length > 0) this.settings[`${laneId}:${presetId}`] = clean;
        });
      }
      const layerSettings = saved.layerSettings;
      if (layerSettings && typeof layerSettings === 'object' && !Array.isArray(layerSettings)) {
        layers.slice(1).forEach((layer) => {
          const clean = sanitizeSavedLayerSettings(
            category,
            layer.presetId,
            (layerSettings as Record<string, unknown>)[layer.layerId]
          );
          if (Object.keys(clean).length > 0) this.layerOverrides[layer.layerId] = clean;
        });
      }
      this.laneFx[laneId] = sanitizeSavedLaneFx(saved.fx);

      if (this.isInitialized) {
        this.rebuildVoice(laneId);
        this.rebuildLaneChain(laneId);
      }
      restored.push(laneId);
    });
    return restored;
  }

  // ---------------------------------------------------------------------
  // Sound basis (docs/SOUND_DESIGN_20260924_genre_presets.md).
  // ---------------------------------------------------------------------

  getLaneFx(laneId: string): LaneFx {
    return JSON.parse(JSON.stringify(this.laneFx[laneId] ?? {}));
  }

  setLaneFx(laneId: string, fx: LaneFx): void {
    if (!this.laneCategory[laneId]) return;
    this.laneFx[laneId] = JSON.parse(JSON.stringify(fx));
    if (this.isInitialized) this.rebuildLaneChain(laneId);
    this.notifyChange();
  }

  getSpace(): SpaceSettings {
    return { ...this.spaceSettings };
  }

  /** Replaces the shared reverb/delay. Resolves once the new reverb's
   *  impulse response is ready (Tone.Reverb generates it asynchronously). */
  async setSpace(space: SpaceSettings): Promise<void> {
    this.spaceSettings = {
      reverbDecay: space.reverbDecay,
      preDelay: space.preDelay,
      delayTime: space.delayTime,
      delayFeedback: space.delayFeedback,
      returnHighpassHz: space.returnHighpassHz,
    };
    if (!this.isInitialized) return;
    const previous = this.sharedSpace;
    this.sharedSpace = this.withLiveContext(() =>
      buildSharedSpace(this.spaceSettings, this.masterInput, this.bpm)
    );
    Object.keys(this.laneCategory).forEach((laneId) => this.rebuildLaneChain(laneId));
    if (previous) disposeSharedSpace(previous);
    await this.sharedSpace.reverb.ready;
  }

  /**
   * Loads one sound-basis entry per category into every lane: the main sound
   * as layer 1, the "Add Layer" sound as layer 2 (neither with a per-layer
   * micro-delay, so both start at the same instant - design doc §3), the
   * lane's effects, and the shared space.
   *
   * `respectSaved`: keep a layer-1 slider set the player already saved for
   * that lane and preset (start-up, after loadAllSettings). An explicit basis
   * or genre change passes false.
   *
   * `keepLanes`: lanes to leave exactly as they are (layers, sliders and
   * effects), because the player's own saved sound for them was just restored
   * (loadSoundDocument); the genre default must not overwrite that. Only the
   * start-up pass uses it.
   */
  async applySoundBasis(
    entries: Record<DrumId, BasisEntry>,
    space: SpaceSettings,
    options: { respectSaved?: boolean; keepLanes?: readonly string[] } = {}
  ): Promise<void> {
    Object.keys(this.laneCategory).forEach((laneId) => {
      if (options.keepLanes?.includes(laneId)) return;
      const category = this.laneCategory[laneId];
      const entry = entries[category];
      if (!entry) return;
      if (!getPreset(category, entry.main.presetId) || !getPreset(category, entry.layer.presetId)) {
        console.error(`Sound basis names an unknown preset for ${laneId}`);
        return;
      }

      this.voiceLayers[laneId]?.forEach((layer) => {
        delete this.layerOverrides[layer.layerId];
      });
      const toLayer = (spec: BasisEntry['main'], index: number): LayerConfig => {
        const levels = clampLayerPatch({ gainDb: spec.gainDb, pan: spec.pan });
        return {
          layerId: `${laneId}-${index + 1}`,
          presetId: spec.presetId,
          gainDb: levels.gainDb ?? 0,
          pan: levels.pan ?? 0,
          delay: { enabled: false, timeMs: 5, feedback: 0, wet: 0 },
        };
      };
      this.voiceLayers[laneId] = [toLayer(entry.main, 0), toLayer(entry.layer, 1)];

      const mainKey = `${laneId}:${entry.main.presetId}`;
      if (!(options.respectSaved && this.settings[mainKey])) {
        this.settings[mainKey] = {
          ...getPresetDefaults(category, entry.main.presetId),
          ...entry.main.overrides,
        };
      }
      this.layerOverrides[`${laneId}-2`] = {
        ...getPresetDefaults(category, entry.layer.presetId),
        ...entry.layer.overrides,
      };
      this.laneFx[laneId] = JSON.parse(JSON.stringify(entry.fx));
      if (this.isInitialized) this.rebuildVoice(laneId);
    });
    // setSpace rebuilds every lane chain (with the new laneFx) when running.
    await this.setSpace(space);
    this.notifyChange();
  }

  // ---------------------------------------------------------------------

  /** Sets the master level in dB, clamped to FAMILY_LOUDNESS.masterRangeDb and
   *  ramped (owner decision 2026-09-27/28: replaces the old linear 0..1
   *  `setMasterVolume`). Since 2026-10-01 this is the shared
   *  `createMasterBus`'s own setMasterDb (clamp + 0.1 s linear ramp). */
  setMasterDb(db: number): void {
    // Also capped at 120% (clampMasterDb); the bus's limiter and ceiling
    // clipper keep that level at or below FAMILY_LOUDNESS.ceilingDbtp.
    this.masterBus.setMasterDb(clampMasterDb(db));
  }

  /** Mute/solo (ISSUE-BEATBOX-011): ramps a single lane's own bus gain to
   *  0/1, the same short ramp setMasterVolume uses to avoid a click. Only
   *  the bus is touched — the layer chain feeding it (and its overrides)
   *  keeps running, so unmuting is instant and doesn't retrigger anything.
   *  "Which lanes should be audible" is decided by the caller
   *  (isLaneAudible in sequencerStore.ts); this just applies the result. A
   *  no-op if the lane isn't registered (removed mid-toggle, or a stale id). */
  setLaneAudible(laneId: string, audible: boolean): void {
    this.buses[laneId]?.gain.rampTo(audible ? 1 : 0, 0.01);
  }

  getMasterDb(): number {
    return this.masterBus.getMasterDb();
  }

  /** Read counterpart to the private lastError slot set by buildLayer()'s
   *  catch (ISSUE-BEATBOX-014, audit finding 2) — not yet wired to any UI. */
  getLastError(): { laneId: string; message: string } | null {
    return this.lastError;
  }

  /**
   * Render a whole pattern to raw audio, offline.
   *
   * Replaces a real-time recording through Tone.Recorder, which handed back an
   * empty blob in a headless browser and depended on MediaRecorder's choice of
   * codec even when it worked. This is deterministic, faster than real time,
   * and produces samples this app can write as a real WAV.
   */
  async renderPattern(options: {
    /** The grid's lanes, in the same order as its rows (P2-17) — needed to
     *  resolve each row's category and find its registered voice/layers. */
    lanes: Lane[];
    grid: boolean[][];
    /** Sub-sound steps, `subGrid[lane][layerIndex - 1][step]`. Omitted, or
     *  missing for a layer: that sub plays on the main steps (pre-v3). */
    subGrid?: boolean[][][];
    bars: number;
    resolution: number;
    bpm: number;
    /** Per-cell accent (P2-16), same shape as `grid`. Omitted: every hit
     *  renders at the mid/default velocity, matching pre-P2-16 files. */
    accents?: Accent[][];
    /** 0..MAX_SWING percent (P2-16). Omitted or 0: straight time. */
    swing?: number;
    /** Time after the last step, so a long tail is not cut off. */
    tailSeconds?: number;
  }): Promise<RenderedAudio | null> {
    const { lanes, grid, subGrid, bars, resolution, bpm, accents, swing = 0, tailSeconds = 2 } =
      options;
    const totalSteps = bars * resolution;
    const stepDuration = 60 / bpm / (resolution / 4);
    const swingOffset = (swing / 100) * stepDuration;
    const length = EXPORT_START + totalSteps * stepDuration + swingOffset + tailSeconds;

    const laneLayers = lanes.map((lane) =>
      (this.voiceLayers[lane.id] ?? []).map((layer, index) => ({
        layer,
        preset: getPreset(lane.category, layer.presetId),
        overrides: this.overridesForLayer(lane.id, index),
      }))
    );

    const laneFx = lanes.map((lane) => this.laneFx[lane.id] ?? {});
    const space = { ...this.spaceSettings };

    const buffer = await runOffline(async () => {
      // Fixed export level (ISSUE-BEATBOX-016, D-2): not the live master
      // volume, so the file is reproducible regardless of what the slider
      // happened to be set to when it was rendered. Left as this project's
      // pre-existing 0.7 linear (~-3.1 dB), unrelated to the live engine's
      // FAMILY_LOUDNESS.defaultMasterDb (owner decision 2026-09-27/28: not
      // changed here, since a saved file's level should stay stable across a
      // master-default change too) -- each layer's own per-sound
      // normalisation (measureNormalizationGain, live playback only) still
      // does NOT run in this offline render either, so an exported file's
      // relative sound-to-sound balance is this project's original,
      // un-normalised one, only the overall level is fixed.
      // The export's safety limiter: exactly what Tone.Limiter(-1) builds
      // internally (a Tone.Compressor with ratio 20, attack 3 ms, release
      // 10 ms, Tone's default 30 dB knee). Like the lane compressors it is
      // cold when built; EXPORT_PREROLL_SECONDS lets it settle before the
      // first hit.
      const limiter = new Tone.Compressor({
        threshold: -1,
        ratio: 20,
        attack: 0.003,
        release: EXPORT_LIMITER_RELEASE_SECONDS,
        knee: 30,
      }).toDestination();
      const master = new Tone.Gain(0.7).connect(limiter);
      // Same effects as live playback: the shared space and each lane's chain.
      const shared = laneFx.some(usesSpace) ? buildSharedSpace(space, master, bpm) : null;

      laneLayers.forEach((layers, laneIndex) => {
        const lane = grid[laneIndex];
        if (!lane) return;
        // ISSUE-BEATBOX-016 (D-1): WAV reflects what the app currently
        // sounds like, so a muted lane (or one left out by another lane's
        // solo) is skipped — unlike MIDI, which stays authored-as-is
        // (see the `presets`/lanes doc comment on MidiExportOptions).
        const laneInfo = lanes[laneIndex];
        if (laneInfo && !isLaneAudible(lanes, laneInfo.id)) return;
        const laneChain = buildLaneChain(laneFx[laneIndex], master, shared);
        const laneIn = laneChain.input;

        layers.forEach(({ layer, preset, overrides }, layerIndex) => {
          if (!preset) return;
          const steps =
            layerIndex === 0 ? lane : (subGrid?.[laneIndex]?.[layerIndex - 1] ?? lane);
          const params = resolveParams(preset, overrides);
          const chainIn = offlineLayerChain(layer, laneIn);

          // One instrument would be retriggered faster than its own envelope on a
          // busy lane - a 16th-note hat, say. Live that is fine, because each
          // trigger is scheduled as it happens; offline every hit is scheduled up
          // front, and the parameter timeline eventually rejects an event that
          // does not come strictly after the last. Real drum machines answer this
          // with several voices per part, so this does too.
          const pool = Array.from({ length: VOICES_PER_LANE }, () => {
            const instrument = createInstrument(preset.type, params);
            instrument?.connect(chainIn);
            return instrument;
          }).filter((instrument): instrument is DrumInstrument => instrument !== null);
          if (pool.length === 0) return;

          let hit = 0;
          steps.forEach((on, step) => {
            if (!on) return;
            const instrument = pool[hit++ % pool.length];
            // Classic swing: every other step lands a little late.
            const at =
              EXPORT_START + step * stepDuration + (step % 2 === 1 ? swingOffset : 0);
            const accent = accents?.[laneIndex]?.[step] ?? DEFAULT_ACCENT;
            triggerVoiceAt(instrument, preset, at, ACCENT_VELOCITY[accent]);
          });
        });
      });
      if (shared) await shared.reverb.ready;
    }, length);

    return trimmed(buffer, EXPORT_START);
  }

  /**
   * Render one drum, on its own, to raw audio.
   *
   * Rendered offline rather than recorded: a recording would arrive in
   * whatever codec the browser prefers (usually WebM), and a sampler cannot
   * load that. This returns samples, which src/export/wav.ts turns into a real
   * WAV. Offline means it is also faster than real time and unaffected by
   * whatever else is making noise.
   */
  async renderOneShot(laneId: string, seconds = 2): Promise<RenderedAudio | null> {
    const category = this.laneCategory[laneId];
    const layers = (this.voiceLayers[laneId] ?? []).map((layer, index) => ({
      layer,
      preset: getPreset(category, layer.presetId),
      overrides: this.overridesForLayer(laneId, index),
    }));
    if (!layers.some(({ preset }) => preset)) return null;

    const fx = this.laneFx[laneId] ?? {};
    const space = { ...this.spaceSettings };

    const buffer = await runOffline(async () => {
      // Fixed export level (ISSUE-BEATBOX-016, D-2): same 0.7 as
      // renderPattern, so a one-shot isn't 3 dB hotter than a pattern render.
      // Same note as renderPattern above: unrelated to the live engine's
      // FAMILY_LOUDNESS.defaultMasterDb, and this render also skips
      // measureNormalizationGain, so the exported one-shot is at this
      // preset's own raw level, only the overall gain stage is fixed.
      const out = new Tone.Gain(0.7).toDestination();
      // The lane's own effects, so a sampler plays back what the app plays.
      const shared = usesSpace(fx) ? buildSharedSpace(space, out, this.bpm) : null;
      const laneChain = buildLaneChain(fx, out, shared);
      const laneIn = laneChain.input;
      layers.forEach(({ layer, preset, overrides }) => {
        if (!preset) return;
        const instrument = createInstrument(preset.type, resolveParams(preset, overrides));
        if (!instrument) return;
        instrument.connect(offlineLayerChain(layer, laneIn));
        triggerVoiceAt(instrument, preset, EXPORT_START);
      });
      if (shared) await shared.reverb.ready;
    }, EXPORT_PREROLL_SECONDS + seconds);

    return trimmed(buffer, EXPORT_START);
  }

  dispose(): void {
    Object.keys(this.instruments).forEach((laneId) => {
      this.instruments[laneId].forEach((voice) => this.disposeVoice(voice));
      this.instruments[laneId] = [];
      this.buses[laneId].dispose();
      if (this.laneChains[laneId]) disposeLaneChain(this.laneChains[laneId]);
    });
    this.laneChains = {};
    if (this.sharedSpace) disposeSharedSpace(this.sharedSpace);
    this.sharedSpace = null;
    this.masterInput.dispose();
    this.masterBus.dispose();
    this.isInitialized = false;
  }
}
