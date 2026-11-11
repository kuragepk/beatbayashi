// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0 AND (CC0-1.0 OR MIT-0)
//
// Two licences, two parts: the TypeScript code in this file is MIT-0; the preset
// parameter data (names, synth types, parameter values, triggers) is offered
// under CC0 1.0 or MIT-0, whichever you choose (owner decision 2026-10-02).
// See LICENSES/CC0-1.0.txt, LICENSES/MIT-0.txt and REUSE.toml.
// Tone.js instrument presets for the drum machine.
//
// Tone.js ships purpose-built percussion instruments. Using the right class for
// each role matters more than tweaking parameters:
//   MembraneSynth - pitch-swept oscillator. The correct choice for kicks and toms.
//   NoiseSynth    - filtered noise burst. The correct choice for claps and snares.
//   MetalSynth    - six detuned square waves through a bandpass. The rimshot.
//   CymbalSynth   - src/audio/CymbalSynth.ts: inharmonic sine partials + high-passed
//                   noise with separate decays. Hats, ride and crash (2026-10-27;
//                   they were MetalSynth, 99% of their power above 6 kHz).
//   FMSynth       - frequency modulation. Tuned/melodic percussion.
//   AMSynth       - amplitude modulation. Softer, hollower bodies.
//   MonoSynth     - oscillator + filter + two envelopes. Synthetic/analog voices.
//   PluckSynth    - Karplus-Strong string. Rim shots and wood blocks.
//
// Presets are listed most-used-first within each drum: the order in this object
// is the order of the dropdown. Ranking reflects how commonly each synthesis
// approach is used for that role in electronic drum programming, not a measured
// popularity statistic.

// Every concrete instrument Tone.js 14.9.17 ships, verified against
// node_modules/tone/build/esm/instrument. The two omitted classes are not
// voices: PolySynth is a polyphony wrapper (drums are monophonic by nature)
// and Sampler needs audio files, which this app deliberately does not bundle.
export type SynthPresetType =
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

export type DrumId = 'kick' | 'tom' | 'cymbal' | 'clap';

export interface SynthConfig {
  /** Tone.js instrument class backing this preset. */
  type: SynthPresetType;
  name: string;
  /** Short note on the character, shown as the dropdown tooltip. */
  note: string;
  /** Constructor options passed to the Tone.js instrument. Deliberately open:
   *  every instrument class takes a different shape, and these are handed
   *  straight to Tone.js rather than inspected here. */
  params: Record<string, unknown>;
  /** Pitched instruments need a note; NoiseSynth, MetalSynth and CymbalSynth take duration only. */
  trigger: { note?: string; duration: string };
  /** Settings-panel starting values, tuned per preset. */
  defaults: Record<string, number>;
  /** Run the voice through the soft peak limiter after its loudness gain
   *  (drumLoudness.ts), live only. Set on the few voices whose crest left them
   *  short of the -16 LUFS target at the -1 dBTP ceiling, or more than 1 LU
   *  from the phone's version of the same voice (2026-10-29): metal_closed,
   *  metal_open, noise_snare, noise_clap, membrane_808. */
  peakLimit?: boolean;
}

export type DrumPresets = Record<string, SynthConfig>;
export type DrumPresetsMap = Record<DrumId, DrumPresets>;

export const DRUM_IDS: DrumId[] = ['kick', 'tom', 'cymbal', 'clap'];

/**
 * A sequencer lane (P2-17). `DrumId` above is a sound *category* — which
 * preset library and default layers a lane draws from — not a lane: a lane
 * is one row in the grid, with its own steps, its own layer stack, and (for
 * anything past the original four) its own id distinct from its category, so
 * a second kick-category lane doesn't collide with the first.
 */
