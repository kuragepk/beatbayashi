// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Sound lab (measurement only, not part of the app build). Loaded by
// tools/sound-lab/index.html in a real browser, driven by run.mjs. It renders
// the app's own voices through the app's own AudioEngine offline renderer and
// reports numbers; nothing here changes how the app sounds.
//
// Levels follow the live app: each layer gets the per-sound loudness
// normalisation gain (measureNormalizationGain) added to its layer gain, as
// buildLayer's normGain does live. The export path skips that gain, so a WAV
// from the app's Export button is not at these relative levels.
import * as Tone from 'tone';
import { measureShortSoundLoudness } from '@otoinki/loudness';
import { analyse, r2, wavBase64, type Metrics } from './analysis';
import { CYMBAL_TARGETS } from '../../src/audio/cymbalTargets';
import { CymbalSynth } from '../../src/audio/CymbalSynth';
import { AudioEngine, measureNormalizationGain, renderLayerHit, type RenderedAudio } from '../../src/audio/AudioEngine';
import {
  DEFAULT_LANES,
  SYNTH_PRESETS,
  getPreset,
  getPresetDefaults,
  type DrumId,
} from '../../src/audio/synthPresets';
import { SOUND_BASES, SOUND_SPACES, GENRE_BPM, type SoundBasis } from '../../src/audio/soundBasis';
import { PRESETS, type PatternGenre } from '../../src/presets';

const SAMPLE_RATE = 44100;

// -------------------------------------------------------------- engine -----

/* eslint-disable @typescript-eslint/no-explicit-any */
let engine: any = null;

function getEngine(): any {
  if (!engine) {
    Tone.setContext(new Tone.Context(new AudioContext({ sampleRate: SAMPLE_RATE })));
    engine = new AudioEngine();
    DEFAULT_LANES.forEach((lane) => engine.registerLane(lane));
  }
  return engine;
}

function resolveParams(category: DrumId, presetId: string, overrides: Record<string, number>) {
  const preset = getPreset(category, presetId)!;
  const params: Record<string, unknown> = JSON.parse(JSON.stringify(preset.params));
  Object.entries(overrides).forEach(([key, value]) => {
    if (['attack', 'decay', 'release'].includes(key)) {
      params.envelope = { ...((params.envelope ?? {}) as object), [key]: value };
    } else params[key] = value;
  });
  return params;
}

/** Adds each layer's own normalisation gain (live behaviour) to its gainDb. */
async function applyNormalisation(e: any, laneId: string, category: DrumId): Promise<number[]> {
  const gains: number[] = [];
  const layers = e.voiceLayers[laneId] as { presetId: string; gainDb: number }[];
  for (let i = 0; i < layers.length; i++) {
    const overrides = e.overridesForLayer(laneId, i) as Record<string, number>;
    const g = await measureNormalizationGain(category, layers[i].presetId, resolveParams(category, layers[i].presetId, overrides));
    const gDb = 20 * Math.log10(g);
    layers[i].gainDb += gDb;
    gains.push(r2(gDb));
  }
  return gains;
}

const NO_DELAY = { enabled: false, timeMs: 5, feedback: 0, wet: 0 };

function setSingleVoice(e: any, category: DrumId, presetId: string, overrides: Record<string, number>) {
  e.voiceLayers[category] = [{ layerId: `${category}-1`, presetId, gainDb: 0, pan: 0, delay: { ...NO_DELAY } }];
  e.settings[`${category}:${presetId}`] = { ...getPresetDefaults(category, presetId), ...overrides };
  e.laneFx[category] = {};
}

function resetEffects(e: any) {
  DEFAULT_LANES.forEach((l) => (e.laneFx[l.id] = {}));
  e.spaceSettings = { reverbDecay: 1, preDelay: 0.02, delayTime: '8n', delayFeedback: 0.2, returnHighpassHz: 300 };
}

function nodeTotal(before: Record<string, number>): { total: number; sources: number; byType: Record<string, number> } {
  const now = (window as any).__nodeCounts as Record<string, number>;
  const byType: Record<string, number> = {};
  let total = 0;
  for (const k of Object.keys(now)) {
    const d = now[k] - (before[k] ?? 0);
    if (d > 0) {
      byType[k] = d;
      total += d;
    }
  }
  const sources = (byType.OscillatorNode ?? 0) + (byType.AudioBufferSourceNode ?? 0) + (byType.ConstantSourceNode ?? 0) + (byType.createOscillator ?? 0) + (byType.createBufferSource ?? 0) + (byType.createConstantSource ?? 0);
  return { total, sources, byType };
}

