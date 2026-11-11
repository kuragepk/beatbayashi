// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Tone.js needs a real (or fully-featured) Web Audio API, which vitest's test
// environment doesn't provide, so every Tone.js class AudioEngine touches is
// replaced here with a small spy-tracking fake. The fakes mirror only the
// surface AudioEngine actually calls (connect/dispose, triggerAttackRelease,
// and the gain/pan/delayTime/feedback/wet values it reads and sets), which is
// enough to observe the multi-layer wiring from ISSUE-LAYER-001 §8-b without
// ever producing real audio. Assertions check the fakes' recorded state, not
// "did a mock get called" for its own sake — each test ties back to a
// specific wiring claim (both layers fire, layer caps are enforced, a
// disabled delay is wet=0 while an enabled one isn't).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MASTER_DB, NORMAL_MASTER_DB } from '../store/masterVolume';

const mocks = vi.hoisted(() => {
  type InstrumentBucket =
    | 'membrane'
    | 'noise'
    | 'metal'
    | 'cymbal'
    | 'fm'
    | 'am'
    | 'mono'
    | 'duo'
    | 'synth'
    | 'pluck';

  /** The Tone context a fake node is "built on": the live one, or, while
   *  the fake Offline below runs its callback, that render's own offline
   *  context (time 0). Lets a test tell which clock a schedule used. */
  const toneContexts = {
    offline: null as null | { currentTime: number },
    live: { get currentTime() { return rawContext.currentTime; } },
  };

  class FakeNode {
    context = toneContexts.offline ?? toneContexts.live;
    connect = vi.fn((_destination?: unknown) => this);
    disconnect = vi.fn();
    dispose = vi.fn();
    toDestination = vi.fn(() => this);
  }

  class FakeInstrument extends FakeNode {
    triggerAttackRelease = vi.fn();
    triggerAttack = vi.fn();
    params: unknown;
    constructor(params: unknown) {
      super();
      this.params = params;
    }
  }

  /** ISSUE-BEATBOX-014 (audit finding 1): a real Tone.MetalSynth builds
   *  `frequency` as a plain Signal, ignoring any `frequency` constructor
   *  option — this fake mirrors exactly that (constructor doesn't read
   *  params.frequency), so a test can tell "AudioEngine assigns it after
   *  construction" apart from "the constructor happened to set it". */
  class FakeMetalSynth extends FakeInstrument {
    frequency = { value: 0 };
  }

  const instrumentInstances: Record<InstrumentBucket, FakeInstrument[]> = {
    membrane: [],
    noise: [],
    metal: [],
    cymbal: [],
    fm: [],
    am: [],
    mono: [],
    duo: [],
    synth: [],
    pluck: [],
  };

  function makeInstrumentClass(bucket: InstrumentBucket) {
    return class extends FakeInstrument {
      constructor(params: unknown) {
        super(params);
        instrumentInstances[bucket].push(this);
      }
    };
  }

  /** Metal (cymbal family) gets its own tracked array, rather than going
   *  through makeInstrumentClass/instrumentInstances, because it's the one
   *  bucket with an extra field (frequency) a test needs to read directly. */
  const metalInstances: FakeMetalSynth[] = [];
  class MetalSynthClass extends FakeMetalSynth {
    constructor(params: unknown) {
      super(params);
      instrumentInstances.metal.push(this as unknown as FakeInstrument);
      metalInstances.push(this);
    }
  }

  /** 2026-10-27: the cymbal family (hats, ride, crash) is src/audio/CymbalSynth.ts,
   *  not Tone.MetalSynth. The engine reads its `frequency` (the MIDI export and the
   *  slider do) and fires it with trigger(time, velocity): the note length is
   *  ignored, a cymbal rings out for its own decay. Mocked as a module below,
   *  so the real class (which builds Tone.Oscillator and friends) never runs. */
  const cymbalInstances: CymbalFake[] = [];
  class CymbalFake extends FakeInstrument {
    frequency: { value: number };
    trigger = vi.fn();
    constructor(params: unknown) {
      super(params);
      this.frequency = { value: (params as { frequency?: number }).frequency ?? 0 };
      instrumentInstances.cymbal.push(this as unknown as FakeInstrument);
      cymbalInstances.push(this);
    }
  }

  class FakeGain extends FakeNode {
    static instances: FakeGain[] = [];
    gain: { value: number; rampTo: (...args: unknown[]) => void };
    constructor(value = 0, _units?: string) {
      super();
      this.gain = { value, rampTo: vi.fn() };
      FakeGain.instances.push(this);
    }
  }

  class FakePanner extends FakeNode {
    static instances: FakePanner[] = [];
    pan: { value: number };
    constructor(pan = 0) {
      super();
      this.pan = { value: pan };
      FakePanner.instances.push(this);
    }
  }

  class FakeFeedbackDelay extends FakeNode {
    static instances: FakeFeedbackDelay[] = [];
    delayTime: { value: number };
    feedback: { value: number };
    wet: { value: number };
    constructor(delayTime = 0, feedback = 0) {
      super();
      this.delayTime = { value: delayTime };
      this.feedback = { value: feedback };
      // Real Tone.FeedbackDelay defaults wet to 1; AudioEngine always sets it
      // explicitly right after construction, so the default here doesn't
      // matter for the assertions, only that it's settable/readable.
      this.wet = { value: 1 };
      FakeFeedbackDelay.instances.push(this);
    }
  }

  /** REL-004's output ceiling. Records the threshold so a test can assert
   *  the -1 dBFS setting; FakeNode already covers toDestination()/dispose(). */
  class FakeLimiter extends FakeNode {
    static instances: FakeLimiter[] = [];
    threshold: { value: number };
    constructor(threshold = 0) {
      super();
      this.threshold = { value: threshold };
      FakeLimiter.instances.push(this);
    }
  }

  /** Sound-basis effect chain: records its constructor options so a test
   *  can check the type (a high-pass before the shared reverb) and values. */
  class FakeFilter extends FakeNode {
    static instances: FakeFilter[] = [];
    options: { type?: string; frequency?: number; Q?: number; rolloff?: number };
    constructor(options: FakeFilter['options'] = {}) {
      super();
      this.options = options;
      FakeFilter.instances.push(this);
    }
  }

  class FakeDistortion extends FakeNode {
    static instances: FakeDistortion[] = [];
    distortion: number;
    wet = { value: 1 };
    constructor(amount = 0.4) {
      super();
      this.distortion = amount;
      FakeDistortion.instances.push(this);
    }
  }

  class FakeCompressor extends FakeNode {
    static instances: FakeCompressor[] = [];
    options: Record<string, number>;
    // Tone.Compressor's release Param: records automation so a test can see
    // the cold-start window (2026-10-01).
    release: {
      value: number;
      events: Array<[kind: 'set' | 'cancel', value: number, time: number]>;
      setValueAtTime: (value: number, time: number) => void;
      linearRampToValueAtTime: (value: number, time: number) => void;
      cancelScheduledValues: (time: number) => void;
    };
    constructor(options: Record<string, number> = {}) {
      super();
      this.options = options;
      const events: Array<[kind: 'set' | 'cancel', value: number, time: number]> = [];
      this.release = {
        value: options.release ?? 0.25,
        events,
        setValueAtTime: (value, time) => { events.push(['set', value, time]); },
        linearRampToValueAtTime: (value, time) => { events.push(['set', value, time]); },
        cancelScheduledValues: (time) => { events.push(['cancel', 0, time]); },
      };
      FakeCompressor.instances.push(this);
    }
  }

  /** Tone.Delay: the look-ahead alignment delay a lane gets in place of a
   *  neutral (ratio 1) compressor (2026-10-01). */
  class FakeDelay extends FakeNode {
    static instances: FakeDelay[] = [];
    delayTime: { value: number };
    maxDelay: number | undefined;
    constructor(delayTime = 0, maxDelay?: number) {
      super();
      this.delayTime = { value: delayTime };
      this.maxDelay = maxDelay;
      FakeDelay.instances.push(this);
    }
  }

  /** Tone.Reverb generates its impulse response asynchronously; `ready` is
   *  what AudioEngine must await. Tracked so a test can see it was awaited. */
  class FakeReverb extends FakeNode {
    static instances: FakeReverb[] = [];
    options: { decay?: number; preDelay?: number; wet?: number };
    readyAwaited = false;
    constructor(options: FakeReverb['options'] = {}) {
      super();
      this.options = options;
      FakeReverb.instances.push(this);
    }
    get ready(): Promise<void> {
      this.readyAwaited = true;
      return Promise.resolve();
    }
  }

  /** P2-14: a spy-tracking stand-in for the Tone.Transport singleton, just
   *  detailed enough to assert what AudioEngine's transport methods do to it
   *  (scheduleRepeat's interval string, bpm.value, start/stop/clear calls). */
  const fakeTransport = {
    bpm: { value: 120 },
    scheduleRepeat: vi.fn((_callback: (time: number) => void, _interval: string) => 1),
    clear: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };

  const fakeDraw = {
    schedule: vi.fn((callback: () => void, _time: number) => callback()),
  };

  /** ISSUE-BEATBOX-016: renderPattern/renderOneShot run their callback inside
   *  Tone.Offline and read the returned buffer's channel data. This fake runs
   *  the callback synchronously (so the instrument spies inside it are
   *  populated by the time the test inspects them) and hands back a buffer
   *  just detailed enough for `trimmed()` to produce a RenderedAudio. */
  const defaultOffline = async (callback: () => void, _duration: number) => {
    toneContexts.offline = { currentTime: 0 };
    try {
      callback();
    } finally {
      toneContexts.offline = null;
    }
    return {
      sampleRate: 44100,
      numberOfChannels: 2,
      getChannelData: () => new Float32Array(16),
    };
  };
  const Offline = vi.fn(defaultOffline);

  function resetAll() {
    (Object.keys(instrumentInstances) as InstrumentBucket[]).forEach((bucket) => {
      instrumentInstances[bucket] = [];
    });
    metalInstances.length = 0;
    cymbalInstances.length = 0;
    FakeGain.instances = [];
    FakePanner.instances = [];
    FakeFeedbackDelay.instances = [];
    FakeLimiter.instances = [];
    rawContext.gains = [];
    rawContext.compressors = [];
    rawContext.currentTime = 0;
    rawContext.destination = new RawNode();
    FakeFilter.instances = [];
    FakeDistortion.instances = [];
    FakeCompressor.instances = [];
    FakeDelay.instances = [];
    FakeReverb.instances = [];
    fakeTransport.bpm.value = 120;
    fakeTransport.scheduleRepeat.mockClear();
    fakeTransport.clear.mockClear();
    fakeTransport.start.mockClear();
    fakeTransport.stop.mockClear();
    fakeDraw.schedule.mockClear();
    Offline.mockClear();
  }

  /** The live context's raw (Web Audio) context, which the shared
   *  @otoinki/loudness `createMasterBus` builds the master chain on. Records
   *  every node, connection and AudioParam event so a test can walk the
   *  graph the shared package actually built. */
  type ParamEvent = [kind: 'set' | 'ramp', value: number, time: number];
  class RawParam {
    value: number;
    events: ParamEvent[] = [];
    constructor(value = 0) {
      this.value = value;
    }
    setValueAtTime(value: number, time: number) {
      this.events.push(['set', value, time]);
    }
    linearRampToValueAtTime(value: number, time: number) {
      this.events.push(['ramp', value, time]);
    }
  }
  class RawNode {
    outputs: unknown[] = [];
    disconnected = false;
    connect(destination: unknown) {
      this.outputs.push(destination);
      return destination;
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  class RawGain extends RawNode {
    gain = new RawParam(1);
  }
  class RawCompressor extends RawNode {
    threshold = new RawParam(-24);
    knee = new RawParam(30);
    ratio = new RawParam(12);
    attack = new RawParam(0.003);
    release = new RawParam(0.25);
  }
  const rawContext = {
    currentTime: 0,
    destination: new RawNode(),
    gains: [] as RawGain[],
    compressors: [] as RawCompressor[],
    createGain() {
      const node = new RawGain();
      rawContext.gains.push(node);
      return node;
    },
    createDynamicsCompressor() {
      const node = new RawCompressor();
      rawContext.compressors.push(node);
      return node;
    },
  };

  const liveContext = { state: 'running', resume: vi.fn(async () => {}), now: () => 0, sampleRate: 44100, rawContext };

  return {
    toneContexts,
    liveContext,
    rawContext,
    instrumentInstances,
    metalInstances,
    cymbalInstances,
    CymbalFake,
    FakeGain,
    FakePanner,
    FakeFeedbackDelay,
    FakeLimiter,
    FakeFilter,
    FakeDistortion,
    FakeCompressor,
    FakeDelay,
    FakeReverb,
    fakeTransport,
    fakeDraw,
    Offline,
    defaultOffline,
    MembraneSynth: makeInstrumentClass('membrane'),
    NoiseSynth: makeInstrumentClass('noise'),
    MetalSynth: MetalSynthClass,
    FMSynth: makeInstrumentClass('fm'),
    AMSynth: makeInstrumentClass('am'),
    MonoSynth: makeInstrumentClass('mono'),
    DuoSynth: makeInstrumentClass('duo'),
    Synth: makeInstrumentClass('synth'),
    PluckSynth: makeInstrumentClass('pluck'),
    resetAll,
  };
});

vi.mock('./CymbalSynth', () => ({ CymbalSynth: mocks.CymbalFake }));

// The soft peak limiter's node is built from Tone.WaveShaper, which this file's
// fake 'tone' does not have; a plain recording fake stands in (what it computes
// is tested in drumLoudness.test.ts and measured in the sound lab).
vi.mock('./peakLimiter', () => {
  const instances: unknown[] = [];
  class PeakLimiterNode {
    input = { connect: vi.fn(), dispose: vi.fn() };
    output = { connect: vi.fn(), dispose: vi.fn() };
    dispose = vi.fn();
    constructor() {
      instances.push(this);
    }
    static instances = instances;
  }
  return { PeakLimiterNode };
});

vi.mock('tone', () => ({
  Gain: mocks.FakeGain,
  Panner: mocks.FakePanner,
  FeedbackDelay: mocks.FakeFeedbackDelay,
  Limiter: mocks.FakeLimiter,
  Filter: mocks.FakeFilter,
  Distortion: mocks.FakeDistortion,
  Compressor: mocks.FakeCompressor,
  Delay: mocks.FakeDelay,
  Reverb: mocks.FakeReverb,
  MembraneSynth: mocks.MembraneSynth,
  NoiseSynth: mocks.NoiseSynth,
  MetalSynth: mocks.MetalSynth,
  FMSynth: mocks.FMSynth,
  AMSynth: mocks.AMSynth,
  MonoSynth: mocks.MonoSynth,
  DuoSynth: mocks.DuoSynth,
  Synth: mocks.Synth,
  PluckSynth: mocks.PluckSynth,
  Transport: mocks.fakeTransport,
  Draw: mocks.fakeDraw,
  Offline: mocks.Offline,
  // One stable live context (AudioEngine pins live node construction to the
  // context it was created on, via getContext/setContext).
  getContext: () => mocks.liveContext,
  setContext: vi.fn(),
  start: vi.fn(async () => {}),
  now: vi.fn(() => 0),
  // Real Tone.dbToGain: 10^(db/20). AudioEngine uses this to scale a pluck
  // layer's per-hit accent gain (ISSUE-BEATBOX-014, audit finding 7) off
  // that layer's actual configured level rather than a fake stand-in value.
  dbToGain: (db: number) => Math.pow(10, db / 20),
}));

import {
  AudioEngine,
  EXPORT_PREROLL_SECONDS,
  MAX_LAYERS_PER_VOICE,
  MIN_LAYERS_PER_VOICE,
  NORMALIZATION_MEASURE_PAN,
  NORMALIZATION_CACHE_VERSION,
  NORMALIZATION_HITS,
  RENDER_QUANTUM_FRAMES,
  normalizationHitCount,
  combineHitMeasurements,
  compressorLookaheadSeconds,
  normalizationTriggerTime,
  loudnessCacheKey,
  measureNormalizationGain,
  stereoPannerGains,
  isNeutralCompressor,
  noteValueSeconds,
} from './AudioEngine';
import {
  DEFAULT_LAYERS,
  DEFAULT_LANES,
  getPresetDefaults,
  getPresetParameters,
  type Lane,
} from './synthPresets';
import { parsePresetFile } from './userPresets';
import {
  DEFAULT_LIMITER_COLD_START_SECONDS,
  FAMILY_LOUDNESS,
  MASTER_LIMITER,
  compressorMakeupGainDb,
  dbToLinear,
  gainForTarget,
  measureLoudness,
  measureShortSoundLoudness,
} from '@otoinki/loudness';
import { DRUM_LOUDNESS } from './drumLoudness';
import { PeakLimiterNode } from './peakLimiter';
import { SOUND_SPACES, SOUND_BASES } from './soundBasis';
import { readSoundDocument, startSoundAutosave, writeSoundDocument } from './soundPersistence';
import { LAYER_STORAGE_KEY } from './soundStorageKey';

/** Lets the per-sound normalisation renders an initialize() queued (eight
 *  per sound since 2026-10-01, run one after another by renderOffline's
 *  queue) finish, so they do not build fake instruments after a test has
 *  reset the mocks. The fake Offline is synchronous, so one macrotask turn
 *  drains the whole queue. */
function drainPendingRenders(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  await drainPendingRenders();
  mocks.resetAll();
});

describe('multi-layer playback (ISSUE-LAYER-001 §8-b.1)', () => {
  it('triggers every layer of a voice exactly once per playDrum call', async () => {
    // Default kick is two layers: MembraneSynth (membrane_808, the "芯") and
    // Synth (synth_blip, the "補助") — see DEFAULT_LAYERS.kick in synthPresets.ts.
    expect(DEFAULT_LAYERS.kick).toHaveLength(2);
    expect(DEFAULT_LAYERS.kick[0].presetId).toBe('membrane_808');
    expect(DEFAULT_LAYERS.kick[1].presetId).toBe('synth_blip');

    const engine = new AudioEngine();
    await engine.initialize();

    const membraneInstance = mocks.instrumentInstances.membrane[0];
    const synthInstance = mocks.instrumentInstances.synth[0];
    expect(membraneInstance).toBeDefined();
    expect(synthInstance).toBeDefined();

    engine.playDrum('kick');

    expect(membraneInstance.triggerAttackRelease).toHaveBeenCalledTimes(1);
    expect(synthInstance.triggerAttackRelease).toHaveBeenCalledTimes(1);

    // A second hit fires both again — layers stay in lockstep, not just on
    // the first trigger.
    engine.playDrum('kick');
    expect(membraneInstance.triggerAttackRelease).toHaveBeenCalledTimes(2);
    expect(synthInstance.triggerAttackRelease).toHaveBeenCalledTimes(2);
  });
});

describe('layer count limits (ISSUE-LAYER-001 §8-b.2)', () => {
  it('refuses a 3rd layer once a voice already has MAX_LAYERS_PER_VOICE', async () => {
    expect(MAX_LAYERS_PER_VOICE).toBe(3);

    const engine = new AudioEngine();
    await engine.initialize();

    // kick starts with 2 layers by default; one more should reach the cap.
    expect(engine.getLayers('kick')).toHaveLength(2);
    const third = engine.addLayer('kick');
    expect(third).not.toBeNull();
    expect(engine.getLayers('kick')).toHaveLength(3);

    const fourth = engine.addLayer('kick');
    expect(fourth).toBeNull();
    expect(engine.getLayers('kick')).toHaveLength(3);
  });

  it('refuses to remove the last remaining layer', async () => {
    expect(MIN_LAYERS_PER_VOICE).toBe(1);

    const engine = new AudioEngine();
    await engine.initialize();

    const layers = engine.getLayers('kick');
    expect(layers).toHaveLength(2);

    expect(engine.removeLayer('kick', layers[0].layerId)).toBe(true);
    expect(engine.getLayers('kick')).toHaveLength(1);

    const [onlyLayer] = engine.getLayers('kick');
    expect(engine.removeLayer('kick', onlyLayer.layerId)).toBe(false);
    expect(engine.getLayers('kick')).toHaveLength(1);
  });
});

describe('delay wiring (ISSUE-LAYER-001 §8-b.3)', () => {
  it('wires a disabled delay to wet=0 and an enabled delay to wet>0', async () => {
    // DEFAULT_LAYERS.kick[0] (membrane_808) has delay.enabled=true; kick[1]
    // (synth_blip) has delay.enabled=false. Both still get a FeedbackDelay
    // node (every layer is routed through one) — what differs is the wet
    // amount, which is the actual audible difference in the output.
    expect(DEFAULT_LAYERS.kick[0].delay.enabled).toBe(true);
    expect(DEFAULT_LAYERS.kick[1].delay.enabled).toBe(false);

    const engine = new AudioEngine();
    await engine.initialize();

    const [enabledDelay, disabledDelay] = mocks.FakeFeedbackDelay.instances;
    expect(enabledDelay).toBeDefined();
    expect(disabledDelay).toBeDefined();

    expect(disabledDelay.wet.value).toBe(0);
    expect(enabledDelay.wet.value).toBeGreaterThan(0);
    expect(enabledDelay.wet.value).toBeCloseTo(DEFAULT_LAYERS.kick[0].delay.wet);
    expect(enabledDelay.delayTime.value).toBeCloseTo(DEFAULT_LAYERS.kick[0].delay.timeMs / 1000);
    expect(enabledDelay.feedback.value).toBeCloseTo(DEFAULT_LAYERS.kick[0].delay.feedback);

    // Both delay nodes are still live in the signal path (dry/wet is what
    // differs, not whether the node is wired at all).
    expect(enabledDelay.connect).toHaveBeenCalled();
    expect(disabledDelay.connect).toHaveBeenCalled();

    // Each layer's own gain feeds its own delay — confirms the two delay
    // nodes belong to two distinct layer chains, not one shared node.
    const gainConnectedToEnabled = mocks.FakeGain.instances.some((gain) =>
      gain.connect.mock.calls.some((call) => call[0] === enabledDelay)
    );
    const gainConnectedToDisabled = mocks.FakeGain.instances.some((gain) =>
      gain.connect.mock.calls.some((call) => call[0] === disabledDelay)
    );
    expect(gainConnectedToEnabled).toBe(true);
    expect(gainConnectedToDisabled).toBe(true);
  });

  it('enabling delay on a previously-dry layer rewires just that layer', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    const [, secondLayer] = engine.getLayers('kick');
    expect(secondLayer.delay.enabled).toBe(false);

    const beforeCount = mocks.FakeFeedbackDelay.instances.length;
    const ok = engine.updateLayer('kick', secondLayer.layerId, {
      delay: { enabled: true, timeMs: 30, feedback: 0.2, wet: 0.4 },
    });
    expect(ok).toBe(true);

    // Rebuilding one layer disposes its old delay node and makes a fresh one.
    expect(mocks.FakeFeedbackDelay.instances.length).toBe(beforeCount + 1);
    const newDelay =
      mocks.FakeFeedbackDelay.instances[mocks.FakeFeedbackDelay.instances.length - 1];
    expect(newDelay.wet.value).toBeCloseTo(0.4);
    expect(newDelay.delayTime.value).toBeCloseTo(0.03);
    expect(newDelay.feedback.value).toBeCloseTo(0.2);
  });
});

