// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// The cymbal family's own voice (hats, ride, crash), added 2026-10-27 after the
// owner said the cymbal was too light.
//
// Why not Tone.MetalSynth any more: measured offline in headless Chromium at
// 44.1 kHz, every MetalSynth cymbal preset had 99% of its power above 6 kHz
// (spectral centroid 12.9 kHz closed hat, 17 kHz crash) and none below 2 kHz.
// Its six FM'd square waves alias into a hiss, and its high-pass sweeps up to
// resonance * 2^octaves (38.7 kHz for the crash, above Nyquist) at the start of
// every hit. A hat that is only hiss sounds thin and "light" however loud it is.
// It also took 309 Web Audio nodes (77 sources) per hit.
//
// What this voice is instead (all synthesised, nothing recorded, no samples):
//   ring  - sine partials at inharmonic ratios of `frequency` (the plate's
//           modes): the pitched shimmer and the low-mid body
//   wash  - white noise through a high-pass at `resonance` and a low-pass at
//           `washCeilingHz`: the dense part of a cymbal, with a slower rise
//           for a crash (`washAttack`)
//   click - a very short high-passed noise burst: the stick
// Each part has its own gain and its own decay, so the tail darkens the way a
// struck plate does (the high ring dies first, the low ring and the wash last).
//
// `decay` is the time to -60 dB, in seconds (Tone's own Envelope uses
// ln(1 + decay) / ln(200) as a time constant, which flattens long values and
// made a decay of 2 s reach only -40 dB at 0.95 s). Roughly 20 dB at decay / 3
// and 40 dB at 2 decay / 3.
//
// Parameters are the same keys the old presets had where the meaning still
// holds (frequency, attack, decay, release, resonance, volume), so a saved
// slider setting still loads. Keys this voice does not read (harmonicity,
// modulationIndex, octaves) are ignored.
import * as Tone from 'tone';

export interface CymbalParams {
  /** Lowest ring partial, Hz. */
  frequency: number;
  envelope: { attack: number; decay: number; release?: number };
  /** Wash high-pass corner, Hz (the old MetalSynth "resonance" slider). */
  resonance: number;
  /** Output level, dB. */
  volume: number;
  /** Frequency ratios of the ring partials. */
  partials: number[];
  /** Ring level against the wash, dB (wash is the 0 dB reference). */
  ringDb: number;
  /** Stick click level against the wash, dB. */
  clickDb: number;
  /** Wash low-pass corner, Hz. */
  washCeilingHz: number;
  /** Wash rise time as seconds (the crash's soft attack); 0 = same as attack. */
  washAttack: number;
  /** Ring decay as a fraction of `decay`. */
  ringDecay: number;
  /** Decay of the ring partials above 2.5 kHz, fraction of `ringDecay`. */
  ringHighDecay: number;
  /** Wash decay as a fraction of `decay`. */
  washDecay: number;
  /** Click length, seconds. */
  clickLength: number;
}

/** Inharmonic partial ratios of a struck plate: the 808 cymbal's six
 *  (1, 1.483, 1.932, 2.546, 2.63, 3.897) extended upward. */
export const PLATE_PARTIALS = [1, 1.483, 1.932, 2.546, 2.63, 3.897, 5.31, 7.12, 9.63];

export const CYMBAL_DEFAULTS: CymbalParams = {
  frequency: 320,
  envelope: { attack: 0.001, decay: 1, release: 0.1 },
  resonance: 3000,
  volume: -14,
  partials: PLATE_PARTIALS,
  ringDb: -6,
  clickDb: -12,
  washCeilingHz: 14000,
  washAttack: 0,
  ringDecay: 1,
  ringHighDecay: 0.5,
  washDecay: 1,
  clickLength: 0.012,
};

const finite = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The settings this voice really uses, from a preset's params merged with
 *  slider overrides: every value finite and inside a safe range, so a corrupt
 *  save cannot throw in a Tone constructor. Pure; tested without audio. */