async function median(times: number[]): Promise<number> {
  const s = [...times].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export interface VoiceReport extends Metrics {
  category: DrumId;
  presetId: string;
  normDb: number;
  nodesPerHit: number;
  sourcesPerHit: number;
  /** ms to render 16 hits (one bar of 16ths) of this voice alone; median of 5. */
  renderMs16: number;
  wav?: string;
}

async function renderVoice(
  category: DrumId,
  presetId: string,
  overrides: Record<string, number>,
  seconds: number,
  withWav: boolean
): Promise<VoiceReport> {
  const e = getEngine();
  resetEffects(e);
  setSingleVoice(e, category, presetId, overrides);
  const normDbs = await applyNormalisation(e, category, category);
  const before = { ...((window as any).__nodeCounts as Record<string, number>) };
  const audio = (await e.renderOneShot(category, seconds)) as RenderedAudio;
  const nodes = nodeTotal(before);
  // CPU proxy: wall time to render a bar of 16ths of this voice alone.
  const grid = DEFAULT_LANES.map((l) => Array.from({ length: 16 }, () => l.id === category));
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await e.renderPattern({ lanes: DEFAULT_LANES, grid, bars: 1, resolution: 16, bpm: 120, tailSeconds: 0.2 });
    times.push(performance.now() - t0);
  }
  return {
    category,
    presetId,
    normDb: normDbs[0],
    ...analyse(audio),
    nodesPerHit: nodes.total,
    sourcesPerHit: nodes.sources,
    renderMs16: r2(await median(times)),
    ...(withWav ? { wav: wavBase64(audio) } : {}),
  };
}

async function loadBasis(e: any, basis: SoundBasis, genre: PatternGenre) {
  // Not initialised (no live graph): applySoundBasis only sets the data.
  await e.applySoundBasis(SOUND_BASES[basis][genre], SOUND_SPACES[basis][genre]);
}

export interface LaneBasisReport extends Metrics {
  basis: SoundBasis;
  genre: PatternGenre;
  main: string;
  layer: string;
  nodesPerHit: number;
}

/** One lane of one genre/basis alone: both layers, lane fx, space. */
async function renderLaneBasis(basis: SoundBasis, genre: PatternGenre, lane: DrumId, seconds: number): Promise<LaneBasisReport> {
  const e = getEngine();
  resetEffects(e);
  await loadBasis(e, basis, genre);
  await applyNormalisation(e, lane, lane);
  const before = { ...((window as any).__nodeCounts as Record<string, number>) };
  const audio = (await e.renderOneShot(lane, seconds)) as RenderedAudio;
  const entry = SOUND_BASES[basis][genre][lane];
  return {
    basis,
    genre,
    main: entry.main.presetId,
    layer: entry.layer.presetId,
    ...analyse(audio),
    nodesPerHit: nodeTotal(before).total,
  };
}

export interface PatternReport {
  basis: SoundBasis;
  genre: PatternGenre;
  presetId: string;
  mix: Metrics;
  /** Solo LUFS per lane, to read the kit balance. */
  laneLufs: Record<string, number>;
  /** Peak of the mixed render, dBFS; the export limiter sits at -1. */
  wav?: string;
}

async function renderPattern(basis: SoundBasis, genre: PatternGenre, presetId: string, withWav: boolean): Promise<PatternReport> {
  const e = getEngine();
  resetEffects(e);
  await loadBasis(e, basis, genre);
  for (const lane of DEFAULT_LANES) await applyNormalisation(e, lane.id, lane.category);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const bars = 2;
  const full = preset.grid.map((row) => [...row, ...row].map((x) => x === 1));
  const run = (grid: boolean[][]) =>
    e.renderPattern({ lanes: DEFAULT_LANES, grid, bars, resolution: 16, bpm: preset.bpm, tailSeconds: 1.2 }) as Promise<RenderedAudio>;
  const mix = await run(full);
  const laneLufs: Record<string, number> = {};
  for (let i = 0; i < DEFAULT_LANES.length; i++) {
    const solo = full.map((row, j) => (j === i ? row : row.map(() => false)));
    if (!solo[i].some(Boolean)) continue;
    const a = await run(solo);
    laneLufs[DEFAULT_LANES[i].id] = r2(measureShortSoundLoudness(a.channels, a.sampleRate, a.channels.length).integratedLufs);
  }
  return {
    basis,
    genre,
    presetId,
    mix: analyse(mix),
    laneLufs,
    ...(withWav ? { wav: wavBase64(mix) } : {}),
  };
}