describe('layer-0 compatibility surface (ISSUE-LAYER-001 §8-a)', () => {
  it('getCurrentPreset/changeDrumPreset only ever touch layer 0', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    expect(engine.getCurrentPreset('kick')).toBe('membrane_808');

    engine.changeDrumPreset('kick', 'membrane_909');
    expect(engine.getCurrentPreset('kick')).toBe('membrane_909');

    // Layer 1 (synth_blip) is untouched by a layer-0-only API call.
    const layers = engine.getLayers('kick');
    expect(layers[0].presetId).toBe('membrane_909');
    expect(layers[1].presetId).toBe('synth_blip');
  });

  it('setSettings/getSettings round-trip per-preset overrides on layer 0', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    engine.setSettings('kick', { attack: 0.002, decay: 0.5, release: 1.5 });
    expect(engine.getSettings('kick')).toMatchObject({
      attack: 0.002,
      decay: 0.5,
      release: 1.5,
    });

    engine.clearSettings('kick');
    // Back to the preset's own tuned defaults.
    expect(engine.getSettings('kick').decay).not.toBe(0.5);
  });
});

describe('LAYER-002 hardening (ranges, malformed saves, stale overrides)', () => {
  it('clamps gainDb/pan/timeMs/feedback/wet to documented ranges', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    const [firstLayer] = engine.getLayers('kick');

    // Way out of range in every direction, including the "wrong sign" cases.
    const ok = engine.updateLayer('kick', firstLayer.layerId, {
      gainDb: 999,
      pan: 999,
      delay: { enabled: true, timeMs: 999999, feedback: 999, wet: 999 },
    });
    expect(ok).toBe(true);

    const [clampedHigh] = engine.getLayers('kick');
    expect(clampedHigh.gainDb).toBe(6);
    expect(clampedHigh.pan).toBe(1);
    expect(clampedHigh.delay.timeMs).toBe(400);
    expect(clampedHigh.delay.feedback).toBe(0.6);
    expect(clampedHigh.delay.wet).toBe(1);

    const ok2 = engine.updateLayer('kick', firstLayer.layerId, {
      gainDb: -999,
      pan: -999,
      delay: { enabled: true, timeMs: -999, feedback: -999, wet: -999 },
    });
    expect(ok2).toBe(true);

    const [clampedLow] = engine.getLayers('kick');
    expect(clampedLow.gainDb).toBe(-24);
    expect(clampedLow.pan).toBe(-1);
    expect(clampedLow.delay.timeMs).toBe(5);
    expect(clampedLow.delay.feedback).toBe(0);
    expect(clampedLow.delay.wet).toBe(0);

    // addLayer's own hardcoded starting patch is routed through the same
    // clamp, so a freshly added layer is in range too.
    const added = engine.addLayer('kick');
    expect(added).not.toBeNull();
    expect(added!.gainDb).toBeGreaterThanOrEqual(-24);
    expect(added!.gainDb).toBeLessThanOrEqual(6);
    expect(added!.delay.timeMs).toBeGreaterThanOrEqual(5);
    expect(added!.delay.timeMs).toBeLessThanOrEqual(400);
  });

  it('loadAllLayers ignores malformed layers instead of feeding NaN into Tone', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    const goodLayer = {
      layerId: 'kick-good',
      presetId: 'membrane_909',
      gainDb: -3,
      pan: 0.2,
      delay: { enabled: true, timeMs: 40, feedback: 0.2, wet: 0.3 },
    };

    engine.loadAllLayers({
      kick: [
        goodLayer,
        // Missing delay entirely.
        { layerId: 'kick-no-delay', presetId: 'membrane_808', gainDb: 0, pan: 0 } as never,
        // NaN gainDb.
        {
          layerId: 'kick-nan',
          presetId: 'membrane_808',
          gainDb: NaN,
          pan: 0,
          delay: { enabled: false, timeMs: 10, feedback: 0, wet: 0 },
        } as never,
        // Unknown presetId.
        {
          layerId: 'kick-bad-preset',
          presetId: 'does_not_exist',
          gainDb: 0,
          pan: 0,
          delay: { enabled: false, timeMs: 10, feedback: 0, wet: 0 },
        } as never,
        // Delay with a non-numeric field.
        {
          layerId: 'kick-bad-delay',
          presetId: 'membrane_808',
          gainDb: 0,
          pan: 0,
          delay: { enabled: true, timeMs: 'a lot', feedback: 0, wet: 0 },
        } as never,
      ],
      tom: [],
      cymbal: [],
      clap: [],
    } as never);

    // Only the one well-formed layer survives.
    const layers = engine.getLayers('kick');
    expect(layers).toHaveLength(1);
    expect(layers[0].layerId).toBe('kick-good');

    // Every Tone node built from the loaded state has finite params — no NaN
    // reached a Tone.js constructor.
    mocks.FakeGain.instances.forEach((gain) => {
      expect(Number.isFinite(gain.gain.value)).toBe(true);
    });
    mocks.FakePanner.instances.forEach((panner) => {
      expect(Number.isFinite(panner.pan.value)).toBe(true);
    });
    mocks.FakeFeedbackDelay.instances.forEach((delay) => {
      expect(Number.isFinite(delay.delayTime.value)).toBe(true);
      expect(Number.isFinite(delay.feedback.value)).toBe(true);
      expect(Number.isFinite(delay.wet.value)).toBe(true);
    });

    // tom/cymbal/clap had no saved layers at all (empty array) — they keep
    // their shipped defaults rather than being left voice-less.
    expect(engine.getLayers('tom').length).toBeGreaterThanOrEqual(1);
  });

  it('loadAllSettings drops only the malformed fields, keeping the rest (ISSUE-BEATBOX-015 finding 10)', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    engine.loadAllSettings({
      'kick:membrane_808': {
        attack: 0.002, // valid
        decay: NaN, // invalid: not finite
        release: 'a lot' as never, // invalid: not a number
        volume: 999, // invalid: out of PARAMETER_SPECS range
      },
      'kick:does_not_exist': { attack: 0.002 }, // invalid preset: whole entry dropped
      'unknown-lane:membrane_808': { attack: 0.002 }, // lane engine doesn't know: dropped
    } as never);

    const settings = engine.getSettings('kick');
    expect(settings.attack).toBe(0.002);
    expect(settings.decay).toBeUndefined();
    expect(settings.release).toBeUndefined();
    expect(settings.volume).toBeUndefined();

    const all = engine.getAllSettings();
    expect(all['kick:does_not_exist']).toBeUndefined();
    expect(all['unknown-lane:membrane_808']).toBeUndefined();
  });

  it("changing a layer's preset clears its stale layer-1+ overrides", async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    const [, secondLayer] = engine.getLayers('kick');
    expect(secondLayer.presetId).toBe('synth_blip');

    // Override an envelope param on layer 1 (not layer 0).
    engine.setLayerSettings('kick', secondLayer.layerId, { attack: 0.04 });
    expect(engine.getLayerSettings('kick', secondLayer.layerId).attack).toBe(0.04);

    const overriddenInstance =
      mocks.instrumentInstances.synth[mocks.instrumentInstances.synth.length - 1];
    expect((overriddenInstance.params as { envelope: { attack: number } }).envelope.attack).toBe(
      0.04
    );

    // Switch that same layer slot to a different preset (different synth
    // type entirely: synth -> membrane).
    const ok = engine.updateLayer('kick', secondLayer.layerId, {
      presetId: 'membrane_909',
    });
    expect(ok).toBe(true);

    // The stale override must not leak into the new preset's synth.
    expect(engine.getLayerSettings('kick', secondLayer.layerId).attack).not.toBe(0.04);

    const newInstance =
      mocks.instrumentInstances.membrane[mocks.instrumentInstances.membrane.length - 1];
    const newAttack = (newInstance.params as { envelope: { attack: number } }).envelope.attack;
    expect(newAttack).not.toBe(0.04);
    // It falls back to membrane_909's own tuned default instead.
    expect(newAttack).toBeCloseTo(0.0008);
  });
});

