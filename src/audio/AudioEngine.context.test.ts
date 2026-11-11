// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Regression test for the production bug "InvalidAccessError: cannot connect
// to an AudioNode belonging to a different audio context" on first PLAY.
//
// Real Tone.Offline sets the *global* context to an OfflineContext, awaits
// its callback (a microtask yield) and only then restores the original. The
// engine's per-layer loudness measurement starts a Tone.Offline from inside
// buildLayer, so every layer built after the first one in the same
// synchronous pass used to be constructed in the offline context and then
// connected to a bus living in the live one.
//
// These fakes reproduce exactly that: every node remembers the global context
// at construction, connect() throws the browser's InvalidAccessError on a
// mismatch, and Offline swaps/yields/restores the way tone 14.9.17 does.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => {
  interface Ctx {
    name: string;
    state: string;
    resume: () => Promise<void>;
    now: () => number;
    currentTime: number;
    rawContext?: unknown;
  }
  const live: Ctx = { name: 'live', state: 'running', resume: async () => {}, now: () => 0, currentTime: 0 };
  // The shared @otoinki/loudness master bus is built on the live context's
  // raw context; its nodes belong to the live context too.
  const rawParam = () => ({ value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} });
  const rawNode = () => ({
    context: live,
    gain: rawParam(),
    threshold: rawParam(),
    knee: rawParam(),
    ratio: rawParam(),
    attack: rawParam(),
    release: rawParam(),
    connect: (d: unknown) => d,
    disconnect: () => {},
  });
  live.rawContext = { currentTime: 0, destination: {}, createGain: rawNode, createDynamicsCompressor: rawNode };
  let current: Ctx = live;
  const created: FakeNode[] = [];

  const param = (value = 0) => ({ value, rampTo: vi.fn() });

  class FakeNode {
    readonly context: Ctx = current;
    gain = param(1);
    pan = param();
    wet = param(1);
    delayTime = param();
    feedback = param();
    frequency = param();
    threshold = param();
    // Tone.Compressor's release Param: the offline renders arm it for the
    // cold-start window (2026-10-01).
    release = { value: 0, setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
    triggerAttackRelease = vi.fn();
    triggerAttack = vi.fn();
    constructor(..._args: unknown[]) {
      created.push(this);
    }
    connect(destination: FakeNode) {
      if (destination.context !== this.context) {
        throw new Error(
          'InvalidAccessError: cannot connect to an AudioNode belonging to a different audio context'
        );
      }
      return destination;
    }
    toDestination() {
      return this;
    }
    disconnect() {}
    dispose() {}
    get ready() {
      return Promise.resolve();
    }
  }

  let offlineCount = 0;
  async function Offline(callback: () => unknown, duration: number) {
    const original = current;
    current = { ...live, name: `offline-${++offlineCount}` };
    await callback();
    current = original;
    await Promise.resolve();
    const length = Math.round(44100 * duration);
    const data = new Float32Array(length);
    for (let i = 0; i < 4410; i++) data[i] = Math.sin(i / 10) * 0.5;
    return { sampleRate: 44100, numberOfChannels: 2, getChannelData: () => data };
  }

  return {
    live,
    created,
    FakeNode,
    Offline,
    getContext: () => current,
    setContext: (ctx: Ctx) => {
      current = ctx;
    },
    reset() {
      current = live;
      created.length = 0;
    },
  };
});

// 2026-10-27: the cymbal family is CymbalSynth, built from Tone.Oscillator and
// friends that this file's all-purpose fake 'tone' does not provide; it is a
// plain fake node here, like MetalSynth was.
vi.mock('./CymbalSynth', () => ({
  CymbalSynth: class extends fx.FakeNode {
    // (FakeNode already has a `frequency`.)
    trigger() {}
  },
}));

vi.mock('./peakLimiter', () => ({
  // Fake nodes of the current context, so a connect across contexts still fails.
  PeakLimiterNode: class {
    input = new fx.FakeNode();
    output = new fx.FakeNode();
    dispose() {}
  },
}));

vi.mock('tone', () => {
  const N = fx.FakeNode;
  return {
    Gain: N,
    Panner: N,
    FeedbackDelay: N,
    Limiter: N,
    Filter: N,
    Distortion: N,
    Compressor: N,
    Delay: N,
    Reverb: N,
    MembraneSynth: N,
    NoiseSynth: N,
    MetalSynth: N,
    FMSynth: N,
    AMSynth: N,
    MonoSynth: N,
    DuoSynth: N,
    Synth: N,
    PluckSynth: N,
    Transport: { bpm: { value: 120 }, scheduleRepeat: vi.fn(), clear: vi.fn(), start: vi.fn(), stop: vi.fn() },
    Draw: { schedule: vi.fn() },
    Offline: fx.Offline,
    getContext: fx.getContext,
    setContext: fx.setContext,
    start: vi.fn(async () => {}),
    now: () => 0,
    dbToGain: (db: number) => Math.pow(10, db / 20),
  };
});

import type { AudioEngine as AudioEngineType } from './AudioEngine';

// AudioEngine keeps a module-level loudness cache, so a test that runs after
// another one finds every default sound already measured and starts no
// offline render. Each test loads a fresh copy of the module (fresh cache,
// fresh render queue) instead of depending on running first.
let AudioEngine: typeof AudioEngineType;

beforeEach(async () => {
  fx.reset();
  vi.resetModules();
  ({ AudioEngine } = await import('./AudioEngine'));
});

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

describe('live nodes share one audio context (first-PLAY InvalidAccessError)', () => {
  it('builds every live node on the live context even while loudness renders are in flight', async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });

    const engine = new AudioEngine();
    await engine.initialize();
    await flush();

    // Adding a lane and changing a preset later also build nodes, with
    // measurements from the previous pass possibly still pending.
    engine.addLane('kick-2', 'kick');
    await flush();

    spy.mockRestore();
    expect(errors).toEqual([]);
    const liveNodes = fx.created.filter((node) => node.context.name === 'live');
    expect(liveNodes.length).toBeGreaterThan(0);
    // Offline nodes exist (measurements ran) ...
    const offlineNodes = fx.created.filter((node) => node.context.name !== 'live');
    expect(offlineNodes.length).toBeGreaterThan(0);
    // ... and the global context is back on the live one afterwards.
    expect(fx.getContext()).toBe(fx.live);
  });

  it('serialises offline renders so the global context is never left on an OfflineContext', async () => {
    const engine = new AudioEngine();
    await engine.initialize();
    // Kick off several renders at once, as an export during live edits would.
    await Promise.all([engine.renderOneShot('kick'), engine.renderOneShot('snare'), flush()]);
    await flush();
    expect(fx.getContext()).toBe(fx.live);
  });
});