export interface Lane {
  /** The original four use their category as their id ('kick', 'tom', ...)
   *  so every existing call site that already passes those strings keeps
   *  working unchanged. Added lanes get a generated id instead. */
  id: string;
  category: DrumId;
  /** Shown in the grid and the settings panel. */
  label: string;
  /** ISSUE-BEATBOX-011: silences this lane's bus regardless of solo state
   *  elsewhere, unless a solo lane makes muted state moot (isLaneAudible in
   *  sequencerStore.ts is the one place that resolves the two together). */
  muted: boolean;
  /** ISSUE-BEATBOX-011: when any lane is soloed, only soloed lanes play. */
  solo: boolean;
}

const CATEGORY_LABEL: Record<DrumId, string> = {
  kick: 'Kick',
  tom: 'Tom',
  cymbal: 'Cymbal',
  clap: 'Clap',
};

export const DEFAULT_LANES: Lane[] = DRUM_IDS.map((id) => ({
  id,
  category: id,
  label: CATEGORY_LABEL[id],
  muted: false,
  solo: false,
}));

/** The original four lanes' ids — never removable, unlike anything added
 *  past them (P2-17's "4 original, up to 4 added"). */
export const CORE_LANE_IDS = new Set<string>(DEFAULT_LANES.map((lane) => lane.id));

/** 4 original + up to 4 added, per the project's own scoping of P2-17. */
export const MAX_LANES = 8;

/** Display label for an added lane of this category: "Kick 2", "Kick 3", ... —
 *  `existingCount` is how many lanes of that category already exist. */
export function nextLaneLabel(category: DrumId, existingCount: number): string {
  return `${CATEGORY_LABEL[category]} ${existingCount + 1}`;
}

/** Short, parallel-wet delay used to add thickness (not echo) to a layer. */
export interface DelayConfig {
  enabled: boolean;
  /** 5-400ms. Short = perceived as thickness (comb-filtering); long = audible echo. */
  timeMs: number;
  /** 0-0.6 */
  feedback: number;
  /** 0-1, dry/wet ratio. */
  wet: number;
}

/** One synth instance stacked onto a voice. Several layers on the same drum
 *  role are triggered together so the sound has more body than a single
 *  synth alone can give it. */
export interface LayerConfig {
  /** Instance id, distinct from presetId so the same preset can be layered twice. */
  layerId: string;
  presetId: string;
  /** This layer's own level, -24..+6 dB, applied on top of the preset's own volume. */
  gainDb: number;
  /** -1..1 */
  pan: number;
  delay: DelayConfig;
}

export type VoiceLayers = Record<DrumId, LayerConfig[]>;

