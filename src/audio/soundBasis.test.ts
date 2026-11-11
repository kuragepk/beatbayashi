// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// @vitest-environment jsdom
//
// The sound-basis table is hand-written data, 4 bases x 12 genres x 4
// categories. These checks catch the ways it goes quietly wrong: a missing
// cell, a preset id that does not exist, a slider value Tone.js would reject
// or the settings panel would silently drop, a second layer loud enough to
// eat the headroom, and a theory row that leans on a search summary.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SOUND_BASIS,
  SOUND_BASIS_INFO,
  SOUND_BASIS_ORDER,
  SOUND_BASIS_STORAGE_KEY,
  SOUND_SPACES,
  basisDescription,
  SOUND_BASES,
  loadSoundBasisState,
  saveSoundBasisState,
  type BasisEntry,
  type VoiceSpec,
} from './soundBasis';
import { DRUM_IDS, PARAMETER_SPECS, getPreset, type DrumId } from './synthPresets';
import { GENRE_ORDER } from '../presets';
import { MAX_SEND } from './AudioEngine';
import { RIGHTS_NOTICE } from '../rights/rightsNotice.generated';

/** Tone.js ranges (docs/source, see design doc T1) that are tighter than,
 *  or not covered by, the settings panel's slider specs. */
const TONE_RANGES: Record<string, [number, number]> = {
  pitchDecay: [0, 0.5],
  octaves: [0.5, 8],
  harmonicity: [0.1, 10],
  modulationIndex: [1, 100],
  resonance: [0, 7000],
};

function everyEntry(fn: (label: string, entry: BasisEntry, category: DrumId) => void) {
  for (const basis of SOUND_BASIS_ORDER) {
    for (const genre of GENRE_ORDER) {
      for (const category of DRUM_IDS) {
        fn(`${basis}/${genre}/${category}`, SOUND_BASES[basis][genre][category], category);
      }
    }
  }
}

function checkVoice(label: string, category: DrumId, voice: VoiceSpec) {
  const preset = getPreset(category, voice.presetId);
  expect(preset, `${label}: preset ${voice.presetId}`).toBeDefined();
  for (const [key, value] of Object.entries(voice.overrides)) {
    // Only keys the preset exposes as sliders, so the settings panel shows
    // them and a saved copy survives sanitizeSavedLayerSettings.
    expect(Object.keys(preset!.defaults), `${label}: ${key}`).toContain(key);
    expect(Number.isFinite(value), `${label}: ${key}`).toBe(true);
    const spec =
      key === 'resonance'
        ? preset!.type === 'pluck'
          ? PARAMETER_SPECS.resonanceNormal
          : PARAMETER_SPECS.resonanceHz
        : PARAMETER_SPECS[key];
    expect(spec, `${label}: spec for ${key}`).toBeDefined();
    expect(value, `${label}: ${key} >= slider min`).toBeGreaterThanOrEqual(spec.min);
    expect(value, `${label}: ${key} <= slider max`).toBeLessThanOrEqual(spec.max);
    const tone = TONE_RANGES[key];
    if (tone && !(key === 'resonance' && preset!.type === 'pluck')) {
      expect(value, `${label}: ${key} >= Tone min`).toBeGreaterThanOrEqual(tone[0]);
      expect(value, `${label}: ${key} <= Tone max`).toBeLessThanOrEqual(tone[1]);
    }
  }
}

describe('SOUND_BASES completeness', () => {
  it('orders the four bases theory, systematic, empirical, modern, with theory the default', () => {
    expect(SOUND_BASIS_ORDER).toEqual(['theory', 'systematic', 'empirical', 'modern']);
    expect(DEFAULT_SOUND_BASIS).toBe('theory');
  });

  it('has 4 x 12 x 4 = 192 entries, each with main, layer, fx, reason and a source status', () => {
    let count = 0;
    everyEntry((label, entry) => {
      count++;
      expect(entry, label).toBeDefined();
      expect(entry.main, label).toBeDefined();
      expect(entry.layer, label).toBeDefined();
      expect(entry.fx, label).toBeDefined();
      expect(entry.reason.length, label).toBeGreaterThan(10);
      expect(['CONFIRMED', 'SEARCH-ONLY', 'INFERENCE'], label).toContain(entry.source.status);
      expect(Array.isArray(entry.source.refs), label).toBe(true);
    });
    expect(count).toBe(192);
  });

  it('gives every basis and genre a shared space', () => {
    for (const basis of SOUND_BASIS_ORDER) {
      for (const genre of GENRE_ORDER) {
        const space = SOUND_SPACES[basis][genre];
        const label = `${basis}/${genre}`;
        expect(space, label).toBeDefined();
        expect(['16n', '8n', '8n.', '4n', '16n.'], label).toContain(space.delayTime);
        expect(space.reverbDecay, label).toBeGreaterThanOrEqual(0.1);
        expect(space.reverbDecay, label).toBeLessThanOrEqual(8);
        expect(space.preDelay, label).toBeGreaterThanOrEqual(0);
        expect(space.preDelay, label).toBeLessThanOrEqual(0.2);
        expect(space.delayFeedback, label).toBeGreaterThanOrEqual(0);
        expect(space.delayFeedback, label).toBeLessThanOrEqual(0.6);
        // Lows stay dry: the return is always high-passed above the kick.
        expect(space.returnHighpassHz, label).toBeGreaterThanOrEqual(150);
        expect(['CONFIRMED', 'SEARCH-ONLY', 'INFERENCE'], label).toContain(space.source.status);
      }
    }
  });
});