// P2-18 added the first test of REL-004's -1 dBFS output ceiling. Since
// 2026-10-01 the master chain is the shared @otoinki/loudness
// `createMasterBus` on the live context's raw AudioContext (not this
// engine's own Tone.Limiter), so these walk the raw graph it built. Expected
// numbers come from the shared package's exports, not a copied formula.
describe('master bus (ISSUE-REL-004, shared createMasterBus since 2026-10-01)', () => {
  /** Follows first outputs from `node` to the end of the chain. */
  function walk(node: { outputs: unknown[] }): unknown[] {
    const path: unknown[] = [node];
    let current = node;
    while (current.outputs.length > 0) {
      current = current.outputs[0] as { outputs: unknown[] };
      path.push(current);
    }
    return path;
  }

  it('wires master input -> master gain -> limiter -> makeup compensation -> destination, once, on construction', () => {
    new AudioEngine();

    // No engine-owned Tone.Limiter any more; the shared bus owns the limiter.
    expect(mocks.FakeLimiter.instances).toHaveLength(0);
    expect(mocks.rawContext.compressors).toHaveLength(1);
    expect(mocks.rawContext.gains).toHaveLength(2);
    const [busInput, compensation] = mocks.rawContext.gains;
    const limiter = mocks.rawContext.compressors[0];

    // The master input is the first FakeGain built (before the per-lane buses).
    const masterInput = mocks.FakeGain.instances[0];
    expect(masterInput.gain.value).toBe(1);
    expect(masterInput.connect).toHaveBeenCalledWith(busInput);
    expect(walk(busInput)).toEqual([busInput, limiter, compensation, mocks.rawContext.destination]);

    expect(limiter.threshold.value).toBe(-1);
    expect(limiter.threshold.value).toBe(FAMILY_LOUDNESS.ceilingDbtp);
    expect(limiter.knee.value).toBe(MASTER_LIMITER.kneeDb);
    expect(limiter.ratio.value).toBe(MASTER_LIMITER.ratio);
    // @otoinki/loudness 0.6.0: the limiter starts with a slow attack for the
    // first 0.1 s (cold-start fix) and is scheduled back to attackSeconds.
    expect(limiter.attack.value).toBe(MASTER_LIMITER.coldStartAttackSeconds);
    // 100% on the app's volume scale (2026-10-05), not the family default.
    expect(busInput.gain.value).toBeCloseTo(dbToLinear(NORMAL_MASTER_DB), 12);
  });

  it('cancels the limiter makeup gain (about -0.57 dB), so the bus is exactly the master level below the ceiling', () => {
    new AudioEngine();
    const [, compensation] = mocks.rawContext.gains;
    expect(compensation.gain.value).toBeCloseTo(dbToLinear(-compressorMakeupGainDb(MASTER_LIMITER)), 12);
    expect(20 * Math.log10(compensation.gain.value)).toBeCloseTo(-0.57, 6);
  });

  it('starts the limiter at release 0 and schedules the configured release after the cold-start window', () => {
    mocks.rawContext.currentTime = 1.5;
    new AudioEngine();
    const limiter = mocks.rawContext.compressors[0];
    expect(limiter.release.value).toBe(0);
    expect(limiter.release.events).toEqual([
      ['set', 0, 1.5],
      ['set', MASTER_LIMITER.releaseSeconds, 1.5 + DEFAULT_LIMITER_COLD_START_SECONDS],
    ]);
  });

  // 2026-10-01 (@otoinki/loudness 0.4.0): with autoplay allowed the context
  // runs from construction, so the creation-time window has expired by the
  // first sound; the engine re-arms it right before the first sound.
  it('re-arms the limiter cold-start window at the first transport start, once', () => {
    mocks.rawContext.currentTime = 0;
    const engine = new AudioEngine();
    const limiter = mocks.rawContext.compressors[0];
    mocks.rawContext.currentTime = 12;
    engine.startTransport();
    expect(limiter.release.events.slice(-2)).toEqual([
      ['set', 0, 12],
      ['set', MASTER_LIMITER.releaseSeconds, 12 + DEFAULT_LIMITER_COLD_START_SECONDS],
    ]);
    const count = limiter.release.events.length;
    mocks.rawContext.currentTime = 30;
    engine.stopTransport();
    engine.startTransport();
    expect(limiter.release.events.length).toBe(count); // later starts keep the configured release
  });

  it('re-arms the limiter cold-start window at the first pad hit', async () => {
    mocks.rawContext.currentTime = 0;
    const engine = new AudioEngine();
    await engine.initialize();
    const limiter = mocks.rawContext.compressors[0];
    mocks.rawContext.currentTime = 7;
    engine.playDrum('kick');
    expect(limiter.release.events.slice(-2)).toEqual([
      ['set', 0, 7],
      ['set', MASTER_LIMITER.releaseSeconds, 7 + DEFAULT_LIMITER_COLD_START_SECONDS],
    ]);
  });

  it("re-arms a lane's own compressor on the first hit after its chain is built, once per build", async () => {
    mocks.rawContext.currentTime = 0;
    const engine = new AudioEngine();
    await engine.initialize();
    // Neutral lanes have no compressor to arm (2026-10-01); give the kick and
    // the tom real ones.
    const comp = { threshold: -18, ratio: 4, attack: 0.01, release: 0.1 };
    engine.setLaneFx('kick', { compressor: comp });
    engine.setLaneFx('tom', { compressor: comp });
    expect(mocks.FakeCompressor.instances).toHaveLength(2);
    mocks.rawContext.currentTime = 3;
    engine.playDrum('cymbal'); // neutral lane: nothing to arm, no error
    engine.playDrum('kick');
    const armed = mocks.FakeCompressor.instances.filter((c) => c.release.events.length > 0);
    expect(armed).toHaveLength(1); // only the kick lane's compressor
    expect(armed[0].release.events).toEqual([
      ['cancel', 0, 3],
      ['set', 0, 3],
      ['set', armed[0].options.release, 3 + DEFAULT_LIMITER_COLD_START_SECONDS],
    ]);
    mocks.rawContext.currentTime = 9;
    engine.playDrum('kick');
    expect(armed[0].release.events).toHaveLength(3); // later hits keep the configured release
  });

  it('setMasterDb/getMasterDb drive the shared bus: clamped, 0.1 s ramp', () => {
    const engine = new AudioEngine();
    expect(engine.getMasterDb()).toBe(NORMAL_MASTER_DB);
    const busInput = mocks.rawContext.gains[0];

    mocks.rawContext.currentTime = 4;
    engine.setMasterDb(-12);
    expect(engine.getMasterDb()).toBe(-12);
    const ramp = busInput.gain.events.filter((e) => e[0] === 'ramp').pop();
    expect(ramp?.[1]).toBeCloseTo(dbToLinear(-12), 12);
    expect(ramp?.[2]).toBeCloseTo(4.1, 12);

    // Mute sets the bottom of the range; out-of-range values clamp.
    engine.setMasterDb(-1000);
    expect(engine.getMasterDb()).toBe(FAMILY_LOUDNESS.masterRangeDb[0]);
    // The top is 120% (MAX_MASTER_DB, +1.58 dB), below the shared +6 dB.
    engine.setMasterDb(6);
    expect(engine.getMasterDb()).toBeCloseTo(MAX_MASTER_DB, 12);
  });

  it('disposes the master bus alongside the rest of the engine', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    const masterInput = mocks.FakeGain.instances[0];
    engine.dispose();

    expect(masterInput.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.rawContext.compressors[0].disconnected).toBe(true);
    expect(mocks.rawContext.gains.every((g) => g.disconnected)).toBe(true);
  });
});