export const SYNTH_PRESETS: DrumPresetsMap = {
  // ---------------------------------------------------------------- KICK ---
  kick: {
    membrane_808: {
      type: 'membrane',
      name: 'Sub Kick',
      note: 'Long pitch sweep into deep sub — the classic analog drum-machine kick. Contains no recording or code from any hardware product.',
      peakLimit: true,
      params: {
        pitchDecay: 0.04,
        octaves: 10,
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.0008,
          decay: 0.4,
          sustain: 0,
          release: 1.2,
          attackCurve: 'exponential',
        },
        volume: 0,
      },
      trigger: { note: 'C1', duration: '8n' },
      defaults: {
        attack: 0.0008,
        decay: 0.4,
        release: 1.2,
        pitchDecay: 0.04,
        octaves: 10,
        volume: 0,
      },
    },
    membrane_909: {
      type: 'membrane',
      name: 'Punch Kick',
      note: 'Shorter sweep, tighter tail. Cuts through a busy mix. Contains no recording or code from any hardware product.',
      params: {
        pitchDecay: 0.025,
        octaves: 6,
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.0008,
          decay: 0.22,
          sustain: 0,
          release: 0.48,
          attackCurve: 'exponential',
        },
        volume: 0,
      },
      trigger: { note: 'C1', duration: '16n' },
      defaults: {
        attack: 0.0008,
        decay: 0.22,
        release: 0.48,
        pitchDecay: 0.025,
        octaves: 6,
        volume: 0,
      },
    },
    membrane_acoustic: {
      type: 'membrane',
      name: 'Acoustic Kick',
      note: 'Triangle body with a fast sweep. Reads as a real bass drum.',
      params: {
        pitchDecay: 0.012,
        octaves: 4,
        oscillator: { type: 'triangle' },
        envelope: {
          attack: 0.0008,
          decay: 0.18,
          sustain: 0,
          release: 0.28,
          attackCurve: 'exponential',
        },
        volume: 0,
      },
      trigger: { note: 'C2', duration: '16n' },
      defaults: {
        attack: 0.0008,
        decay: 0.18,
        release: 0.28,
        pitchDecay: 0.012,
        octaves: 4,
        volume: 0,
      },
    },
    synth_blip: {
      type: 'synth',
      name: 'Sine Blip Kick',
      note: 'Plain oscillator, no pitch sweep. Minimal and clicky.',
      params: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.0008, decay: 0.14, sustain: 0, release: 0.08 },
        volume: -2,
      },
      trigger: { note: 'C1', duration: '16n' },
      defaults: { attack: 0.0008, decay: 0.14, release: 0.08, volume: -2 },
    },
    mono_analog: {
      type: 'mono',
      name: 'Analog Kick',
      note: 'Filtered saw. Rounder and dirtier than the membrane kicks.',
      params: {
        oscillator: { type: 'sawtooth' },
        filter: { Q: 2, type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.0008, decay: 0.24, sustain: 0, release: 0.24 },
        filterEnvelope: {
          attack: 0.0008,
          decay: 0.05,
          sustain: 0,
          release: 0.16,
          baseFrequency: 40,
          octaves: 3.5,
        },
        volume: -2,
      },
      trigger: { note: 'C1', duration: '16n' },
      defaults: {
        attack: 0.0008,
        decay: 0.24,
        release: 0.24,
        volume: -2,
      },
    },
  },

  // ----------------------------------------------------------------- TOM ---
  tom: {
    membrane_mid: {
      type: 'membrane',
      name: 'Mid Tom',
      note: 'Standard rack tom. The default for fills.',
      params: {
        pitchDecay: 0.04,
        octaves: 3,
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.0008,
          decay: 0.22,
          sustain: 0,
          release: 0.32,
          attackCurve: 'exponential',
        },
        volume: -3,
      },
      trigger: { note: 'A2', duration: '8n' },
      defaults: {
        attack: 0.0008,
        decay: 0.22,
        release: 0.32,
        pitchDecay: 0.04,
        octaves: 3,
        volume: -3,
      },
    },
    membrane_high: {
      type: 'membrane',
      name: 'High Tom',
      note: 'Tighter and brighter. Sits above the snare.',
      params: {
        pitchDecay: 0.028,
        octaves: 2.5,
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.0008,
          decay: 0.14,
          sustain: 0,
          release: 0.2,
          attackCurve: 'exponential',
        },
        volume: -2,
      },
      trigger: { note: 'E3', duration: '16n' },
      defaults: {
        attack: 0.0008,
        decay: 0.14,
        release: 0.2,
        pitchDecay: 0.028,
        octaves: 2.5,
        volume: -2,
      },
    },
    membrane_floor: {
      type: 'membrane',
      name: 'Floor Tom',
      note: 'Long, low and boomy. Fills the bottom without hitting the kick.',
      params: {
        pitchDecay: 0.056,
        octaves: 3.5,
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.0016,
          decay: 0.36,
          sustain: 0,
          release: 0.48,
          attackCurve: 'exponential',
        },
        volume: -2,
      },
      trigger: { note: 'D2', duration: '8n' },
      defaults: {
        attack: 0.0016,
        decay: 0.36,
        release: 0.48,
        pitchDecay: 0.056,
        octaves: 3.5,
        volume: -2,
      },
    },
    fm_electronic: {
      type: 'fm',
      name: 'Electronic Tom',
      note: 'FM sidebands give a metallic, synthetic edge.',
      params: {
        harmonicity: 2.5,
        modulationIndex: 14,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.0016, decay: 0.18, sustain: 0, release: 0.2 },
        modulationEnvelope: {
          attack: 0.0016,
          decay: 0.1,
          sustain: 0,
          release: 0.08,
        },
        volume: -6,
      },
      trigger: { note: 'A2', duration: '8n' },
      defaults: {
        attack: 0.0016,
        decay: 0.18,
        release: 0.2,
        harmonicity: 2.5,
        modulationIndex: 14,
        volume: -6,
      },
    },
    duo_wide: {
      type: 'duo',
      name: 'Wide Tom',
      note: 'Two detuned voices with vibrato. Thick and stereo-wide.',
      params: {
        harmonicity: 1.5,
        vibratoAmount: 0.3,
        vibratoRate: 6,
        voice0: {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.0016, decay: 0.19, sustain: 0, release: 0.24 },
        },
        voice1: {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.0024, decay: 0.21, sustain: 0, release: 0.24 },
        },
        volume: -8,
      },
      trigger: { note: 'A2', duration: '8n' },
      defaults: { harmonicity: 1.5, volume: -8 },
    },
    am_soft: {
      type: 'am',
      name: 'Soft Tom',
      note: 'Amplitude modulation. Hollow and mellow, good under vocals.',
      params: {
        harmonicity: 2,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.0024, decay: 0.2, sustain: 0, release: 0.24 },
        modulationEnvelope: {
          attack: 0.008,
          decay: 0.12,
          sustain: 0,
          release: 0.16,
        },
        volume: -5,
      },
      trigger: { note: 'G2', duration: '8n' },
      defaults: {
        attack: 0.0024,
        decay: 0.2,
        release: 0.24,
        harmonicity: 2,
        volume: -5,
      },
    },
  },

  // -------------------------------------------------------------- CYMBAL ---
  cymbal: {
    metal_closed: {
      type: 'cymbal',
      name: 'Closed Hi-Hat',
      note: 'Short metallic tick with a little body. The workhorse 16th-note hat.',
      peakLimit: true,
      params: {
        frequency: 480,
        envelope: { attack: 0.0008, decay: 0.07, release: 0.008 },
        resonance: 4500,
        washCeilingHz: 13000,
        ringDb: 2,
        clickDb: -8,
        ringDecay: 0.8,
        ringHighDecay: 0.6,
        volume: -6,
      },
      trigger: { duration: '32n' },
      defaults: {
        frequency: 480,
        attack: 0.0008,
        decay: 0.07,
        release: 0.008,
        resonance: 4500,
        volume: -6,
      },
    },
    noise_closed: {
      type: 'noise',
      name: 'Noise Hat',
      note: 'White-noise burst. Smoother and less ringy than the metal hat.',
      params: {
        noise: { type: 'white' },
        envelope: { attack: 0.0008, decay: 0.04, sustain: 0, release: 0.008 },
        volume: -12,
      },
      trigger: { duration: '32n' },
      defaults: {
        attack: 0.0008,
        decay: 0.04,
        release: 0.008,
        volume: -12,
      },
    },
    metal_open: {
      type: 'cymbal',
      name: 'Open Hi-Hat',
      note: 'Long sizzle with a ringing body that carries into the next beat.',
      peakLimit: true,
      params: {
        frequency: 480,
        envelope: { attack: 0.0008, decay: 0.6, release: 0.16 },
        resonance: 4500,
        washCeilingHz: 13000,
        ringDb: 2,
        clickDb: -10,
        ringDecay: 1,
        ringHighDecay: 0.6,
        volume: -8,
      },
      trigger: { duration: '8n' },
      defaults: {
        frequency: 480,
        attack: 0.0008,
        decay: 0.6,
        release: 0.16,
        resonance: 4500,
        volume: -8,
      },
    },
    metal_ride: {
      type: 'cymbal',
      name: 'Ride Cymbal',
      note: 'Lower fundamental, dense partials, a clear ping over a sustained wash.',
      params: {
        frequency: 380,
        envelope: { attack: 0.0008, decay: 1.6, release: 0.32 },
        resonance: 3200,
        washCeilingHz: 12000,
        ringDb: 6,
        clickDb: -10,
        ringDecay: 1,
        ringHighDecay: 0.5,
        washDecay: 0.8,
        volume: -12,
      },
      trigger: { duration: '4n' },
      defaults: {
        frequency: 380,
        attack: 0.0008,
        decay: 1.6,
        release: 0.32,
        resonance: 3200,
        volume: -12,
      },
    },
    metal_crash: {
      type: 'cymbal',
      name: 'Crash Cymbal',
      note: 'Full explosive accent for bar starts: soft attack, a wash that swells and a long tail.',
      params: {
        frequency: 260,
        envelope: { attack: 0.004, decay: 2.0, release: 0.64 },
        resonance: 2600,
        washCeilingHz: 13000,
        washAttack: 0.012,
        ringDb: 1,
        clickDb: -14,
        ringDecay: 1,
        ringHighDecay: 0.5,
        washDecay: 1,
        volume: -10,
      },
      trigger: { duration: '2n' },
      defaults: {
        frequency: 260,
        attack: 0.004,
        decay: 2.0,
        release: 0.64,
        resonance: 2600,
        volume: -10,
      },
    },
  },

  // ---------------------------------------------------------------- CLAP ---
  clap: {
    noise_clap: {
      type: 'noise',
      name: 'Handclap',
      note: 'Pink-noise burst with a fast decay. The standard analog drum-machine clap.',
      peakLimit: true,
      params: {
        noise: { type: 'pink', playbackRate: 3 },
        envelope: {
          attack: 0.0008,
          decay: 0.13,
          sustain: 0,
          release: 0.05,
        },
        volume: -6,
      },
      trigger: { duration: '16n' },
      defaults: {
        attack: 0.0008,
        decay: 0.13,
        release: 0.05,
        volume: -6,
      },
    },
    noise_snare: {
      type: 'noise',
      name: 'Snare',
      note: 'White noise, snappier and brighter than the clap.',
      peakLimit: true,
      params: {
        noise: { type: 'white' },
        envelope: {
          attack: 0.0008,
          decay: 0.1,
          sustain: 0,
          release: 0.025,
        },
        volume: -7,
      },
      trigger: { duration: '16n' },
      defaults: {
        attack: 0.0008,
        decay: 0.1,
        release: 0.025,
        volume: -7,
      },
    },
    noise_brush: {
      type: 'noise',
      name: 'Brush Snare',
      note: 'Brown noise, soft and dark. Jazz and downtempo.',
      params: {
        noise: { type: 'brown' },
        envelope: {
          attack: 0.003,
          decay: 0.18,
          sustain: 0,
          release: 0.1,
        },
        volume: -5,
      },
      trigger: { duration: '8n' },
      defaults: {
        attack: 0.003,
        decay: 0.18,
        release: 0.1,
        volume: -5,
      },
    },
    metal_rim: {
      type: 'metal',
      name: 'Rimshot',
      note: 'Short metallic crack. Cuts without adding weight.',
      params: {
        frequency: 900,
        envelope: { attack: 0.0008, decay: 0.032, release: 0.008 },
        harmonicity: 13,
        modulationIndex: 24,
        resonance: 1400,
        octaves: 0.9,
        volume: -16,
      },
      trigger: { duration: '32n' },
      defaults: {
        frequency: 900,
        attack: 0.0008,
        decay: 0.032,
        release: 0.008,
        harmonicity: 13,
        resonance: 1400,
        volume: -16,
      },
    },
    pluck_block: {
      type: 'pluck',
      name: 'Wood Block',
      note: 'Karplus-Strong pluck. Dry percussive click.',
      params: {
        attackNoise: 2.4,
        dampening: 3500,
        resonance: 0.65,
        volume: -4,
      },
      trigger: { note: 'C5', duration: '32n' },
      defaults: {
        dampening: 3500,
        resonance: 0.65,
        volume: -4,
      },
    },
  },
};

