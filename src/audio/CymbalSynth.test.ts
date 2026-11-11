// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// The cymbal family after the 2026-10-27 retune (owner: "the cymbal is too
// light"). Node cannot render audio (no OfflineAudioContext, see
// AudioEngine.real.test.ts), so this file checks the recipe -- what the preset
// asks the voice for -- against the floors in cymbalTargets.ts: a long enough
// decay, ring partials in the low-mid range, a wash high-pass low enough to
// leave body, a soft crash attack. The rendered numbers for the same floors
// are checked in a browser (tools/sound-lab, and the render test in
// AudioEngine.real.test.ts).
import { describe, expect, it } from 'vitest';
import { CYMBAL_DEFAULTS, cymbalRecipe, secondsToFall } from './CymbalSynth';
import { CYMBAL_TARGETS } from './cymbalTargets';
import { SYNTH_PRESETS, getPreset } from './synthPresets';

const IDS = Object.keys(CYMBAL_TARGETS);

function recipeOf(id: string) {
  const preset = getPreset('cymbal', id)!;
  return cymbalRecipe(preset.params);
}

describe('cymbal family presets', () => {
  it.each(IDS)('%s is a CymbalSynth voice and its slider defaults match the recipe', (id) => {
    const preset = getPreset('cymbal', id)!;
    expect(preset.type).toBe('cymbal');
    const recipe = recipeOf(id);
    const d = preset.defaults;
    expect(d.frequency).toBe(recipe.frequency);
    expect(d.resonance).toBe(recipe.resonance);
    expect(d.decay).toBe(recipe.envelope.decay);
    expect(d.volume).toBe(recipe.volume);
  });

  it.each(IDS)('%s: the longest part lasts at least as long as the floor in cymbalTargets.ts (decay is the time to -60 dB)', (id) => {
    const t = CYMBAL_TARGETS[id];
    const recipe = recipeOf(id);
    const decay = recipe.envelope.decay;
    // The measured -20 / -40 dB time is that of the longest part: the wash for
    // every preset but the ride, whose low ring is as long.
    const longest = Math.max(decay * recipe.washDecay, decay * recipe.ringDecay);
    expect(secondsToFall(longest, 20)).toBeGreaterThanOrEqual(t.minDecay20);
    expect(secondsToFall(longest, 40)).toBeGreaterThanOrEqual(t.minDecay40);
  });

  it.each(IDS)('%s keeps body: at least three ring partials between 200 Hz and 2 kHz', (id) => {
    const recipe = recipeOf(id);
    const lowMid = recipe.partials.map((r) => r * recipe.frequency).filter((hz) => hz >= 200 && hz <= 2000);
    expect(lowMid.length).toBeGreaterThanOrEqual(3);
  });

  it.each(IDS)('%s: the wash high-pass sits at or under 4.5 kHz, not the 5-9 kHz the old MetalSynth presets used', (id) => {
    expect(recipeOf(id).resonance).toBeLessThanOrEqual(4500);
  });

  it('orders the family by length: closed < open < ride < crash', () => {
    const decay = (id: string) => recipeOf(id).envelope.decay;
    expect(decay('metal_closed')).toBeLessThan(decay('metal_open'));
    expect(decay('metal_open')).toBeLessThan(decay('metal_ride'));
    expect(decay('metal_ride')).toBeLessThan(decay('metal_crash'));
  });

  it('gives the crash a softer attack and a rising wash than the hats', () => {
    const crash = recipeOf('metal_crash');
    expect(crash.envelope.attack).toBeGreaterThan(recipeOf('metal_closed').envelope.attack);
    expect(crash.washAttack).toBeGreaterThanOrEqual(0.01);
  });

  it('crash decay stays inside the Decay slider range', () => {
    // A preset default outside its slider range was the old crash's resonance
    // (9000 against a 7000 maximum); not repeated.
    expect(recipeOf('metal_crash').envelope.decay).toBeLessThanOrEqual(2);
  });

  it('the rimshot is still a MetalSynth, untouched', () => {
    expect(SYNTH_PRESETS.clap.metal_rim.type).toBe('metal');
  });
});

describe('cymbalRecipe', () => {
  it('falls back to the defaults for missing, non-finite or non-numeric values', () => {
    const recipe = cymbalRecipe({ frequency: NaN, resonance: 'x', envelope: { decay: Infinity }, volume: undefined, partials: 'no' });
    expect(recipe.frequency).toBe(CYMBAL_DEFAULTS.frequency);
    expect(recipe.resonance).toBe(CYMBAL_DEFAULTS.resonance);
    expect(recipe.envelope.decay).toBe(CYMBAL_DEFAULTS.envelope.decay);
    expect(recipe.volume).toBe(CYMBAL_DEFAULTS.volume);
    expect(recipe.partials).toEqual(CYMBAL_DEFAULTS.partials);
  });

  it('clamps out-of-range values instead of passing them to a Web Audio node', () => {
    const recipe = cymbalRecipe({ frequency: 1e9, resonance: -5, envelope: { attack: 99, decay: 1e6 } });
    expect(recipe.frequency).toBe(4000);
    expect(recipe.resonance).toBe(100);
    expect(recipe.envelope.attack).toBe(0.5);
    expect(recipe.envelope.decay).toBe(6);
  });

  it('ignores the MetalSynth keys an older saved setting may still carry', () => {
    const params = getPreset('cymbal', 'metal_crash')!.params;
    const base = cymbalRecipe(params);
    const withOld = cymbalRecipe({ ...params, harmonicity: 9, modulationIndex: 56, octaves: 2.1 });
    expect(withOld).toEqual(base);
  });

  it('an old saved resonance (Hz) still means a wash high-pass corner, just clamped', () => {
    expect(cymbalRecipe({ resonance: 9000 }).resonance).toBe(9000);
    expect(cymbalRecipe({ resonance: 20000 }).resonance).toBe(12000);
  });
});