describe('Transport-driven sequencing (P2-14)', () => {
  it('scheduleRepeat asks Tone.Transport for the right note subdivision and returns its id', () => {
    const engine = new AudioEngine();
    const callback = vi.fn();

    const id = engine.scheduleRepeat(callback, 16);

    expect(mocks.fakeTransport.scheduleRepeat).toHaveBeenCalledWith(callback, '16n');
    expect(id).toBe(1); // fakeTransport.scheduleRepeat's fixed return value
  });

  it('clearScheduled clears that id on Tone.Transport', () => {
    const engine = new AudioEngine();

    engine.clearScheduled(7);

    expect(mocks.fakeTransport.clear).toHaveBeenCalledWith(7);
  });

  it('startTransport/stopTransport call through to Tone.Transport', () => {
    const engine = new AudioEngine();

    engine.startTransport();
    expect(mocks.fakeTransport.start).toHaveBeenCalledTimes(1);

    engine.stopTransport();
    expect(mocks.fakeTransport.stop).toHaveBeenCalledTimes(1);
  });

  it("setTransportBpm sets Tone.Transport.bpm.value directly, so a live tempo change doesn't need a reschedule", () => {
    const engine = new AudioEngine();

    engine.setTransportBpm(140);

    expect(mocks.fakeTransport.bpm.value).toBe(140);
  });

  it('drawAt schedules the callback on Tone.Draw at the given time', () => {
    const engine = new AudioEngine();
    const callback = vi.fn();

    engine.drawAt(1.5, callback);

    expect(mocks.fakeDraw.schedule).toHaveBeenCalledWith(callback, 1.5);
    expect(callback).toHaveBeenCalledTimes(1); // fakeDraw.schedule runs it synchronously
  });

  it('playDrumAt triggers every layer at the given time, not "now"', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    // Both of kick's default layers (membrane_808, synth_blip) trigger with
    // an explicit note, so the call shape is (note, duration, time, velocity).
    const membraneInstance = mocks.instrumentInstances.membrane[0];
    const synthInstance = mocks.instrumentInstances.synth[0];

    engine.playDrumAt('kick', 3.25);

    expect(membraneInstance.triggerAttackRelease.mock.calls[0][2]).toBe(3.25);
    expect(synthInstance.triggerAttackRelease.mock.calls[0][2]).toBe(3.25);
  });

  it('playDrumAt forwards velocity as the last argument (P2-16 accents)', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    const membraneInstance = mocks.instrumentInstances.membrane[0];

    engine.playDrumAt('kick', 1, 0.55);
    expect(membraneInstance.triggerAttackRelease.mock.calls[0].slice(-1)[0]).toBe(0.55);

    engine.playDrumAt('kick', 2);
    expect(membraneInstance.triggerAttackRelease.mock.calls[1].slice(-1)[0]).toBe(1);
  });

  it('fires the cymbal family with trigger(time, velocity), no note and no duration (cymbal/metal_closed)', async () => {
    // 2026-10-27: metal_closed (cymbal's default layer) is a CymbalSynth, not a
    // Tone.MetalSynth. It has no musical note and rings out for its own decay,
    // so the engine calls trigger(time, velocity) -- the 4-argument
    // triggerAttackRelease(note, duration, time, velocity) shape this test used
    // to pin (a 2-argument call shifted duration into the note slot and dropped
    // time) does not exist on it. What must still hold is that time arrives.
    const engine = new AudioEngine();
    await engine.initialize();

    const cymbalInstance = mocks.cymbalInstances[0] as unknown as { trigger: ReturnType<typeof vi.fn> };

    engine.playDrumAt('cymbal', 4.5);

    expect(cymbalInstance.trigger).toHaveBeenCalledTimes(1);
    const call = cymbalInstance.trigger.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe(4.5);
    expect(call[1]).toBe(1);
  });
});

describe('lanes (P2-17)', () => {
  it('addLane before initialize registers a lane without building its Tone chain yet', async () => {
    const engine = new AudioEngine();
    engine.addLane('kick-2', 'kick');

    // Not built yet (not initialized): a fresh layer set exists...
    expect(engine.getLayers('kick-2')).toHaveLength(2); // kick's own DEFAULT_LAYERS length
    // ...but no Tone instrument has been constructed for it.
    expect(mocks.instrumentInstances.membrane).toHaveLength(0);

    await engine.initialize();

    // initialize() builds every registered lane, including one added before
    // it ran (App.tsx does this for a saved pattern with extra lanes).
    expect(engine.getLayers('kick-2')).toHaveLength(2);
    expect(mocks.instrumentInstances.membrane.length).toBeGreaterThan(0);
  });

  it('addLane after initialize builds the Tone chain immediately, with a fresh copy of the category defaults', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    mocks.resetAll();

    engine.addLane('kick-2', 'kick');

    const layers = engine.getLayers('kick-2');
    expect(layers).toHaveLength(2);
    expect(layers[0].presetId).toBe('membrane_808'); // kick's own default
    expect(mocks.instrumentInstances.membrane.length).toBeGreaterThan(0);

    // Its layerIds are namespaced to the new lane, not shared with the
    // original kick lane's.
    expect(layers[0].layerId).toBe('kick-2-1');
    expect(layers.some((l) => l.layerId.startsWith('kick-1') || l.layerId === 'kick-1')).toBe(
      false
    );
  });

  it('a second lane of the same category plays independently of the first', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    engine.addLane('kick-2', 'kick');

    const originalInstance = mocks.instrumentInstances.membrane.find(
      (i) => i !== undefined
    );
    const beforeCount = mocks.instrumentInstances.membrane.length;

    engine.playDrumAt('kick-2', 5);

    // Playing the new lane didn't need to build any more instruments (its
    // chain was already built by addLane), and the original kick's own
    // instrument was not touched.
    expect(mocks.instrumentInstances.membrane).toHaveLength(beforeCount);
    expect(originalInstance?.triggerAttackRelease).not.toHaveBeenCalled();
  });

  it('removeLane disposes the lane and playDrumAt on it becomes a no-op', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    engine.addLane('kick-2', 'kick');
    // membrane_808 (layer 0) is the last membrane instance built: initialize()
    // already used that bucket for the original kick and tom (membrane_mid).
    const membraneInstances = mocks.instrumentInstances.membrane;
    const secondKickInstance = membraneInstances[membraneInstances.length - 1];

    engine.removeLane('kick-2');

    expect(secondKickInstance.dispose).toHaveBeenCalled();
    expect(engine.getLayers('kick-2')).toEqual([]);

    // No throw, and nothing plays for a lane that no longer exists.
    secondKickInstance.triggerAttackRelease.mockClear();
    engine.playDrumAt('kick-2', 1);
    expect(secondKickInstance.triggerAttackRelease).not.toHaveBeenCalled();
  });

  it('removeLane clears settings/layerOverrides so a re-added lane at the same id starts clean (ISSUE-BEATBOX-015 finding 9)', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    engine.addLane('kick-2', 'kick');

    const [, secondLayer] = engine.getLayers('kick-2');
    engine.setLayerSettings('kick-2', secondLayer.layerId, { attack: 0.04 });

    // Layer 0's pre-layer override format, keyed by laneId:presetId.
    const [firstLayer] = engine.getLayers('kick-2');
    engine.changeDrumPreset('kick-2', firstLayer.presetId);
    engine.setSettings('kick-2', { attack: 0.03 });
    expect(engine.getSettings('kick-2').attack).toBe(0.03);

    engine.removeLane('kick-2');
    // Same id reused (nextLaneId picks the smallest free number).
    engine.addLane('kick-2', 'kick');

    // The re-added lane's layer-0 settings are back to preset defaults, not
    // the previous occupant's override.
    expect(engine.getSettings('kick-2').attack).not.toBe(0.03);
    const [, newSecondLayer] = engine.getLayers('kick-2');
    expect(engine.getLayerSettings('kick-2', newSecondLayer.layerId).attack).not.toBe(0.04);
  });

  it('addLane is a no-op if called twice for the same lane id', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    engine.addLane('kick-2', 'kick');
    const firstLayers = engine.getLayers('kick-2');

    engine.addLane('kick-2', 'tom'); // even with a different category

    expect(engine.getLayers('kick-2')).toEqual(firstLayers);
  });
});

describe('metal and cymbal frequency assignment (ISSUE-BEATBOX-014, audit finding 1)', () => {
  it("sets each metal preset's own frequency on the built instrument, not Tone's default 0", async () => {
    // The preset's own tuned frequency, not a guess — see SYNTH_PRESETS.cymbal
    // and SYNTH_PRESETS.clap.metal_rim in synthPresets.ts.
    const expected: Record<string, number> = {
      metal_closed: 480,
      metal_open: 480,
      metal_ride: 380,
      metal_crash: 260,
      metal_rim: 900,
    };

    const engine = new AudioEngine();
    await engine.initialize();

    // cymbal's default layer 0 is metal_closed; switching it exercises every
    // other cymbal preset without needing a second lane per preset.
    for (const [presetId, frequency] of Object.entries(expected)) {
      if (presetId === 'metal_rim') continue; // clap category, checked below
      engine.changeDrumPreset('cymbal', presetId);
      // The hats, ride and crash are CymbalSynth since 2026-10-27; the rimshot
      // below is still a MetalSynth.
      const instance = mocks.cymbalInstances[mocks.cymbalInstances.length - 1];
      expect(instance.frequency.value).toBe(frequency);
    }

    engine.changeDrumPreset('clap', 'metal_rim');
    const rimInstance = mocks.metalInstances[mocks.metalInstances.length - 1];
    expect(rimInstance.frequency.value).toBe(900);
  });

  it('each hit keeps the preset frequency: a cymbal hit retunes nothing, and the metal rimshot still gets its own frequency, not C1', async () => {
    // Monophonic.triggerAttack calls setNote(note) on every hit, so a 'C1'
    // fallback retuned every metal preset to 32.7 Hz (found 2026-09-29 in a
    // browser loudness check). That is still true of the rimshot (MetalSynth);
    // CymbalSynth has no setNote, it reads its own `frequency` on every trigger.
    const engine = new AudioEngine();
    await engine.initialize();

    engine.changeDrumPreset('cymbal', 'metal_crash');
    const cymbal = mocks.cymbalInstances[mocks.cymbalInstances.length - 1] as unknown as {
      frequency: { value: number };
      trigger: ReturnType<typeof vi.fn>;
    };
    engine.playDrumAt('cymbal', 2);
    const calls = cymbal.trigger.mock.calls;
    expect(calls[calls.length - 1][0]).toBe(2);
    expect(cymbal.frequency.value).toBe(260);

    engine.changeDrumPreset('clap', 'metal_rim');
    const rim = mocks.metalInstances[mocks.metalInstances.length - 1];
    engine.playDrumAt('clap', 3);
    const rimCalls = rim.triggerAttackRelease.mock.calls;
    expect(rimCalls[rimCalls.length - 1][0]).toBe(900);
    expect(rimCalls[rimCalls.length - 1][2]).toBe(3);
  });
});

describe('Wood Block resonance range (ISSUE-BEATBOX-014, audit finding 2)', () => {
  it('getPresetParameters gives PluckSynth resonance a 0..1 range, not MetalSynth Hz', async () => {
    const { getPresetParameters } = await import('./synthPresets');
    const params = getPresetParameters('clap', 'pluck_block');
    const resonance = params.find((p) => p.key === 'resonance');
    expect(resonance).toBeDefined();
    expect(resonance!.min).toBe(0);
    expect(resonance!.max).toBe(1);
  });

  it('a resonance override anywhere in 0..1 builds the Wood Block without throwing', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    engine.changeDrumPreset('clap', 'pluck_block');

    expect(() => engine.setSettings('clap', { resonance: 0, dampening: 3500, volume: -4 })).not.toThrow();
    expect(() => engine.setSettings('clap', { resonance: 1, dampening: 3500, volume: -4 })).not.toThrow();
    expect(() => engine.setSettings('clap', { resonance: 0.9, dampening: 3500, volume: -4 })).not.toThrow();

    const instance = mocks.instrumentInstances.pluck[mocks.instrumentInstances.pluck.length - 1];
    expect((instance.params as { resonance: number }).resonance).toBe(0.9);
  });
});

describe('imported kept-sound values are checked before Tone.js (BB-T16)', () => {
  // A preset file is JSON the user picked, so it can say 1e999 (Infinity
  // once parsed, and still typeof number) or a value no slider can reach.
  // Both must fall back to the preset's own default on every layer.
  const importOnto = async (layerIndex: number) => {
    const engine = new AudioEngine();
    await engine.initialize();
    const layer = engine.getLayers('kick')[layerIndex];
    const specs = getPresetParameters('kick', layer.presetId);
    expect(specs.length).toBeGreaterThanOrEqual(3);
    const [infinite, outOfRange, kept] = specs;
    const keptValue = (kept.min + kept.max) / 2;

    const raw =
      '{"version":1,"presets":[{"id":"bad","name":"Bad","drum":"kick",' +
      `"basePresetId":"${layer.presetId}","savedAt":"2026-11-08T00:00:00Z",` +
      `"values":{"${infinite.key}":1e999,"${outOfRange.key}":${outOfRange.max * 10 + 1},` +
      `"${kept.key}":${keptValue}}}]}`;
    const [preset] = parsePresetFile(raw);
    expect(preset.values[infinite.key]).toBe(Infinity);

    expect(() => engine.setLayerSettings('kick', layer.layerId, preset.values)).not.toThrow();
    expect(engine.getLastError()).toBeNull();

    const defaults = getPresetDefaults('kick', layer.presetId);
    const applied = engine.getLayerSettings('kick', layer.layerId);
    expect(applied[infinite.key]).toBe(defaults[infinite.key]);
    expect(applied[outOfRange.key]).toBe(defaults[outOfRange.key]);
    expect(applied[kept.key]).toBe(keptValue);
    Object.values(applied).forEach((value) => expect(Number.isFinite(value)).toBe(true));
  };

  it('on layer 0 (setLayerSettings routes to setSettings)', async () => {
    await importOnto(0);
  });

  it('on a second layer (layerOverrides)', async () => {
    await importOnto(1);
  });
});