// timeMs: 5 rather than 0 (ISSUE-BEATBOX-015 finding 13) — clampLayerPatch's
// documented range for delay.timeMs is 5..400 (AudioEngine.ts), and a "no
// delay" default of 0 fell outside it: loadAllLayers/updateLayer round-tripping
// this default would clamp it up to 5 anyway, so 5 here just states the value
// those paths actually settle on. `enabled: false` still keeps it silent.
const NO_DELAY: DelayConfig = { enabled: false, timeMs: 5, feedback: 0, wet: 0 };

/** Two-layer default per voice (primary/"芯" + secondary/"補助"), so every
 *  drum has some thickness out of the box without inventing a new synthesis
 *  algorithm — it's just two existing presets stacked. Values are design-time
 *  estimates (ISSUE-LAYER-001 §4); not yet confirmed by ear. A third layer is
 *  available but left for the player to add. */
export const DEFAULT_LAYERS: Record<DrumId, LayerConfig[]> = {
  kick: [
    {
      layerId: 'kick-1',
      presetId: 'membrane_808',
      gainDb: 0,
      pan: 0,
      delay: { enabled: true, timeMs: 12, feedback: 0.1, wet: 0.15 },
    },
    {
      layerId: 'kick-2',
      presetId: 'synth_blip',
      gainDb: -8,
      pan: 0,
      delay: { ...NO_DELAY },
    },
  ],
  tom: [
    {
      layerId: 'tom-1',
      presetId: 'membrane_mid',
      gainDb: 0,
      pan: 0,
      delay: { ...NO_DELAY },
    },
    {
      layerId: 'tom-2',
      presetId: 'duo_wide',
      gainDb: -10,
      pan: 0.1,
      delay: { enabled: true, timeMs: 18, feedback: 0.15, wet: 0.2 },
    },
  ],
  cymbal: [
    {
      layerId: 'cymbal-1',
      presetId: 'metal_closed',
      gainDb: 0,
      pan: 0,
      delay: { ...NO_DELAY },
    },
    {
      layerId: 'cymbal-2',
      presetId: 'noise_closed',
      gainDb: -9,
      pan: 0,
      delay: { enabled: true, timeMs: 8, feedback: 0.05, wet: 0.2 },
    },
  ],
  clap: [
    {
      layerId: 'clap-1',
      presetId: 'noise_clap',
      gainDb: 0,
      pan: 0,
      delay: { ...NO_DELAY },
    },
    {
      layerId: 'clap-2',
      presetId: 'noise_clap',
      gainDb: -6,
      pan: 0.2,
      delay: { enabled: true, timeMs: 20, feedback: 0.1, wet: 0.35 },
    },
  ],
};