export function cymbalRecipe(input: Record<string, unknown>): CymbalParams {
  const d = CYMBAL_DEFAULTS;
  const env = (input.envelope ?? {}) as Record<string, unknown>;
  const partials = Array.isArray(input.partials)
    ? (input.partials as unknown[]).filter((r): r is number => typeof r === 'number' && r > 0 && Number.isFinite(r)).slice(0, 16)
    : d.partials;
  return {
    frequency: clamp(finite(input.frequency, d.frequency), 40, 4000),
    envelope: {
      attack: clamp(finite(env.attack, d.envelope.attack), 0.0003, 0.5),
      decay: clamp(finite(env.decay, d.envelope.decay), 0.01, 6),
      release: clamp(finite(env.release, d.envelope.release ?? 0.1), 0.001, 4),
    },
    resonance: clamp(finite(input.resonance, d.resonance), 100, 12000),
    volume: clamp(finite(input.volume, d.volume), -60, 12),
    partials: partials.length > 0 ? partials : d.partials,
    ringDb: clamp(finite(input.ringDb, d.ringDb), -60, 24),
    clickDb: clamp(finite(input.clickDb, d.clickDb), -60, 24),
    washCeilingHz: clamp(finite(input.washCeilingHz, d.washCeilingHz), 1000, 20000),
    washAttack: clamp(finite(input.washAttack, d.washAttack), 0, 0.2),
    ringDecay: clamp(finite(input.ringDecay, d.ringDecay), 0.05, 2),
    ringHighDecay: clamp(finite(input.ringHighDecay, d.ringHighDecay), 0.05, 2),
    washDecay: clamp(finite(input.washDecay, d.washDecay), 0.05, 2),
    clickLength: clamp(finite(input.clickLength, d.clickLength), 0.002, 0.05),
  };
}

/** Seconds after the hit's attack until a part with time-to-(-60 dB) `decay`
 *  has fallen `db` dB (positive). */
export function secondsToFall(decay: number, db: number): number {
  return (decay * db) / 60;
}

/** Highest ring partial frequency kept (Hz): above this the sine is noise to
 *  the ear and a risk of aliasing near Nyquist at 44.1 kHz. */
const MAX_PARTIAL_HZ = 16000;

/** Ring partials above this decay faster (`ringHighDecay`). */
const HIGH_RING_HZ = 2500;

/** Length of the shared white-noise buffer, seconds. Each hit starts it at a
 *  random offset and it loops. */
const NOISE_SECONDS = 4;

const dbToGain = (db: number) => Math.pow(10, db / 20);

/** One white-noise buffer per audio context, shared by every cymbal voice. */
const noiseBuffers = new WeakMap<object, AudioBuffer>();