describe('buildLayer failure keeps the old voice (ISSUE-BEATBOX-014, audit finding 2)', () => {
  it('a build failure leaves the previous instrument in place and playDrumAt still fires it', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    // Several membrane instruments exist by now (kick's own layer 0 plus
    // every membrane-type tom preset) - identify kick's specifically by
    // triggering it and reading which instance actually fired, rather than
    // assuming array order/position.
    engine.playDrumAt('kick', 0);
    const before = mocks.instrumentInstances.membrane.find((instance) =>
      instance.triggerAttackRelease.mock.calls.some((call) => call[2] === 0)
    );
    expect(before).toBeDefined();
    before!.triggerAttackRelease.mockClear();

    // Simulate Tone.js rejecting the next construction (e.g. an out-of-range
    // constructor option) by swapping in a throwing class for one call, the
    // same shape of failure a bad slider override used to cause for real
    // before ISSUE-LAYER-001's synths grew runtime validation.
    const ToneMock = (await import('tone')) as unknown as { MembraneSynth: typeof mocks.MembraneSynth };
    const OriginalMembraneSynth = ToneMock.MembraneSynth;
    class ThrowingMembraneSynth {
      constructor() {
        throw new Error('simulated Tone.js constructor failure');
      }
    }
    ToneMock.MembraneSynth = ThrowingMembraneSynth as unknown as typeof mocks.MembraneSynth;

    try {
      expect(() =>
        engine.setSettings('kick', { attack: 999, decay: 999, release: 999 })
      ).not.toThrow();
      expect(engine.getLastError()?.laneId).toBe('kick');

      // The old voice is still wired and still fires - the lane didn't go
      // permanently silent the way it used to when disposeVoice() ran before
      // the replacement instrument existed.
      expect(() => engine.playDrumAt('kick', 1)).not.toThrow();
      expect(before!.triggerAttackRelease).toHaveBeenCalled();
    } finally {
      ToneMock.MembraneSynth = OriginalMembraneSynth;
    }
  });
});

describe('pluck accent (ISSUE-BEATBOX-014, audit finding 7)', () => {
  it("scales the Wood Block layer's own gain by velocity, since PluckSynth.triggerAttack takes none", async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    engine.changeDrumPreset('clap', 'pluck_block');

    const layer = engine.getLayers('clap')[0];
    const baseLinearGain = Math.pow(10, layer.gainDb / 20);
    const gainInstance = mocks.FakeGain.instances[mocks.FakeGain.instances.length - 1];
    const setValueAtTime = vi.fn();
    gainInstance.gain = { ...gainInstance.gain, setValueAtTime } as never;

    engine.playDrumAt('clap', 1, 0.55); // weak
    engine.playDrumAt('clap', 2, 0.85); // mid
    engine.playDrumAt('clap', 3, 1.0); // strong

    const values = setValueAtTime.mock.calls.map((call) => call[0] as number);
    expect(values).toHaveLength(3);
    // Strictly increasing with the accent - the effective gain differs
    // between weak/mid/strong even though PluckSynth itself never sees a
    // velocity argument.
    expect(values[0]).toBeLessThan(values[1]);
    expect(values[1]).toBeLessThan(values[2]);
    expect(values[0]).toBeCloseTo(baseLinearGain * 0.55);
    expect(values[2]).toBeCloseTo(baseLinearGain * 1.0);

    // triggerAttack itself never receives velocity - PluckSynth has no such
    // parameter (PluckSynth.js).
    const instance = mocks.instrumentInstances.pluck[mocks.instrumentInstances.pluck.length - 1];
    expect(instance.triggerAttack).toHaveBeenCalledWith('C5', 1);
    expect(instance.triggerAttack.mock.calls.every((call) => call.length === 2)).toBe(true);
  });
});

describe('setLaneAudible (ISSUE-BEATBOX-011)', () => {
  it("ramps the lane's own bus gain to 0/1, not the master or any other lane's", async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    // The four per-role buses are the FakeGain instances right after
    // master input (index 0) — see the master-bus test above for that
    // same ordering fact.
    const kickBus = mocks.FakeGain.instances[1];
    const tomBus = mocks.FakeGain.instances[2];

    engine.setLaneAudible('kick', false);

    expect(kickBus.gain.rampTo).toHaveBeenCalledWith(0, 0.01);
    expect(tomBus.gain.rampTo).not.toHaveBeenCalled();

    engine.setLaneAudible('kick', true);

    expect(kickBus.gain.rampTo).toHaveBeenLastCalledWith(1, 0.01);
  });

  it('is a no-op for a lane id that is not registered', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    expect(() => engine.setLaneAudible('not-a-real-lane', false)).not.toThrow();
  });
});

describe('renderPattern respects mute/solo (ISSUE-BEATBOX-016, D-1)', () => {
  /** grid[laneIndex][step], one bar of 4 steps, hit on step 0 for every lane. */
  function gridWithHitOnStepZero(laneCount: number): boolean[][] {
    return Array.from({ length: laneCount }, () => [true, false, false, false]);
  }

  it('a muted lane is skipped entirely — no instrument is even built for it', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    await drainPendingRenders();
    mocks.resetAll();

    // kick and tom are both 'membrane' presets by default; mute both so the
    // whole membrane bucket is expected to be empty.
    const lanes: Lane[] = DEFAULT_LANES.map((lane) =>
      lane.id === 'kick' || lane.id === 'tom' ? { ...lane, muted: true } : lane
    );

    await engine.renderPattern({
      lanes,
      grid: gridWithHitOnStepZero(lanes.length),
      bars: 1,
      resolution: 4,
      bpm: 120,
    });

    // kick/tom are membrane, cymbal is a CymbalSynth — muting kick/tom must not
    // stop it from being rendered for the still-audible cymbal lane.
    expect(mocks.instrumentInstances.membrane).toHaveLength(0);
    expect(mocks.instrumentInstances.cymbal.length).toBeGreaterThan(0);
    expect(
      (mocks.cymbalInstances as unknown as { trigger: ReturnType<typeof vi.fn> }[]).some(
        (i) => i.trigger.mock.calls.length > 0
      )
    ).toBe(true);
  });

  it('solo narrows playback to the soloed lane, same rule as live playback', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    mocks.resetAll();

    const lanes: Lane[] = DEFAULT_LANES.map((lane) =>
      lane.id === 'cymbal' ? { ...lane, solo: true } : lane
    );

    await engine.renderPattern({
      lanes,
      grid: gridWithHitOnStepZero(lanes.length),
      bars: 1,
      resolution: 4,
      bpm: 120,
    });

    // Only cymbal is soloed, so kick (membrane) must not be built at all.
    expect(mocks.instrumentInstances.membrane).toHaveLength(0);
    expect(mocks.instrumentInstances.cymbal.length).toBeGreaterThan(0);
  });

  it('with no mute/solo, every lane renders as before', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    mocks.resetAll();

    await engine.renderPattern({
      lanes: DEFAULT_LANES,
      grid: gridWithHitOnStepZero(DEFAULT_LANES.length),
      bars: 1,
      resolution: 4,
      bpm: 120,
    });

    expect(mocks.instrumentInstances.membrane.length).toBeGreaterThan(0);
    expect(mocks.instrumentInstances.cymbal.length).toBeGreaterThan(0);
  });
});

describe('export level is fixed at 0.7 for both renders (ISSUE-BEATBOX-016, D-2)', () => {
  it('renderPattern and renderOneShot construct their output Gain node at the same value', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    mocks.resetAll();

    await engine.renderPattern({
      lanes: DEFAULT_LANES,
      grid: DEFAULT_LANES.map(() => [true, false, false, false]),
      bars: 1,
      resolution: 4,
      bpm: 120,
    });
    // renderPattern's own master Gain, plus the four per-lane buses already
    // built at initialize() time — resetAll() cleared FakeGain.instances, so
    // every FakeGain seen here was constructed by this call.
    const patternGainValues = mocks.FakeGain.instances.map((g) => g.gain.value);

    mocks.resetAll();
    await engine.renderOneShot('kick');
    const oneShotGainValues = mocks.FakeGain.instances.map((g) => g.gain.value);

    expect(patternGainValues).toContain(0.7);
    expect(oneShotGainValues).toContain(0.7);
    expect(oneShotGainValues).not.toContain(1);
  });
});

describe('sound basis (docs/SOUND_DESIGN_20260924_genre_presets.md)', () => {
  const theoryHouse = () => SOUND_BASES.theory.House;
  const spaceHouse = () => SOUND_SPACES.theory.House;

  it('awaits the shared reverb being ready during initialize', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    expect(mocks.FakeReverb.instances).toHaveLength(1);
    expect(mocks.FakeReverb.instances[0].readyAwaited).toBe(true);
  });

  it('loads main + layer per lane with no per-layer delay, and triggers both at the same time', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    mocks.resetAll();
    await engine.applySoundBasis(SOUND_BASES.empirical.Techno, SOUND_SPACES.empirical.Techno);

    const layers = engine.getLayers('kick');
    expect(layers.map((l) => l.presetId)).toEqual([
      SOUND_BASES.empirical.Techno.kick.main.presetId,
      SOUND_BASES.empirical.Techno.kick.layer.presetId,
    ]);
    // Comb-filter rule: no micro-delay between the two layers.
    expect(layers.every((l) => !l.delay.enabled)).toBe(true);

    // Both kick layers are membrane synths for this entry. Filtering by "was
    // actually triggered at 3.5" (rather than positionally slicing the first
    // two membranes built) is robust to the per-sound loudness-normalisation
    // measurement (owner decision 2026-09-27/28) also building a throwaway
    // membrane instance offline, at OFFLINE_TRIGGER_AT, not 3.5.
    engine.playDrumAt('kick', 3.5, 0.85);
    const triggeredAt35 = mocks.instrumentInstances.membrane.filter(
      (m) => m.triggerAttackRelease.mock.calls[0]?.[2] === 3.5
    );
    expect(triggeredAt35).toHaveLength(2);
  });

  it("puts the entry's overrides into the sliders of both layers", async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    await engine.applySoundBasis(theoryHouse(), spaceHouse());

    const [main, layer] = engine.getLayers('kick');
    expect(engine.getLayerSettings('kick', main.layerId)).toMatchObject(theoryHouse().kick.main.overrides);
    expect(engine.getLayerSettings('kick', layer.layerId)).toMatchObject(theoryHouse().kick.layer.overrides);
    expect(engine.getLaneFx('cymbal')).toEqual(theoryHouse().cymbal.fx);
  });

  it('respectSaved keeps a layer-1 slider set the player saved', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    const presetId = theoryHouse().kick.main.presetId;
    engine.loadAllSettings({ [`kick:${presetId}`]: { decay: 1.5 } });
    await engine.applySoundBasis(theoryHouse(), spaceHouse(), { respectSaved: true });
    expect(engine.getSettings('kick').decay).toBe(1.5);

    await engine.applySoundBasis(theoryHouse(), spaceHouse());
    expect(engine.getSettings('kick').decay).toBe(theoryHouse().kick.main.overrides.decay);
  });

  it('routes each lane bus -> Filter -> Distortion -> Compressor, and sends reach the reverb only through a high-pass', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    await engine.applySoundBasis(SOUND_BASES.empirical.Gabber, SOUND_SPACES.empirical.Gabber);

    const reverb = mocks.FakeReverb.instances[mocks.FakeReverb.instances.length - 1];
    const feeders = [
      ...mocks.FakeFilter.instances,
      ...mocks.FakeGain.instances,
      ...mocks.FakeCompressor.instances,
      ...mocks.FakeDistortion.instances,
    ].filter((node) => node.connect.mock.calls.some((call) => call[0] === reverb));
    // Exactly one node feeds the reverb, and it is a high-pass filter.
    expect(feeders).toHaveLength(1);
    const reverbIn = feeders[0] as InstanceType<typeof mocks.FakeFilter>;
    expect(mocks.FakeFilter.instances).toContain(reverbIn);
    expect(reverbIn.options.type).toBe('highpass');
    expect(reverbIn.options.frequency).toBe(SOUND_SPACES.empirical.Gabber.returnHighpassHz);

    // The kick lane's chain carries the entry's distortion and compressor.
    const fx = SOUND_BASES.empirical.Gabber.kick.fx;
    expect(
      mocks.FakeDistortion.instances.some(
        (d) => d.distortion === fx.distortion!.amount && d.wet.value === fx.distortion!.wet
      )
    ).toBe(true);
    expect(
      mocks.FakeCompressor.instances.some((c) => c.options.ratio === fx.compressor!.ratio)
    ).toBe(true);
  });

  it('keeps the -1 dBFS master limiter', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    await engine.applySoundBasis(SOUND_BASES.modern.Gabber, SOUND_SPACES.modern.Gabber);
    expect(mocks.rawContext.compressors).toHaveLength(1);
    expect(mocks.rawContext.compressors[0].threshold.value).toBe(-1);
  });

  it('sets the shared delay from the note value at the current tempo', async () => {
    expect(noteValueSeconds('8n', 120)).toBeCloseTo(0.25);
    expect(noteValueSeconds('8n.', 120)).toBeCloseTo(0.375);
    expect(noteValueSeconds('16n', 150)).toBeCloseTo(0.1);
    expect(noteValueSeconds('4n', 30)).toBe(1); // capped at FeedbackDelay's 1 s

    const engine = new AudioEngine();
    await engine.initialize();
    engine.setTransportBpm(120);
    await engine.applySoundBasis(theoryHouse(), { ...spaceHouse(), delayTime: '8n' });
    const delay = mocks.FakeFeedbackDelay.instances[mocks.FakeFeedbackDelay.instances.length - 1];
    expect(delay.delayTime.value).toBeCloseTo(0.25);
    engine.setTransportBpm(150);
    expect(delay.delayTime.value).toBeCloseTo(0.2);
  });

  it('renderPattern and renderOneShot include the lane effects and the shared space', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    await engine.applySoundBasis(SOUND_BASES.empirical.Eurodance, SOUND_SPACES.empirical.Eurodance);
    mocks.resetAll();

    await engine.renderPattern({
      lanes: DEFAULT_LANES,
      grid: DEFAULT_LANES.map(() => [true, false, false, false]),
      bars: 1,
      resolution: 4,
      bpm: 124,
    });
    expect(mocks.FakeFilter.instances.length).toBeGreaterThanOrEqual(DEFAULT_LANES.length);
    // One per compressing lane (a neutral one is bypassed, 2026-10-01), plus
    // the export limiter (a Tone.Compressor since 2026-10-01).
    const basis = SOUND_BASES.empirical.Eurodance;
    const compressing = DEFAULT_LANES.filter(
      (lane) => !isNeutralCompressor(basis[lane.category].fx.compressor)
    ).length;
    expect(mocks.FakeCompressor.instances).toHaveLength(compressing + 1);
    expect(mocks.FakeReverb.instances).toHaveLength(1);
    expect(mocks.FakeReverb.instances[0].readyAwaited).toBe(true);

    mocks.resetAll();
    await engine.renderOneShot('clap');
    // Eurodance clap sends 70% to the reverb (E15), so the one-shot has one too.
    expect(mocks.FakeReverb.instances).toHaveLength(1);
    expect(mocks.FakeCompressor.instances).toHaveLength(
      isNeutralCompressor(basis.clap.fx.compressor) ? 0 : 1
    );
  });
});