/** A fresh copy of a category's default layers for a new lane, with layerIds
 *  namespaced to `laneId` so two lanes of the same category (e.g. a second
 *  kick lane) never share a layer id with each other or with the original. */
export function cloneDefaultLayersFor(laneId: string, category: DrumId): LayerConfig[] {
  return DEFAULT_LAYERS[category].map((layer, index) => ({
    ...layer,
    layerId: `${laneId}-${index + 1}`,
    delay: { ...layer.delay },
  }));
}

/** Which sliders the settings panel shows, per Tone.js instrument type. */
export const PARAMETER_SPECS: Record<
  string,
  { key: string; label: string; min: number; max: number; step: number }
> = {
  attack: { key: 'attack', label: 'Attack', min: 0.0005, max: 0.05, step: 0.0005 },
  decay: { key: 'decay', label: 'Decay', min: 0.01, max: 2, step: 0.01 },
  release: { key: 'release', label: 'Release', min: 0.005, max: 2, step: 0.005 },
  pitchDecay: {
    key: 'pitchDecay',
    label: 'Pitch Decay',
    min: 0.005,
    max: 0.2,
    step: 0.005,
  },
  octaves: { key: 'octaves', label: 'Pitch Sweep (oct)', min: 0.5, max: 12, step: 0.5 },
  frequency: { key: 'frequency', label: 'Frequency (Hz)', min: 80, max: 1200, step: 10 },
  // ISSUE-BEATBOX-014 (audit finding 8): 16 let a MetalSynth's FM sidebands
  // fold into audible noise well before the slider's own max. Every current
  // preset's default is <=9 (metal_crash), so this doesn't move a shipped
  // sound, only the ceiling a slider can reach.
  harmonicity: { key: 'harmonicity', label: 'Harmonicity', min: 0.5, max: 10, step: 0.1 },
  modulationIndex: {
    key: 'modulationIndex',
    label: 'Modulation Index',
    min: 1,
    max: 50,
    step: 1,
  },
  // ISSUE-BEATBOX-014 (audit finding 2): "resonance" means two different
  // things depending on the synth behind the preset, and sharing one spec
  // sent a Wood Block's PluckSynth.resonance (a 0..1 comb-filter feedback
  // amount) a value in the hundreds/thousands - Tone.js throws a RangeError
  // the moment the slider moves. resonanceHz backs MetalSynth's bandpass
  // tuning (cymbals/hats/rimshot); resonanceNormal backs PluckSynth's
  // Karplus-Strong feedback (Wood Block only). getPresetParameters() below
  // picks the right one per preset type; `key` on both stays 'resonance'
  // (the actual params/defaults field the slider reads and writes).
  resonanceHz: { key: 'resonance', label: 'Resonance (Hz)', min: 200, max: 7000, step: 100 },
  resonanceNormal: { key: 'resonance', label: 'Resonance', min: 0, max: 1, step: 0.01 },
  dampening: { key: 'dampening', label: 'Dampening (Hz)', min: 500, max: 8000, step: 100 },
  volume: { key: 'volume', label: 'Volume (dB)', min: -40, max: 0, step: 1 },
};