/** Each cymbal preset against its floors (src/audio/cymbalTargets.ts). */
async function checkTargets(): Promise<{ presetId: string; ok: boolean; failures: string[]; metrics: Metrics }[]> {
  const out = [];
  for (const [presetId, t] of Object.entries(CYMBAL_TARGETS)) {
    const r = await renderVoice('cymbal', presetId, {}, 3, false);
    const failures: string[] = [];
    if (r.decay20 < t.minDecay20) failures.push(`decay20 ${r.decay20} < ${t.minDecay20}`);
    if (r.decay40 < t.minDecay40) failures.push(`decay40 ${r.decay40} < ${t.minDecay40}`);
    if (r.pctBelow2k < t.minPctBelow2k) failures.push(`below2k ${r.pctBelow2k} < ${t.minPctBelow2k}`);
    if (r.pctAbove6k > t.maxPctAbove6k) failures.push(`above6k ${r.pctAbove6k} > ${t.maxPctAbove6k}`);
    if (r.centroidHz > t.maxCentroidHz) failures.push(`centroid ${r.centroidHz} > ${t.maxCentroidHz}`);
    out.push({ presetId, ok: failures.length === 0, failures, metrics: r });
  }
  return out;
}

/** One live-style instrument hit 16 times, a 16th apart at 124 BPM (the
 *  engine's live path reuses one instrument; the offline path uses a pool of 4).
 *  Reports the peak of each hit's first 20 ms: they must be steady, not
 *  silent or doubled. */
async function retrigger(presetId: string, bpm: number, patch: Record<string, unknown> = {}): Promise<{ peaks: number[]; ok: boolean }> {
  const step = 60 / bpm / 4;
  const params = { ...JSON.parse(JSON.stringify(getPreset('cymbal', presetId)!.params)), ...patch };
  const buffer = await Tone.Offline(() => {
    const voice = new CymbalSynth(params);
    voice.connect(Tone.getDestination() as unknown as Tone.InputNode);
    for (let i = 0; i < 16; i++) voice.trigger(0.05 + i * step, 1);
  }, 0.05 + 16 * step + 0.5);
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const peaks: number[] = [];
  for (let i = 0; i < 16; i++) {
    const from = Math.round((0.05 + i * step) * sr);
    let pk = 0;
    for (let k = from; k < from + Math.round(0.02 * sr); k++) pk = Math.max(pk, Math.abs(data[k] ?? 0));
    peaks.push(r2(20 * Math.log10(Math.max(pk, 1e-9))));
  }
  const spread = Math.max(...peaks) - Math.min(...peaks);
  return { peaks, ok: Number.isFinite(spread) && spread < 8 && Math.min(...peaks) > -80 };
}

export interface MatchReport {
  category: DrumId;
  presetId: string;
  /** The layer's normalisation gain, dB. */
  normDb: number;
  /** One entry per render: the layer's output (pan hard left, so one channel carries the whole signal, which is the web's own measurement setup). */
  lufs: number[];
  truePeakDbfs: number[];
  wav?: string;
}

/** The web side of the web-versus-phone loudness comparison (2026-10-29): one
 *  preset alone through the live layer chain (its normalisation gain and, for
 *  marked presets, the soft peak limiter; renderLayerHit), rendered `runs`
 *  times (the noise differs per hit) and measured the way
 *  measureNormalizationGain does (short-sound BS.1770 over every channel).
 *  The WAV is the left channel (the signal at full level), mono, comparable
 *  with the phone's mono WAVs. */
async function renderMatch(category: DrumId, presetId: string, runs: number, withWav: boolean): Promise<MatchReport> {
  getEngine();
  const params = resolveParams(category, presetId, {});
  const normDb = 20 * Math.log10(await measureNormalizationGain(category, presetId, params));
  const lufs: number[] = [];
  const truePeakDbfs: number[] = [];
  let wav: string | undefined;
  for (let r = 0; r < runs; r++) {
    const audio = await renderLayerHit(category, presetId, params, r % 8);
    if (!audio) throw new Error(`no render for ${category}/${presetId}`);
    const m = measureShortSoundLoudness(audio.channels, audio.sampleRate, audio.channels.length);
    lufs.push(r2(m.integratedLufs));
    truePeakDbfs.push(r2(m.truePeakDbfs));
    if (r === 0 && withWav) wav = wavBase64({ sampleRate: audio.sampleRate, channels: [audio.channels[0]] });
  }
  return { category, presetId, normDb: r2(normDb), lufs, truePeakDbfs, ...(wav ? { wav } : {}) };
}

(window as any).Tone = Tone;
(window as any).lab = {
  checkTargets,
  retrigger,
  ready: true,
  sampleRate: SAMPLE_RATE,
  presetCatalog: () =>
    (Object.keys(SYNTH_PRESETS) as DrumId[]).map((cat) => ({ cat, ids: Object.keys(SYNTH_PRESETS[cat]) })),
  genres: () => Object.keys(GENRE_BPM),
  patternsOf: (genre: string) => PRESETS.filter((p) => p.genre === genre).map((p) => p.id),
  renderVoice,
  renderMatch,
  renderLaneBasis,
  renderPattern,
  /** Exploration only: patch a preset's params in memory. */
  mutate: (cat: DrumId, id: string, patch: Record<string, unknown>) => {
    const preset = getPreset(cat, id)!;
    preset.params = { ...preset.params, ...patch };
  },
};