function noiseBufferFor(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** One decaying part: a Gain whose gain follows attack -> exponential decay. */
function strike(gain: Tone.Gain, time: number, peak: number, attack: number, decay60: number): void {
  const g = gain.gain;
  g.cancelScheduledValues(time);
  g.setValueAtTime(0, time);
  g.linearRampToValueAtTime(peak, time + attack);
  // setTargetAtTime's time constant: -60 dB (a factor of 1000) after decay60.
  g.setTargetAtTime(0, time + attack, decay60 / Math.log(1000));
}

type Source = OscillatorNode | AudioBufferSourceNode;

/**
 * The voice. The long-lived part is a Tone graph (part gains, filters, output);
 * the sound sources are plain Web Audio nodes made per hit and released when
 * they end (a sine per partial, two noise buffer sources). That is the usual
 * Web Audio pattern and avoids two things measured with Tone's own sources
 * (2026-10-27): Tone's Source.start() on a source still sounding adds a second
 * Web Audio node next to the old one, so a crash retriggered every 16th stacked
 * to +16 dB over 16 hits, and a scheduled stop cannot be moved later once it
 * has passed. A new hit stops the old hit's sources at its own start (a choke,
 * as when a cymbal is struck again).
 */
export class CymbalSynth {
  /** Base frequency; assignable like MetalSynth's, read by the MIDI export. */
  readonly frequency: { value: number };
  private readonly p: CymbalParams;
  private readonly out: Tone.Gain;
  private readonly ringLow: Tone.Gain;
  private readonly ringHigh: Tone.Gain;
  private readonly washIn: Tone.Filter;
  private readonly washGain: Tone.Gain;
  private readonly clickIn: Tone.Filter;
  private readonly clickGain: Tone.Gain;
  private readonly partialGains: { ratio: number; gain: Tone.Gain; high: boolean }[] = [];
  private readonly nodes: Tone.ToneAudioNode[] = [];
  private active: Source[] = [];

  constructor(params: Record<string, unknown>) {
    const p = cymbalRecipe(params);
    this.p = p;
    this.frequency = { value: p.frequency };
    this.out = new Tone.Gain(dbToGain(p.volume));

    this.ringLow = new Tone.Gain(0).connect(this.out);
    this.ringHigh = new Tone.Gain(0).connect(this.out);
    const ringLevel = dbToGain(p.ringDb);
    p.partials.forEach((ratio) => {
      if (p.frequency * ratio > MAX_PARTIAL_HZ) return;
      const high = p.frequency * ratio >= HIGH_RING_HZ;
      // Weight falls with frequency (a plate's low modes carry more), and the
      // sum is spread over the partials so adding one does not make it louder.
      const weight = (0.35 * ringLevel * Math.pow(ratio, -0.6)) / Math.sqrt(p.partials.length);
      const gain = new Tone.Gain(weight).connect(high ? this.ringHigh : this.ringLow);
      this.partialGains.push({ ratio, gain, high });
    });

    // Wash: noise -> high-pass at `resonance` -> low-pass -> strike gain.
    this.washIn = new Tone.Filter({ type: 'highpass', frequency: p.resonance, rolloff: -24 });
    const washLow = new Tone.Filter({ type: 'lowpass', frequency: p.washCeilingHz, rolloff: -12 });
    this.washGain = new Tone.Gain(0);
    this.washIn.chain(washLow, this.washGain, this.out);

    // Click: noise -> high-pass -> very short strike gain.
    this.clickIn = new Tone.Filter({ type: 'highpass', frequency: Math.max(4000, p.resonance), rolloff: -12 });
    this.clickGain = new Tone.Gain(0);
    this.clickIn.chain(this.clickGain, this.out);

    this.nodes.push(this.out, this.ringLow, this.ringHigh, this.washIn, washLow, this.washGain, this.clickIn, this.clickGain);
    this.partialGains.forEach(({ gain }) => this.nodes.push(gain));
  }

  connect(destination: Tone.InputNode): this {
    this.out.connect(destination);
    return this;
  }

  /** Every cymbal rings out: the note length is ignored (a hat is shortened by
   *  its own `decay`, as on the old presets, not by the step length). */
  triggerAttackRelease(_note: unknown, _duration: unknown, time: number = Tone.now(), velocity = 1): this {
    return this.trigger(time, velocity);
  }

  trigger(time: number = Tone.now(), velocity = 1): this {
    const p = this.p;
    const v = clamp(velocity, 0, 1);
    const { attack, decay } = p.envelope;
    const washAttack = p.washAttack > 0 ? p.washAttack : attack;
    const ringDecay = decay * p.ringDecay;
    const highDecay = ringDecay * p.ringHighDecay;
    const washDecay = decay * p.washDecay;

    strike(this.ringLow, time, v, attack, ringDecay);
    strike(this.ringHigh, time, v, attack, highDecay);
    strike(this.washGain, time, v, washAttack, washDecay);
    strike(this.clickGain, time, v * dbToGain(p.clickDb), 0.0005, p.clickLength);

    // Choke the previous hit: its sources stop where this one starts. The
    // strike gains above are 0 from `time`, so the cut is silent.
    for (const source of this.active) {
      try {
        source.stop(time);
      } catch {
        // already ended
      }
    }
    this.active = [];

    const ctx = this.out.context.rawContext as unknown as BaseAudioContext;
    const end = (attackSeconds: number, decay60: number) => time + attackSeconds + decay60 + 0.02;
    const track = (source: Source) => {
      this.active.push(source);
      source.onended = () => {
        source.disconnect();
        this.active = this.active.filter((s) => s !== source);
      };
    };

    // The partials are re-pitched on every hit so `frequency` can be assigned
    // after construction (the MIDI export and the slider do).
    this.partialGains.forEach(({ ratio, gain, high }) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = this.frequency.value * ratio;
      Tone.connect(osc as unknown as AudioNode, gain);
      osc.start(time);
      osc.stop(end(attack, high ? highDecay : ringDecay));
      track(osc);
    });

    const noise = (target: Tone.Filter, until: number) => {
      const source = ctx.createBufferSource();
      source.buffer = noiseBufferFor(ctx);
      source.loop = true;
      Tone.connect(source as unknown as AudioNode, target);
      // A random start inside the buffer, so no two hits are the same noise.
      source.start(time, Math.random() * (NOISE_SECONDS - 0.5));
      source.stop(until);
      track(source);
    };
    noise(this.washIn, end(washAttack, washDecay));
    noise(this.clickIn, end(0.0005, p.clickLength * 1.5));
    return this;
  }

  dispose(): this {
    for (const source of this.active) {
      try {
        source.stop();
      } catch {
        // already ended
      }
      source.disconnect();
    }
    this.active = [];
    this.nodes.forEach((node) => node.dispose());
    return this;
  }
}