/** Which PARAMETER_SPECS entry a preset's own `resonance` default should use
 *  — the two synth families share the field name but not its range or unit
 *  (see the resonanceHz/resonanceNormal jsdoc above). */
function resonanceSpecFor(type: SynthPresetType) {
  return type === 'pluck' ? PARAMETER_SPECS.resonanceNormal : PARAMETER_SPECS.resonanceHz;
}

export function getPreset(drum: DrumId, presetId: string): SynthConfig | undefined {
  return SYNTH_PRESETS[drum]?.[presetId];
}

export function getPresetIds(drum: DrumId): string[] {
  return Object.keys(SYNTH_PRESETS[drum] || {});
}

export function getPresetDisplayName(drum: DrumId, presetId: string): string {
  return getPreset(drum, presetId)?.name ?? presetId;
}

/** Slider list for a preset, derived from the keys its defaults declare. */
export function getPresetParameters(drum: DrumId, presetId: string) {
  const preset = getPreset(drum, presetId);
  if (!preset) return [];
  return Object.keys(preset.defaults)
    .map((key) => (key === 'resonance' ? resonanceSpecFor(preset.type) : PARAMETER_SPECS[key]))
    .filter(Boolean);
}

export function getPresetDefaults(
  drum: DrumId,
  presetId: string
): Record<string, number> {
  return { ...(getPreset(drum, presetId)?.defaults ?? {}) };
}
