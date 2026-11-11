// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// The 72 built-in patterns are hand-typed data. These checks catch the two
// ways that data goes quietly wrong: a lane that is the wrong length or holds
// something other than 0/1, and a description that promises a feel (swing,
// ghost notes) the straight-grid engine cannot actually play.

import { describe, expect, it } from 'vitest';
import {
  CHARACTER_DESCRIPTIONS,
  CHARACTER_ORDER,
  GENRE_ORDER,
  PRESETS,
  PRESET_RESOLUTION,
  findPreset,
} from './presets';
import {
  SOUND_BASIS_INFO,
  SOUND_BASIS_ORDER,
  SOUND_SPACES,
  SOUND_BASES,
} from './audio/soundBasis';

const LANE_COUNT = 4;

// Words that describe a feel the engine cannot produce (swing, velocity,
// dynamics, human timing) or a real recording. `\bamen\b` (not a bare
// "amen") so it doesn't false-positive on "fundamental".
const FEEL_OR_RECORDING =
  /\bamen\b|swing|swung|shuffl|ghost|dragg|laid[- ]?back|off the grid|triplet|behind the beat|human feel|velocit|accent|reverb|distortion/i;

describe('PRESETS', () => {
  it('holds 72 patterns: 12 genres x 6 characters', () => {
    expect(GENRE_ORDER).toHaveLength(12);
    expect(CHARACTER_ORDER).toHaveLength(6);
    expect(PRESETS).toHaveLength(72);
  });

  it('gives every pattern four lanes of sixteen 0/1 steps', () => {
    for (const preset of PRESETS) {
      expect(preset.grid, preset.id).toHaveLength(LANE_COUNT);
      for (const lane of preset.grid) {
        expect(lane, preset.id).toHaveLength(PRESET_RESOLUTION);
        expect(lane.every((step) => step === 0 || step === 1), preset.id).toBe(true);
      }
    }
  });

  it('gives every pattern a unique id', () => {
    const ids = PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every tempo an integer between 60 and 260 BPM', () => {
    for (const preset of PRESETS) {
      expect(Number.isInteger(preset.bpm), preset.id).toBe(true);
      expect(preset.bpm, preset.id).toBeGreaterThanOrEqual(60);
      expect(preset.bpm, preset.id).toBeLessThanOrEqual(260);
    }
  });

  it('names and describes patterns by what is on the grid, not by feel', () => {
    for (const preset of PRESETS) {
      expect(preset.name, preset.id).not.toMatch(FEEL_OR_RECORDING);
      expect(preset.description, preset.id).not.toMatch(FEEL_OR_RECORDING);
    }
  });

  it('describes characters by what is on the grid, not by feel', () => {
    for (const [character, text] of Object.entries(CHARACTER_DESCRIPTIONS)) {
      expect(text, character).not.toMatch(FEEL_OR_RECORDING);
    }
  });
});

// Machine and brand names the app must not use in anything it shows or
// ships as a name/description (README: no trademarks, no recordings).
const TRADEMARK_OR_RECORDING =
  /\bamen\b|\b(?:TR|CR|TB)-?\d|\b(?:808|909|707|606|303|727)s?\b|roland|korg|linn|akai|\bmpc\b|e-?mu|sp-?1200|yamaha|\bmoog\b/i;

describe('sound basis names and descriptions', () => {
  it('describe each basis without a feel word, a trademark or a recording', () => {
    for (const [basis, info] of Object.entries(SOUND_BASIS_INFO)) {
      for (const text of [info.label, info.en, info.ja]) {
        expect(text, basis).not.toMatch(FEEL_OR_RECORDING);
        expect(text, basis).not.toMatch(TRADEMARK_OR_RECORDING);
      }
    }
  });

  it('give every basis entry and space a reason free of trademarks and recordings', () => {
    // Reasons may say "reverb" or "distortion": with the sound basis the
    // engine really does apply them. Machine names and recordings stay out.
    for (const basis of SOUND_BASIS_ORDER) {
      for (const genre of GENRE_ORDER) {
        expect(SOUND_SPACES[basis][genre].reason, `${basis}/${genre}`).not.toMatch(
          TRADEMARK_OR_RECORDING
        );
        for (const entry of Object.values(SOUND_BASES[basis][genre])) {
          expect(entry.reason, `${basis}/${genre}`).not.toMatch(TRADEMARK_OR_RECORDING);
        }
      }
    }
  });

  it('pattern names and descriptions carry no trademark either', () => {
    for (const preset of PRESETS) {
      expect(preset.name, preset.id).not.toMatch(TRADEMARK_OR_RECORDING);
      expect(preset.description, preset.id).not.toMatch(TRADEMARK_OR_RECORDING);
    }
  });
});

describe('cross-referenced descriptions stay true', () => {
  it('dnb-break really does share kick and clap with the pattern it says it does', () => {
    // presets.ts:483 reads "Same kick and snares as Breakbeat Classic" (dnb-groove).
    // Nothing enforces that at the data level, so a future edit to either
    // pattern could make the claim quietly false. Pin it here instead.
    const groove = PRESETS.find((preset) => preset.id === 'dnb-groove');
    const brk = PRESETS.find((preset) => preset.id === 'dnb-break');
    expect(groove).toBeDefined();
    expect(brk).toBeDefined();
    const [grooveKick, , , grooveClap] = groove!.grid;
    const [breakKick, , , breakClap] = brk!.grid;
    expect(breakKick).toEqual(grooveKick);
    expect(breakClap).toEqual(grooveClap);
  });
});

describe('findPreset', () => {
  it('finds exactly one pattern for every genre x character pair', () => {
    for (const genre of GENRE_ORDER) {
      for (const character of CHARACTER_ORDER) {
        const label = `${genre} / ${character}`;
        expect(findPreset(genre, character), label).toBeDefined();
        const matches = PRESETS.filter(
          (preset) => preset.genre === genre && preset.character === character
        );
        expect(matches, label).toHaveLength(1);
      }
    }
  });
});