describe('SOUND_BASES parameter ranges', () => {
  it('uses existing presets and keeps every override inside slider and Tone.js ranges', () => {
    everyEntry((label, entry, category) => {
      checkVoice(`${label} main`, category, entry.main);
      checkVoice(`${label} layer`, category, entry.layer);
    });
  });

  it('keeps the layer at least 6 dB under unity and the main at or under unity (headroom)', () => {
    everyEntry((label, entry) => {
      expect(entry.layer.gainDb, label).toBeLessThanOrEqual(-6);
      expect(entry.main.gainDb, label).toBeLessThanOrEqual(0);
    });
  });

  it('keeps effect settings inside Tone.js ranges and sends under MAX_SEND', () => {
    everyEntry((label, { fx }) => {
      if (fx.filter) {
        expect(fx.filter.frequency, label).toBeGreaterThanOrEqual(20);
        expect(fx.filter.frequency, label).toBeLessThanOrEqual(20000);
        if (fx.filter.Q !== undefined) expect(fx.filter.Q, label).toBeLessThanOrEqual(20);
      }
      if (fx.distortion) {
        expect(fx.distortion.amount, label).toBeGreaterThanOrEqual(0);
        expect(fx.distortion.amount, label).toBeLessThanOrEqual(1);
        expect(fx.distortion.wet, label).toBeLessThanOrEqual(1);
      }
      if (fx.compressor) {
        expect(fx.compressor.threshold, label).toBeLessThanOrEqual(0);
        expect(fx.compressor.threshold, label).toBeGreaterThanOrEqual(-60);
        expect(fx.compressor.ratio, label).toBeGreaterThanOrEqual(1);
        expect(fx.compressor.ratio, label).toBeLessThanOrEqual(20);
      }
      for (const send of [fx.reverbSend ?? 0, fx.delaySend ?? 0]) {
        expect(send, label).toBeGreaterThanOrEqual(0);
        expect(send, label).toBeLessThanOrEqual(MAX_SEND);
      }
    });
  });
});

describe('theory approach', () => {
  it('rests on no search-only source', () => {
    for (const genre of GENRE_ORDER) {
      for (const category of DRUM_IDS) {
        expect(SOUND_BASES.theory[genre][category].source.status, `${genre}/${category}`).not.toBe(
          'SEARCH-ONLY'
        );
      }
      expect(SOUND_SPACES.theory[genre].source.status, genre).not.toBe('SEARCH-ONLY');
    }
  });

  it('keeps the kick dry (no reverb or delay send)', () => {
    for (const genre of GENRE_ORDER) {
      const { fx } = SOUND_BASES.theory[genre].kick;
      expect(fx.reverbSend ?? 0, genre).toBe(0);
      expect(fx.delaySend ?? 0, genre).toBe(0);
    }
  });
});

describe('dropdown descriptions', () => {
  it('gives every basis a label and an English and a Japanese sentence', () => {
    for (const basis of SOUND_BASIS_ORDER) {
      const info = SOUND_BASIS_INFO[basis];
      expect(info.label.length, basis).toBeGreaterThan(0);
      expect(info.en, basis).toMatch(/\.$/);
      expect(info.ja, basis).toMatch(/。$/);
    }
  });

  it('has a sentence of its own in every UI language', () => {
    const codes = RIGHTS_NOTICE.languages.map((l) => l.code).filter((c) => c !== 'en' && c !== 'ja');
    for (const basis of SOUND_BASIS_ORDER) {
      for (const code of codes) {
        const text = basisDescription(basis, code);
        expect(text.length, `${basis} ${code}`).toBeGreaterThan(0);
        expect(text, `${basis} ${code}`).not.toBe(SOUND_BASIS_INFO[basis].en);
      }
    }
    expect(basisDescription('modern', 'ja')).toBe('2020 年代風の組み合わせです。');
    expect(basisDescription('modern', 'xx')).toBe(SOUND_BASIS_INFO.modern.en);
  });

  // Owner 2026-10-22: the label is "Modern-style" and the sentence is "2020 年代風の組み合わせです。".
  it('labels the modern basis as modern-style', () => {
    expect(SOUND_BASIS_INFO.modern.en).toMatch(/2020s-style/);
    expect(SOUND_BASIS_INFO.modern.label).toBe('Modern-style');
    expect(SOUND_BASIS_INFO.modern.ja).toContain('2020 年代風');
  });
});

describe('sound basis persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to theory for House when nothing is stored', () => {
    expect(loadSoundBasisState()).toEqual({ basis: 'theory', genre: 'House' });
  });

  it('round-trips a saved basis and genre', () => {
    expect(saveSoundBasisState({ basis: 'modern', genre: 'Techno' })).toBe(true);
    expect(loadSoundBasisState()).toEqual({ basis: 'modern', genre: 'Techno' });
  });

  it('falls back field by field on a corrupt or foreign value', () => {
    localStorage.setItem(SOUND_BASIS_STORAGE_KEY, '{not json');
    expect(loadSoundBasisState()).toEqual({ basis: 'theory', genre: 'House' });
    localStorage.setItem(
      SOUND_BASIS_STORAGE_KEY,
      JSON.stringify({ basis: 'loudest', genre: 'Techno' })
    );
    expect(loadSoundBasisState()).toEqual({ basis: 'theory', genre: 'Techno' });
  });
});