// 2026-10-01: the offline renders build fresh compressors (each compressing
// lane's, plus renderPattern's export limiter) inside the OfflineContext, and
// a fresh DynamicsCompressorNode is cold. Instead of arming them with the
// live cold-start window (which made a ratio-6 compressor's first hit ~5 dB
// too loud in headless Chromium), every export renders EXPORT_PREROLL_SECONDS
// of silence first and trims it off: measured, 0.5 s brings a file's first
// hit within 0.07 dB of a settled one for every compressor probed.
describe('offline exports render a silent pre-roll instead of arming compressors', () => {
  const START = EXPORT_PREROLL_SECONDS + 0.005; // + OFFLINE_TRIGGER_AT

  function triggerTimes(): number[] {
    return (Object.values(mocks.instrumentInstances).flat() as Array<{
      triggerAttackRelease: { mock: { calls: unknown[][] } };
      triggerAttack: { mock: { calls: unknown[][] } };
    }>).flatMap((instrument) => [
      ...instrument.triggerAttackRelease.mock.calls.map((call) => call[2] as number),
      ...instrument.triggerAttack.mock.calls.map((call) => call[1] as number),
    ]);
  }

  it('renderPattern: half a second of pre-roll, every hit after it, no compressor armed', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    await engine.applySoundBasis(SOUND_BASES.empirical.Gabber, SOUND_SPACES.empirical.Gabber);
    // Gabber's sounds are measured in the background; unless an earlier test
    // already cached them, those renders would sit ahead of the export in
    // renderOffline's queue and be Offline.mock.calls[0] below.
    await drainPendingRenders();
    mocks.resetAll();
    mocks.rawContext.currentTime = 42;
    const bpm = 120;
    await engine.renderPattern({
      lanes: DEFAULT_LANES,
      grid: DEFAULT_LANES.map(() => [true, false, true, false]),
      bars: 1,
      resolution: 4,
      bpm,
      tailSeconds: 1,
    });
    expect(EXPORT_PREROLL_SECONDS).toBe(0.5);
    const duration = mocks.Offline.mock.calls[0][1] as number;
    expect(duration).toBeCloseTo(START + 4 * (60 / bpm) + 1, 9);

    const times = triggerTimes();
    expect(times.length).toBeGreaterThan(0);
    expect(Math.min(...times)).toBeCloseTo(START, 9);
    expect(times.every((t) => t >= START - 1e-9)).toBe(true);

    const comps = mocks.FakeCompressor.instances;
    const limiter = comps.find((c) => c.options.ratio === 20 && c.options.threshold === -1)!;
    expect(limiter).toBeDefined();
    expect(limiter.options).toMatchObject({ attack: 0.003, release: 0.01, knee: 30 });
    // Gabber's kick compresses in the empirical basis, so there is a lane one too.
    expect(comps.some((c) => c !== limiter && c.options.ratio > 1)).toBe(true);
    comps.forEach((c) => expect(c.release.events).toEqual([]));
  });

  it('renderOneShot: pre-roll added to the render, the hit after it, no compressor armed', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    await engine.applySoundBasis(SOUND_BASES.empirical.Gabber, SOUND_SPACES.empirical.Gabber);
    await drainPendingRenders(); // see renderPattern above
    mocks.resetAll();
    await engine.renderOneShot('kick', 2);
    expect(mocks.Offline.mock.calls[0][1]).toBeCloseTo(EXPORT_PREROLL_SECONDS + 2, 9);
    const times = triggerTimes();
    expect(times.length).toBeGreaterThan(0);
    times.forEach((t) => expect(t).toBeCloseTo(START, 9));
    expect(mocks.FakeCompressor.instances).toHaveLength(1);
    const [comp] = mocks.FakeCompressor.instances;
    expect(comp.options.ratio).toBeGreaterThan(1);
    expect(comp.release.events).toEqual([]);
  });

  it('trims the pre-roll and the trigger offset off the output', async () => {
    const sampleRate = 44100;
    const lead = Math.round(START * sampleRate);
    const data = new Float32Array(lead + 100);
    data[lead - 1] = -1; // last sample of the pre-roll
    data[lead] = 0.5; // the hit's first sample
    const engine = new AudioEngine();
    await engine.initialize();
    mocks.Offline.mockImplementationOnce(async (callback: () => void) => {
      callback();
      return { sampleRate, numberOfChannels: 1, getChannelData: () => data };
    });
    const out = await engine.renderOneShot('kick');
    expect(out!.channels[0]).toHaveLength(100);
    expect(out!.channels[0][0]).toBe(0.5);
  });
});

// 2026-10-01: a neutral lane compressor (ratio 1) is not built. Headless
// Chromium measured a DynamicsCompressorNode at ratio 1 6.7 dB low on its
// first hit (0.38 dB with the cold-start window), unity only once settled;
// the plain look-ahead delay in its place is sample-identical to dry.
describe('neutral lane compressor is bypassed', () => {
  it('builds no compressor for a neutral lane, only a look-ahead delay wired like one', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    // Default lanes carry no effects at all.
    expect(mocks.FakeCompressor.instances).toHaveLength(0);
    expect(mocks.FakeDelay.instances).toHaveLength(DEFAULT_LANES.length);
    mocks.FakeDelay.instances.forEach((delay) => {
      expect(delay.delayTime.value).toBeCloseTo(264 / 44100, 12);
    });
    // Distortion -> delay -> master + both sends, exactly where the
    // compressor sat.
    const delay = mocks.FakeDelay.instances[0];
    expect(
      mocks.FakeDistortion.instances.some((d) => d.connect.mock.calls.some((c) => c[0] === delay))
    ).toBe(true);
    expect(delay.connect.mock.calls).toHaveLength(3);

    // Explicit ratio 1 (any threshold) is neutral too.
    engine.setLaneFx('kick', { compressor: { threshold: -30, ratio: 1, attack: 0.01, release: 0.1 } });
    expect(mocks.FakeCompressor.instances).toHaveLength(0);
  });

  it('keeps user compression working: ratio > 1 builds it, back to 1 removes it', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    const comp = { threshold: -20, ratio: 4, attack: 0.005, release: 0.15 };
    engine.setLaneFx('kick', { compressor: comp });
    expect(mocks.FakeCompressor.instances).toHaveLength(1);
    const built = mocks.FakeCompressor.instances[0];
    expect(built.options).toMatchObject(comp);
    expect(
      mocks.FakeDistortion.instances.some((d) => d.connect.mock.calls.some((c) => c[0] === built))
    ).toBe(true);

    const delaysBefore = mocks.FakeDelay.instances.length;
    engine.setLaneFx('kick', { compressor: { ...comp, ratio: 1 } });
    expect(built.dispose).toHaveBeenCalled();
    expect(mocks.FakeCompressor.instances).toHaveLength(1); // no new one
    expect(mocks.FakeDelay.instances.length).toBe(delaysBefore + 1);
  });

  it('isNeutralCompressor and compressorLookaheadSeconds', () => {
    expect(isNeutralCompressor(undefined)).toBe(true);
    expect(isNeutralCompressor({ threshold: 0, ratio: 1, attack: 0.003, release: 0.25 })).toBe(true);
    expect(isNeutralCompressor({ threshold: -40, ratio: 0.5, attack: 0, release: 0 })).toBe(true);
    expect(isNeutralCompressor({ threshold: -40, ratio: Number.NaN, attack: 0, release: 0 })).toBe(true);
    expect(isNeutralCompressor({ threshold: 0, ratio: 1.01, attack: 0, release: 0 })).toBe(false);

    expect(compressorLookaheadSeconds(44100)).toBe(264 / 44100);
    expect(compressorLookaheadSeconds(48000)).toBe(288 / 48000);
    expect(compressorLookaheadSeconds(Number.NaN)).toBe(0.006);
    expect(compressorLookaheadSeconds(0)).toBe(0.006);
  });
});

describe('renderPattern length at 32 bars (owner decision 2026-09-29)', () => {
  it('renders the full 32 bars plus the tail', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    await drainPendingRenders(); // see renderPattern's pre-roll test above
    mocks.resetAll();
    const bars = 32;
    const resolution = 16;
    await engine.renderPattern({
      lanes: DEFAULT_LANES,
      grid: DEFAULT_LANES.map(() => Array(bars * resolution).fill(false)),
      bars,
      resolution,
      bpm: 120,
      tailSeconds: 2,
    });
    const duration = mocks.Offline.mock.calls[0][1] as number;
    // 32 bars of 4/4 at 120 BPM = 64 s, + 2 s tail, + the small trigger offset.
    expect(duration).toBeGreaterThanOrEqual(66);
    expect(duration).toBeLessThan(67);
  });
});

