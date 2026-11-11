// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// "Sound recipe" export: once you have taken the pattern into your DAW, what do
// you set on your own plugin to get back the sound you tuned in here?
//
// Tone.js instrument classes map onto synthesis techniques that every DAW-native
// synth also offers (subtractive, FM, noise, physical modelling), so this names
// the technique and lists the numbers rather than dumping Tone.js internals --
// someone who has never heard of Tone.js should still be able to read it.

import { AudioEngine } from './AudioEngine';
import { exportRightsFields, type ExportRightsFields } from '../export/rights';
import { getPreset, type Lane, type SynthPresetType } from './synthPresets';

const SYNTH_TYPE_EXPLAINED: Record<SynthPresetType, string> = {
  membrane: 'Pitch-swept oscillator (subtractive, analog-style drum synthesis)',
  noise: 'Filtered noise burst (subtractive, no pitched oscillator)',
  metal: 'Six detuned square waves through a bandpass filter (metallic/cymbal synthesis)',
  cymbal: 'Inharmonic sine partials plus high-passed noise, each with its own decay (additive cymbal synthesis)',
  fm: 'Frequency modulation (FM synthesis)',
  am: 'Amplitude modulation (AM synthesis)',
  mono: 'Oscillator + filter + envelope (classic subtractive synthesis)',
  duo: 'Two oscillators with cross-modulation (subtractive, layered)',
  synth: 'Single oscillator + envelope (basic subtractive synthesis)',
  pluck: 'Karplus-Strong string model (physical modelling)',
};

/** One stacked synth's recipe: what it is, and how this layer sits in the mix
 *  (gain/pan/delay) relative to its siblings on the same voice. */
export interface LayerRecipe {
  layerId: string;
  presetName: string;
  synthesisTechnique: string;
  /** What note and duration this layer triggers on each hit. */
  trigger: { note?: string; duration: string };
  /** The preset's constructor options, as passed to Tone.js. */
  presetParameters: Record<string, unknown>;
  /** This layer's effective slider values (preset defaults if untouched, your
   *  overrides if you changed any -- not only the changed ones). */
  yourAdjustments: Record<string, number>;
  /** This layer's own level, dB, applied on top of the preset's own volume. */
  gainDb: number;
  /** -1 (left) .. 1 (right). */
  pan: number;
  /** Short, parallel-wet delay used to add thickness (not echo) to this layer. */
  delay: {
    enabled: boolean;
    timeMs: number;
    feedback: number;
    wet: number;
  };
}

export interface DrumRecipe {
  /** The lane's id — 'kick'/'tom'/'cymbal'/'clap' for the original four,
   *  something like 'kick-2' for a lane added past them (P2-17). */
  drum: string;
  /** What the grid shows for this lane ("Kick", "Kick 2", ...). */
  label: string;
  /** How many synths are stacked and triggered together for this voice. */
  layerCount: number;
  layers: LayerRecipe[];
}

export interface SoundRecipe {
  /** Was 'open-rhythm-box-sound-recipe' before the 2026-10-01 rename and
   *  'koinonbayashi-sound-recipe' before the 2026-10-06 rename. */
  format: 'beatbayashi-sound-recipe';
  /** Bumped from 1: drums.* changed shape from one preset per drum to
   *  drums[].layers[], an incompatible format under the same field name. */
  version: 3;
  generatedAt: string;
  /** Version 3 replaced the single `licence` string with these three fields:
   *  the app's code licence and the content's rights are different things. */
  generator: ExportRightsFields['generator'];
  generatorLicence: ExportRightsFields['generatorLicence'];
  contentRights: ExportRightsFields['contentRights'];
  howToUse: string;
  drums: DrumRecipe[];
}

/** Describes the sound currently loaded in each lane, for both people and tools. */
export function buildSoundRecipe(
  audioEngine: AudioEngine,
  lanes: Lane[],
  timestamp: string
): SoundRecipe {
  const drums: DrumRecipe[] = lanes.map((lane) => {
    const layerConfigs = audioEngine.getLayers(lane.id);

    const layers: LayerRecipe[] = layerConfigs.map((layerConfig) => {
      const preset = getPreset(lane.category, layerConfig.presetId);

      return {
        layerId: layerConfig.layerId,
        presetName: preset?.name ?? layerConfig.presetId,
        synthesisTechnique: preset
          ? SYNTH_TYPE_EXPLAINED[preset.type] ?? preset.type
          : 'unknown',
        trigger: preset?.trigger ?? { duration: '8n' },
        presetParameters: preset?.params ?? {},
        yourAdjustments: audioEngine.getLayerSettings(lane.id, layerConfig.layerId),
        gainDb: layerConfig.gainDb,
        pan: layerConfig.pan,
        delay: { ...layerConfig.delay },
      };
    });

    return {
      drum: lane.id,
      label: lane.label,
      layerCount: layers.length,
      layers,
    };
  });

  return {
    format: 'beatbayashi-sound-recipe',
    version: 3,
    generatedAt: timestamp,
    ...exportRightsFields(),
    howToUse:
      'These are the synthesis settings behind each drum in this pattern. Each drum ' +
      'voice can stack more than one synth ("layers") that all trigger together on ' +
      'every hit -- layerCount says how many. Each layer describes a technique (for ' +
      'example "subtractive" or "FM"), not a specific plugin: set the matching ' +
      'parameters on any synth that offers that technique to get close to this sound, ' +
      'then mix the layers using their own gain (dB), pan (-1..1), and delay (short ' +
      'delay times/low feedback add thickness rather than an audible echo -- when ' +
      '"enabled" is false, this layer has no delay at all; ignore its timeMs/feedback/wet ' +
      'numbers). Units are seconds for attack/decay/release, Hz for frequencies, and dB ' +
      'for volume.',
    drums,
  };
}