// 2026-10-01 finding: the per-sound normalisation was measured on the bare
// mono instrument (upmixed dual-mono into the stereo destination), but every
// layer plays through a Tone.Panner, whose equal-power centre costs 3.01 dB
// per channel -- so each lane sat ~3 dB under the family target.
describe('loudness normalisation holds at the layer pan (2026-10-01)', () => {
  it('documents the StereoPannerNode mono equal-power law: constant power at every pan', () => {
    const centre = stereoPannerGains(0);
    expect(centre.left).toBeCloseTo(Math.SQRT1_2, 12);
    expect(centre.right).toBeCloseTo(Math.SQRT1_2, 12);
    expect(20 * Math.log10(centre.left)).toBeCloseTo(-3.0103, 3);
    expect(stereoPannerGains(-1).left).toBeCloseTo(1, 12);
    expect(stereoPannerGains(-1).right).toBeCloseTo(0, 12);
    expect(stereoPannerGains(1).left).toBeCloseTo(0, 12);
    expect(stereoPannerGains(1).right).toBeCloseTo(1, 12);
    for (const pan of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
      const { left, right } = stereoPannerGains(pan);
      // BS.1770 weights L and R by 1 and sums energy, so constant
      // left^2 + right^2 means pan-independent loudness.
      expect(left * left + right * right).toBeCloseTo(1, 12);
      // No pan makes either channel hotter than hard pan does.
      expect(Math.max(left, right)).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('measures several hits for every type whose level is not fixed by the hit itself (2026-10-27)', () => {
    // Raw LUFS spread over 16 quantum positions (headless Chromium,
    // 2026-10-01): mono_analog 8.1, synth_blip 3.2 -- the kick's second
    // layers -- against 1 LU or less for membrane, fm, am and duo. The noise
    // voices draw new random noise on every render (noise_clap measured
    // -26.8 and -30.2 LUFS in two identical full renders). One hit left those
    // layers' normalised level a random draw.
    for (const type of ['metal', 'cymbal', 'mono', 'synth', 'noise', 'pluck'] as const) {
      expect(normalizationHitCount(type)).toBe(NORMALIZATION_HITS);
    }
    for (const type of ['membrane', 'fm', 'am', 'duo'] as const) {
      expect(normalizationHitCount(type)).toBe(1);
    }
  });

  it('measures through a Tone.Panner at the worst-case-peak pan, not straight into the destination', async () => {
    expect(NORMALIZATION_MEASURE_PAN).toBe(-1);
    // Params unique to this test, so the module-level cache cannot answer.
    await measureNormalizationGain('kick', 'membrane_808', { pitchDecay: 0.0371, octaves: 7 });
    // One render per measured hit, each through its own panner; a membrane
    // is measured with one hit (see the previous test for which types take
    // NORMALIZATION_HITS).
    expect(normalizationHitCount('membrane')).toBe(1);
    expect(mocks.Offline).toHaveBeenCalledTimes(1);
    expect(mocks.FakePanner.instances).toHaveLength(1);
    expect(mocks.instrumentInstances.membrane).toHaveLength(1);
    mocks.FakePanner.instances.forEach((panner, hit) => {
      expect(panner.pan.value).toBe(NORMALIZATION_MEASURE_PAN);
      expect(panner.toDestination).toHaveBeenCalled();
      const membrane = mocks.instrumentInstances.membrane[hit];
      expect(membrane.connect).toHaveBeenCalledWith(panner);
      expect(membrane.toDestination).not.toHaveBeenCalled();
    });
  });
});

// 2026-10-01 (@otoinki/loudness 0.5.0): the trimmed one-hit render starts at
// about sample 0, where `measureLoudness` under-counts the first 300 ms (fewer
// 400 ms gating blocks cover them). The normalisation measures it as a short
// sound instead, and the cache key carries the method version so a gain
// measured the old way is not reused.
describe('per-sound normalisation is measured as a short sound (2026-10-01)', () => {
  it('versions the cache key', () => {
    expect(NORMALIZATION_CACHE_VERSION).toBe(3);
    expect(loudnessCacheKey('kick', 'membrane_808', { octaves: 7 })).toBe('v3:kick:membrane_808:{"octaves":7}');
  });

  it('derives the gain from measureShortSoundLoudness on each trimmed hit', async () => {
    const sampleRate = 44100;
    const length = 2 * sampleRate;
    /** A decaying 100 Hz hit that begins exactly at sample `lead`. */
    const hitAt = (lead: number) => {
      const data = new Float32Array(length);
      for (let i = lead; i < length; i++) {
        const t = (i - lead) / sampleRate;
        data[i] = 0.2 * Math.exp(-t / 0.12) * Math.sin(2 * Math.PI * 100 * t);
      }
      return data;
    };
    // Each render puts its hit where that render triggered its instrument.
    mocks.Offline.mockImplementation(async (callback: () => void) => {
      callback();
      const membranes = mocks.instrumentInstances.membrane;
      const time = membranes[membranes.length - 1].triggerAttackRelease.mock.calls[0][2] as number;
      const data = hitAt(Math.round(time * sampleRate));
      return { sampleRate, numberOfChannels: 2, getChannelData: () => data };
    });
    let gain: number;
    try {
      // Params unique to this test, so the module-level cache cannot answer.
      gain = await measureNormalizationGain('kick', 'membrane_909', { pitchDecay: 0.0417, octaves: 3 });
    } finally {
      mocks.Offline.mockReset();
      mocks.Offline.mockImplementation(mocks.defaultOffline);
    }

    const lead = Math.round(0.005 * sampleRate);
    const hit = [hitAt(lead).slice(lead), hitAt(lead).slice(lead)];
    const target = { targetLufs: DRUM_LOUDNESS.targetLufs, ceilingDbtp: DRUM_LOUDNESS.ceilingDbtp };
    const expected = gainForTarget(measureShortSoundLoudness(hit, sampleRate, 2), target);
    const legacy = gainForTarget(measureLoudness(hit, sampleRate, 2), target);
    expect(gain).toBeCloseTo(expected, 9);
    // The two meters really disagree on this hit, so the assertion above
    // tells them apart.
    expect(Math.abs(20 * Math.log10(gain / legacy))).toBeGreaterThan(0.3);
  });
});

// 2026-10-01 finding: the cymbal played 0.8-1.2 LU over the family target
// while kick/tom/clap landed on it. Measured in headless Chromium, the
// offline measurement and a live hit render a MetalSynth identically when
// triggered at the same position in the 128-frame render quantum; what
// differed was (a) the lane's "neutral" lowpass filter, which was not flat
// in the top octave, and (b) the position: a MetalSynth hit's loudness
// depends on it (1.4 LU across the quantum for metal_closed), and the
// measurement used one position. These tests pin the parts that can be
// checked without real audio.
describe('normalisation measurement matches live playback (2026-10-01)', () => {
  const METAL: Array<[laneId: string, presetId: string]> = [['clap', 'metal_rim']];
  // 2026-10-27: the hats, ride and crash are CymbalSynth (fired with
  // trigger(time, velocity)), measured with the same eight hits as MetalSynth.
  const CYMBAL: Array<[laneId: string, presetId: string]> = [
    ['cymbal', 'metal_closed'],
    ['cymbal', 'metal_open'],
    ['cymbal', 'metal_ride'],
    ['cymbal', 'metal_crash'],
  ];

  it.each(METAL)(
    '%s/%s: the measurement builds and triggers the metal voice exactly as playback does, only the time differs',
    async (laneId, presetId) => {
      const engine = new AudioEngine();
      await engine.initialize();
      await drainPendingRenders();
      engine.changeDrumPreset(laneId, presetId);
      // A decay no other test uses, so the module-level cache cannot answer
      // and the measurement renders happen here.
      engine.setSettings(laneId, { ...engine.getSettings(laneId), decay: 0.0613 });
      await drainPendingRenders();

      const metal = mocks.metalInstances;
      const live = metal.filter((m) => m.context === mocks.toneContexts.live);
      const offline = metal.filter((m) => m.context !== mocks.toneContexts.live);
      const voice = live[live.length - 1];
      expect(normalizationHitCount('metal')).toBe(NORMALIZATION_HITS);
      const measured = offline.slice(-NORMALIZATION_HITS);
      expect(measured).toHaveLength(NORMALIZATION_HITS);
      // Exactly NORMALIZATION_HITS renders for this sound, no more.
      expect(offline.length % NORMALIZATION_HITS).toBe(0);

      voice.triggerAttackRelease.mockClear();
      engine.playDrum(laneId);
      expect(voice.triggerAttackRelease).toHaveBeenCalledTimes(1);
      const [liveNote, liveDuration, , liveVelocity] = voice.triggerAttackRelease.mock.calls[0];

      measured.forEach((instrument, hit) => {
        // Same constructor params and the same post-construction tuning.
        expect(instrument.params).toEqual(voice.params);
        expect(instrument.frequency.value).toBe(voice.frequency.value);
        // Same trigger arguments: note (the build-time frequency), duration,
        // velocity. Only the time differs, and it is the planned one.
        expect(instrument.triggerAttackRelease).toHaveBeenCalledTimes(1);
        const [note, duration, time, velocity] = instrument.triggerAttackRelease.mock.calls[0];
        expect([note, duration, velocity]).toEqual([liveNote, liveDuration, liveVelocity]);
        expect(time).toBe(normalizationTriggerTime(hit, mocks.liveContext.sampleRate));
      });
    }
  );

  it.each(CYMBAL)(
    '%s/%s: the measurement builds and triggers the cymbal voice exactly as playback does, only the time differs',
    async (laneId, presetId) => {
      type Fake = { params: unknown; context: unknown; frequency: { value: number }; trigger: ReturnType<typeof vi.fn> };
      const engine = new AudioEngine();
      await engine.initialize();
      await drainPendingRenders();
      engine.changeDrumPreset(laneId, presetId);
      engine.setSettings(laneId, { ...engine.getSettings(laneId), decay: 0.0613 });
      await drainPendingRenders();

      const all = mocks.cymbalInstances as unknown as Fake[];
      const live = all.filter((m) => m.context === mocks.toneContexts.live);
      const offline = all.filter((m) => m.context !== mocks.toneContexts.live);
      const voice = live[live.length - 1];
      expect(normalizationHitCount('cymbal')).toBe(NORMALIZATION_HITS);
      const measured = offline.slice(-NORMALIZATION_HITS);
      expect(measured).toHaveLength(NORMALIZATION_HITS);
      expect(offline.length % NORMALIZATION_HITS).toBe(0);

      voice.trigger.mockClear();
      engine.playDrum(laneId);
      expect(voice.trigger).toHaveBeenCalledTimes(1);
      const [, liveVelocity] = voice.trigger.mock.calls[0];

      measured.forEach((instrument, hit) => {
        expect(instrument.params).toEqual(voice.params);
        expect(instrument.frequency.value).toBe(voice.frequency.value);
        expect(instrument.trigger).toHaveBeenCalledTimes(1);
        const [time, velocity] = instrument.trigger.mock.calls[0];
        expect(velocity).toBe(liveVelocity);
        expect(time).toBe(normalizationTriggerTime(hit, mocks.liveContext.sampleRate));
      });
    }
  );

  it('spreads the measured hits evenly over one render quantum', () => {
    for (const sampleRate of [44100, 48000, 96000]) {
      const positions = Array.from({ length: NORMALIZATION_HITS }, (_, hit) => {
        const frames = normalizationTriggerTime(hit, sampleRate) * sampleRate;
        return ((frames % RENDER_QUANTUM_FRAMES) + RENDER_QUANTUM_FRAMES) % RENDER_QUANTUM_FRAMES;
      });
      const step = RENDER_QUANTUM_FRAMES / NORMALIZATION_HITS;
      positions.forEach((position, hit) => {
        const expected = (positions[0] + hit * step) % RENDER_QUANTUM_FRAMES;
        expect(position).toBeCloseTo(expected, 6);
      });
      // The first hit keeps the old single-hit offset.
      expect(normalizationTriggerTime(0, sampleRate)).toBeCloseTo(0.005, 12);
    }
  });

  it('combines hits as the power mean of their loudness and the upper median peak', () => {
    const m = (lufs: number, tp: number) => ({ integratedLufs: lufs, truePeakDbfs: tp, samplePeakDbfs: tp - 0.5 });
    const combined = combineHitMeasurements([m(-20, -6), m(-26, -3), m(-Infinity, -Infinity)])!;
    const expected = 10 * Math.log10((10 ** (-20 / 10) + 10 ** (-26 / 10) + 0) / 3);
    expect(combined.integratedLufs).toBeCloseTo(expected, 9);
    expect(combined.truePeakDbfs).toBe(-6);
    expect(combined.samplePeakDbfs).toBe(-6.5);
    // Even count: the higher of the two middle peaks.
    expect(combineHitMeasurements([m(-20, -9), m(-20, -2), m(-20, -5), m(-20, -7)])!.truePeakDbfs).toBe(-5);
    expect(combineHitMeasurements([])).toBeNull();
    expect(combineHitMeasurements([m(-Infinity, -Infinity)])).toBeNull();
  });

  it('builds no lane filter for a lane without a filter setting, and the bus feeds the distortion', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    // Only the shared space's two return high-passes exist.
    expect(mocks.FakeFilter.instances).toHaveLength(2);
    expect(mocks.FakeFilter.instances.every((f) => f.options.type === 'highpass')).toBe(true);
    // Every lane bus connects straight to a distortion stage.
    const distortions = new Set<unknown>(mocks.FakeDistortion.instances);
    const busesIntoDistortion = mocks.FakeGain.instances.filter((g) =>
      g.connect.mock.calls.some((call) => distortions.has(call[0]))
    );
    expect(busesIntoDistortion.length).toBeGreaterThanOrEqual(DEFAULT_LANES.length);

    // A lane that does set a filter still gets one, and its bus feeds it.
    engine.setLaneFx('kick', { filter: { type: 'lowpass', frequency: 3000 } });
    const lowpass = mocks.FakeFilter.instances.find((f) => f.options.type === 'lowpass');
    expect(lowpass?.options.frequency).toBe(3000);
    expect(
      mocks.FakeGain.instances.some((g) => g.connect.mock.calls.some((call) => call[0] === lowpass))
    ).toBe(true);
  });
});

describe('initialize() does not swallow a failure', () => {
  it('rejects when the audio context cannot resume, leaves the engine silent, and a later call can try again', async () => {
    const engine = new AudioEngine();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.liveContext.state = 'suspended';
    mocks.liveContext.resume.mockRejectedValueOnce(new Error('context blocked'));
    try {
      await expect(engine.initialize()).rejects.toThrow('context blocked');

      // Not initialised: a hit is a no-op rather than a thrown error.
      engine.playDrum('kick');
      expect(mocks.instrumentInstances.membrane).toHaveLength(0);

      // The failure did not poison the engine: once the context resumes, a
      // second initialize() completes and the engine plays.
      await engine.initialize();
      engine.playDrum('kick');
      expect(mocks.instrumentInstances.membrane[0].triggerAttackRelease).toHaveBeenCalledTimes(1);
    } finally {
      mocks.liveContext.state = 'running';
      errorSpy.mockRestore();
    }
  });
});

describe('resumeIfInterrupted()', () => {
  it('resumes a context a phone call left suspended, and does nothing while it runs', async () => {
    const engine = new AudioEngine();
    mocks.liveContext.resume.mockClear();
    mocks.liveContext.state = 'suspended';
    try {
      await engine.resumeIfInterrupted();
      expect(mocks.liveContext.resume).toHaveBeenCalledTimes(1);

      mocks.liveContext.state = 'running';
      await engine.resumeIfInterrupted();
      expect(mocks.liveContext.resume).toHaveBeenCalledTimes(1);
    } finally {
      mocks.liveContext.state = 'running';
    }
  });

  it('does not throw when resume fails, and the next gesture tries again', async () => {
    const engine = new AudioEngine();
    mocks.liveContext.resume.mockClear();
    mocks.liveContext.state = 'suspended';
    mocks.liveContext.resume.mockRejectedValueOnce(new Error('interrupted'));
    try {
      await expect(engine.resumeIfInterrupted()).resolves.toBeUndefined();
      await engine.resumeIfInterrupted();
      expect(mocks.liveContext.resume).toHaveBeenCalledTimes(2);
    } finally {
      mocks.liveContext.state = 'running';
    }
  });
});

describe('sound document: per-lane sounds survive a reload', () => {
  /** A localStorage that lives in a Map (these tests run in plain Node). */
  function memoryStorage() {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };
  }

  /** Edits a kick lane the way the UI does: another preset on layer 0 with a
   *  moved slider, a different second layer, a third layer, and a filter on
   *  the tom. */
  function editKit(engine: AudioEngine) {
    const [main, second] = engine.getLayers('kick');
    engine.updateLayer('kick', main.layerId, { presetId: 'membrane_909' });
    engine.setLayerSettings('kick', main.layerId, {
      ...engine.getLayerSettings('kick', main.layerId),
      decay: 0.9,
    });
    engine.updateLayer('kick', second.layerId, { presetId: 'mono_analog', gainDb: -9, pan: 0.5 });
    engine.setLayerSettings('kick', second.layerId, {
      ...engine.getLayerSettings('kick', second.layerId),
      decay: 0.7,
    });
    engine.addLayer('kick', 'synth_blip');
    engine.setLaneFx('tom', { filter: { type: 'lowpass', frequency: 2500 }, reverbSend: 0.3 });
  }

  const viaJson = (engine: AudioEngine) => JSON.parse(JSON.stringify(engine.getSoundDocument()));
  const houseBasis = () => SOUND_BASES.theory.House;
  const houseSpace = () => SOUND_SPACES.theory.House;

  it('a changed preset, slider, extra layer and lane effect come back in a new engine', async () => {
    const before = new AudioEngine();
    await before.initialize();
    editKit(before);
    const doc = viaJson(before);
    expect(doc.version).toBe(1);

    const after = new AudioEngine();
    await after.initialize();
    expect(after.getCurrentPreset('kick')).toBe('membrane_808'); // default, before loading
    const restored = after.loadSoundDocument(doc);

    expect(restored.sort()).toEqual(['clap', 'cymbal', 'kick', 'tom']);
    expect(after.getCurrentPreset('kick')).toBe('membrane_909');
    const layers = after.getLayers('kick');
    expect(layers.map((l) => l.presetId)).toEqual(['membrane_909', 'mono_analog', 'synth_blip']);
    expect(layers[1]).toMatchObject({ gainDb: -9, pan: 0.5 });
    expect(after.getLayerSettings('kick', layers[0].layerId).decay).toBe(0.9);
    expect(after.getLayerSettings('kick', layers[1].layerId).decay).toBe(0.7);
    expect(after.getLaneFx('tom')).toEqual({ filter: { type: 'lowpass', frequency: 2500 }, reverbSend: 0.3 });
    // The rebuilt voices are the saved ones: a membrane synth was built with
    // the saved decay.
    expect(
      mocks.instrumentInstances.membrane.some((m) => JSON.stringify(m.params).includes('"decay":0.9'))
    ).toBe(true);
  });

  it('survives the real storage round trip: autosave flush -> localStorage -> a new engine', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    try {
      const before = new AudioEngine();
      await before.initialize();
      const autosave = startSoundAutosave(before);
      editKit(before);
      expect(storage.data.has(LAYER_STORAGE_KEY)).toBe(false); // debounced, not yet written
      autosave.flush();
      expect(JSON.parse(storage.data.get(LAYER_STORAGE_KEY)!).version).toBe(1);
      autosave.stop();

      const after = new AudioEngine();
      await after.initialize();
      after.loadSoundDocument(readSoundDocument());
      expect(after.getCurrentPreset('kick')).toBe('membrane_909');
      const [main] = after.getLayers('kick');
      expect(after.getLayerSettings('kick', main.layerId).decay).toBe(0.9);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a saved lane wins over the genre default; lanes it does not name still take the default', async () => {
    const before = new AudioEngine();
    await before.initialize();
    before.updateLayer('kick', before.getLayers('kick')[0].layerId, { presetId: 'membrane_acoustic' });
    const doc = viaJson(before);
    delete doc.lanes.clap; // no saved sound for the clap

    const after = new AudioEngine();
    await after.initialize();
    const restored = after.loadSoundDocument(doc);
    expect(restored).not.toContain('clap');
    await after.applySoundBasis(houseBasis(), houseSpace(), { respectSaved: true, keepLanes: restored });

    expect(after.getCurrentPreset('kick')).toBe('membrane_acoustic');
    expect(after.getCurrentPreset('clap')).toBe(houseBasis().clap.main.presetId);
    expect(after.getLayers('clap').map((l) => l.presetId)).toEqual([
      houseBasis().clap.main.presetId,
      houseBasis().clap.layer.presetId,
    ]);

    // An explicit genre change (no keepLanes) still replaces everything.
    await after.applySoundBasis(houseBasis(), houseSpace());
    expect(after.getCurrentPreset('kick')).toBe(houseBasis().kick.main.presetId);
  });

  it('restores a lane added past the original four; ignores a saved lane that no longer exists or changed category', async () => {
    const before = new AudioEngine();
    await before.initialize();
    before.addLane('kick-2', 'kick');
    before.updateLayer('kick-2', before.getLayers('kick-2')[0].layerId, { presetId: 'membrane_909' });
    const doc = viaJson(before);
    expect(Object.keys(doc.lanes)).toContain('kick-2');

    const same = new AudioEngine();
    await same.initialize();
    same.addLane('kick-2', 'kick');
    expect(same.loadSoundDocument(doc)).toContain('kick-2');
    expect(same.getCurrentPreset('kick-2')).toBe('membrane_909');

    const gone = new AudioEngine();
    await gone.initialize();
    expect(gone.loadSoundDocument(doc)).not.toContain('kick-2');
    expect(gone.getLayers('kick-2')).toEqual([]);

    const reused = new AudioEngine();
    await reused.initialize();
    reused.addLane('kick-2', 'tom'); // the id now belongs to a tom lane
    const tomDefault = reused.getLayers('kick-2').map((l) => l.presetId);
    expect(reused.loadSoundDocument(doc)).not.toContain('kick-2');
    expect(reused.getLayers('kick-2').map((l) => l.presetId)).toEqual(tomDefault);
  });

  it('a removed lane is gone from the next document', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    engine.addLane('kick-2', 'kick');
    expect(Object.keys(engine.getSoundDocument().lanes)).toContain('kick-2');
    engine.removeLane('kick-2');
    expect(Object.keys(engine.getSoundDocument().lanes)).not.toContain('kick-2');
  });

  const noDelay = { enabled: false, timeMs: 5, feedback: 0, wet: 0 };
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'not a document'],
    ['a number', 42],
    ['an array', []],
    ['an empty object', {}],
    ['no lanes', { version: 1 }],
    ['lanes as an array', { version: 1, lanes: [] }],
    ['another version', { version: 2, lanes: { kick: { category: 'kick', layers: [] } } }],
    ['a version as a string', { version: '1', lanes: {} }],
    ['layers that are not an array', { version: 1, lanes: { kick: { category: 'kick', layers: 'nope' } } }],
    ['a lane that is not an object', { version: 1, lanes: { kick: 7 } }],
    [
      'only invalid layers',
      {
        version: 1,
        lanes: {
          kick: {
            category: 'kick',
            layers: [
              { layerId: 'a', presetId: 'no_such_preset', gainDb: 0, pan: 0, delay: noDelay },
              { layerId: 'b', presetId: 'membrane_909', gainDb: Number.NaN, pan: 0, delay: noDelay },
            ],
          },
        },
      },
    ],
  ])('%s: loads nothing, does not throw, keeps the defaults', async (_name, doc) => {
    const engine = new AudioEngine();
    await engine.initialize();
    const before = engine.getSoundDocument();
    expect(() => engine.loadSoundDocument(doc)).not.toThrow();
    expect(engine.loadSoundDocument(doc)).toEqual([]);
    expect(engine.getSoundDocument()).toEqual(before);
  });

  it('runs saved values through the range clamps and drops what is not valid', async () => {
    const layer = (layerId: string, over: Record<string, unknown> = {}) => ({
      layerId,
      presetId: 'membrane_909',
      gainDb: 0,
      pan: 0,
      delay: { enabled: true, timeMs: 5, feedback: 0, wet: 0 },
      ...over,
    });
    const doc = {
      version: 1,
      lanes: {
        kick: {
          category: 'kick',
          layers: [layer('k1', { gainDb: 99, pan: 7, delay: { enabled: true, timeMs: 9999, feedback: 5, wet: 3 } })],
          mainSettings: {
            membrane_909: { decay: 99, release: 0.3, bogus: 1, octaves: 'x' },
            no_such_preset: { decay: 0.2 },
          },
          layerSettings: {},
          fx: {
            filter: { type: 'evil', frequency: 3000 },
            distortion: { amount: 9, wet: 0.5 },
            compressor: { threshold: -99, ratio: 4, attack: 0.01 }, // release missing -> dropped whole
            reverbSend: 9,
            delaySend: 'x',
          },
        },
      },
    };
    const engine = new AudioEngine();
    await engine.initialize();
    expect(engine.loadSoundDocument(doc)).toEqual(['kick']);

    const [main] = engine.getLayers('kick');
    expect(main).toMatchObject({ gainDb: 6, pan: 1 });
    expect(main.delay).toMatchObject({ timeMs: 400, feedback: 0.6, wet: 1 });
    // Out-of-range / unknown / non-numeric slider fields are dropped, the
    // valid one is kept; the unknown preset's entry is gone entirely.
    expect(engine.getAllSettings()).toEqual({ 'kick:membrane_909': { release: 0.3 } });
    expect(engine.getLaneFx('kick')).toEqual({ distortion: { amount: 1, wet: 0.5 }, reverbSend: 0.8 });
  });

  it('does not let two saved layers share one layer id (it keys the slider overrides)', async () => {
    const layer = (layerId: string) => ({ layerId, presetId: 'membrane_909', gainDb: 0, pan: 0, delay: noDelay });
    const engine = new AudioEngine();
    await engine.initialize();
    engine.loadSoundDocument({
      version: 1,
      lanes: {
        kick: { category: 'kick', layers: [layer('same'), layer('same')] },
        tom: { category: 'tom', layers: [{ ...layer('same'), presetId: 'membrane_mid' }] },
      },
    });
    expect(engine.getLayers('kick').map((l) => l.layerId)).toEqual(['same']);
    // The tom's layer used an id already taken by the kick: not restored.
    expect(engine.getLayers('tom').map((l) => l.presetId)).not.toEqual(['membrane_mid']);
  });

  it('tells listeners about edits, not about loading a document, and stops after unsubscribe', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    const listener = vi.fn();
    const unsubscribe = engine.subscribeChange(listener);

    engine.loadSoundDocument(viaJson(engine));
    expect(listener).not.toHaveBeenCalled();

    engine.changeDrumPreset('kick', 'membrane_909');
    engine.setLaneFx('tom', {});
    engine.addLayer('kick');
    engine.addLane('kick-2', 'kick');
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    engine.changeDrumPreset('kick', 'membrane_808');
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('storage that refuses a write or holds junk is survived (private mode, corrupt save)', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      vi.stubGlobal('localStorage', {
        getItem: () => '{not json',
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      });
      expect(readSoundDocument()).toBeNull();
      expect(writeSoundDocument(engine)).toBe(false);

      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('SecurityError');
        },
      });
      expect(readSoundDocument()).toBeNull();
      expect(engine.loadSoundDocument(readSoundDocument())).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      warn.mockRestore();
    }
  });
});

// 2026-10-29: the soft peak limiter (drumLoudness.ts) sits between a layer's
// normGain and its panner for the presets marked peakLimit, and nowhere else.
describe('soft peak limiter placement', () => {
  it('marks exactly the presets that stand for the phone voices that need it', async () => {
    const { SYNTH_PRESETS } = await import('./synthPresets');
    const marked: string[] = [];
    for (const [category, presets] of Object.entries(SYNTH_PRESETS)) {
      for (const [id, preset] of Object.entries(presets)) if (preset.peakLimit) marked.push(`${category}/${id}`);
    }
    expect(marked.sort()).toEqual(
      ['clap/noise_clap', 'clap/noise_snare', 'cymbal/metal_closed', 'cymbal/metal_open', 'kick/membrane_808'].sort()
    );
  });

  it('builds one limiter per marked layer and wires normGain -> limiter -> panner', async () => {
    const { getPreset } = await import('./synthPresets');
    (PeakLimiterNode as unknown as { instances: unknown[] }).instances.length = 0;
    const engine = new AudioEngine();
    await engine.initialize();
    await drainPendingRenders();
    const expected = Object.values(DEFAULT_LAYERS)
      .flat()
      .filter((layer) => {
        for (const category of ['kick', 'tom', 'cymbal', 'clap'] as const) {
          const preset = getPreset(category, layer.presetId);
          if (preset) return Boolean(preset.peakLimit);
        }
        return false;
      }).length;
    expect(expected).toBeGreaterThan(0);
    const made = (PeakLimiterNode as unknown as { instances: { output: { connect: ReturnType<typeof vi.fn> } }[] }).instances;
    expect(made).toHaveLength(expected);
    made.forEach((limiter) => expect(limiter.output.connect).toHaveBeenCalledTimes(1));
    engine.dispose();
  });
});
