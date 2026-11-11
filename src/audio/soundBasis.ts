// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0 AND (CC0-1.0 OR MIT-0)
//
// Two licences, two parts: the TypeScript code in this file (types, helpers,
// storage) is MIT-0; the built-in per-genre sound data (preset choices, slider
// overrides, gains, pans, lane effects, space settings and GENRE_BPM) is
// offered under CC0 1.0 or MIT-0, whichever you choose (owner decision
// 2026-10-02). This covers only the project's own rights; sounds a user edits
// stay the user's. See LICENSES/CC0-1.0.txt, LICENSES/MIT-0.txt and REUSE.toml.
//
// "Sound basis": four ways of deciding what each genre's drums sound like,
// ordered by how strong their evidence is (owner's decision, 2026-09-24):
//
//   theory      - acoustics and hearing research only (default)
//   systematic  - circuit analyses and synthesis textbooks
//   empirical   - genre articles in the production press
//   modern      - 2020s combinations, mostly from search summaries (weakest)
//
// Every entry is built from presets that already exist in synthPresets.ts
// plus slider overrides the settings panel already understands, so nothing
// here is a new synthesis engine and every sound stays synthesised (no
// recordings). The reasoning and the source ids (S1, E4, X1, ...) are in
// docs/SOUND_DESIGN_20260924_genre_presets.md; that document's appendix is
// printed from this table, so the numbers live here.

import type { PatternGenre } from '../presets';
import type { DrumId } from './synthPresets';

export type SoundBasis = 'theory' | 'systematic' | 'empirical' | 'modern';

/** Dropdown order. Theory first, and the default. */
export const SOUND_BASIS_ORDER: SoundBasis[] = ['theory', 'systematic', 'empirical', 'modern'];
export const DEFAULT_SOUND_BASIS: SoundBasis = 'theory';

export interface SoundBasisInfo {
  label: string;
  /** One sentence, English, then the Japanese sentence (README format). */
  en: string;
  ja: string;
  /** The same sentence in the other UI languages, machine-written like the rest
   *  of the UI (owner 2026-10-20: the other languages follow en and ja). */
  other: Record<string, string>;
}

/** The description in the UI language; English when a language has none. */
export function basisDescription(basis: SoundBasis, language: string): string {
  const info = SOUND_BASIS_INFO[basis];
  if (language === 'ja') return info.ja;
  return info.other[language] ?? info.en;
}

export const SOUND_BASIS_INFO: Record<SoundBasis, SoundBasisInfo> = {
  theory: {
    label: 'Music theory',
    en: 'Built from acoustics and hearing research only.',
    ja: '音響学と聴覚の研究だけから決めた音です。',
    other: {
      zh: '仅依据声学与听觉研究确定的声音。',
      'zh-Hant-TW': '僅依據聲學與聽覺研究決定的聲音。',
      'zh-Hant-HK': '只根據聲學同聽覺研究決定嘅聲音。',
      hi: 'केवल ध्वनिकी और श्रवण अनुसंधान से तय की गई ध्वनि।',
      ko: '음향학과 청각 연구만으로 정한 소리입니다.',
      es: 'Sonido definido solo a partir de la acústica y la investigación auditiva.',
      ar: 'صوت مبني على علم الصوتيات وأبحاث السمع فقط.',
      fr: 'Un son défini uniquement à partir de l’acoustique et de la recherche sur l’audition.',
    },
  },
  systematic: {
    label: 'Systematic',
    en: 'Follows circuit analyses and synthesis textbooks.',
    ja: '回路の解析と合成の教本の構造に沿った音です。',
    other: {
      zh: '遵循电路分析与合成教材结构的声音。',
      'zh-Hant-TW': '遵循電路分析與合成教材結構的聲音。',
      'zh-Hant-HK': '跟隨電路分析同合成教材結構嘅聲音。',
      hi: 'सर्किट विश्लेषण और सिंथेसिस की पाठ्यपुस्तकों की संरचना पर आधारित ध्वनि।',
      ko: '회로 분석과 합성 교본의 구조를 따른 소리입니다.',
      es: 'Sigue los análisis de circuitos y los manuales de síntesis.',
      ar: 'يتبع تحليلات الدوائر وكتب التركيب الصوتي.',
      fr: 'Suit les analyses de circuits et les manuels de synthèse.',
    },
  },
  empirical: {
    label: 'Production notes',
    en: 'Uses numbers from genre articles in the production press.',
    ja: '制作誌のジャンル別の記事の数値に合わせた音です。',
    other: {
      zh: '采用制作杂志中各曲风文章里的数值。',
      'zh-Hant-TW': '採用製作雜誌中各曲風文章裡的數值。',
      'zh-Hant-HK': '採用製作雜誌入面各曲風文章嘅數值。',
      hi: 'संगीत-निर्माण पत्रिकाओं के शैली-वार लेखों के मानों का उपयोग करती है।',
      ko: '제작 잡지의 장르별 기사에 나온 수치를 따른 소리입니다.',
      es: 'Usa los valores de artículos por género de la prensa de producción.',
      ar: 'يستخدم أرقامًا من مقالات الأنواع الموسيقية في مجلات الإنتاج.',
      fr: 'Reprend les valeurs des articles par genre de la presse spécialisée en production.',
    },
  },
  modern: {
    label: 'Modern-style',
    en: '2020s-style combinations.',
    ja: '2020 年代風の組み合わせです。',
    other: {
      zh: '2020年代风格的组合。',
      'zh-Hant-TW': '2020年代風格的組合。',
      'zh-Hant-HK': '2020年代風格嘅組合。',
      hi: '2020 के दशक जैसा संयोजन।',
      ko: '2020년대풍의 조합입니다.',
      es: 'Una combinación al estilo de los años 2020.',
      ar: 'مزيج على طراز عشرينيات القرن الحادي والعشرين.',
      fr: 'Une combinaison dans l’esprit des années 2020.',
    },
  },
};

/** CONFIRMED: a page or PDF was opened and read. SEARCH-ONLY: only a search
 *  summary was seen. INFERENCE: reasoned from confirmed facts, not stated by
 *  any source. */
export type SourceStatus = 'CONFIRMED' | 'SEARCH-ONLY' | 'INFERENCE';

export interface VoiceSpec {
  /** An existing preset id in SYNTH_PRESETS[category]. */
  presetId: string;
  /** Slider values on top of the preset; keys are that preset's own
   *  `defaults` keys, values inside PARAMETER_SPECS and Tone.js ranges. */
  overrides: Record<string, number>;
  /** Layer level, dB. */
  gainDb: number;
  pan: number;
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

export interface LaneFx {
  filter?: { type: FilterType; frequency: number; Q?: number; rolloff?: -12 | -24 | -48 };
  /** Tone.Distortion: amount 0..1, wet 0..1. */
  distortion?: { amount: number; wet: number };
  /** Tone.Compressor: threshold dB, ratio, attack/release seconds. */
  compressor?: { threshold: number; ratio: number; attack: number; release: number };
  /** 0..0.8, level sent to the shared reverb (after its high-pass). */
  reverbSend?: number;
  /** 0..0.8, level sent to the shared tempo-synced delay (after its high-pass). */
  delaySend?: number;
}

export interface BasisEntry {
  main: VoiceSpec;
  /** The "Add Layer" sound, triggered at the same time as main. */
  layer: VoiceSpec;
  fx: LaneFx;
  reason: string;
  source: { status: SourceStatus; refs: string[] };
}

/** Shared space for the whole kit: one reverb and one delay, each behind a
 *  high-pass so kick and sub stay dry. */
export interface SpaceSpec {
  reverbDecay: number;
  preDelay: number;
  delayTime: '16n' | '8n' | '8n.' | '4n' | '16n.';
  delayFeedback: number;
  returnHighpassHz: number;
  reason: string;
  source: { status: SourceStatus; refs: string[] };
}

type GenreTable<T> = Record<PatternGenre, T>;
type CategoryTable = Record<DrumId, BasisEntry>;

const GENRES: PatternGenre[] = [
  'House',
  'Techno',
  'Eurodance',
  'Trance',
  'Electro',
  'Dubstep',
  'Hip-Hop',
  'Drum & Bass',
  'Gabber',
  'Speedcore',
  'Breakcore',
  'Industrial',
];

/** Representative tempo per genre: the "bright" pattern's BPM in presets.ts. */
export const GENRE_BPM: GenreTable<number> = {
  House: 124,
  Techno: 132,
  Eurodance: 124,
  Trance: 136,
  Electro: 128,
  Dubstep: 140,
  'Hip-Hop': 90,
  'Drum & Bass': 174,
  Gabber: 170,
  Speedcore: 210,
  Breakcore: 175,
  Industrial: 128,
};

const round = (x: number, digits = 3) => Number(x.toFixed(digits));
const beat = (genre: PatternGenre) => 60 / GENRE_BPM[genre];
/** Tail bound: never longer than `fraction` of one beat, never over `cap`. */
const tail = (genre: PatternGenre, fraction: number, cap: number, floor = 0.02) =>
  round(Math.max(floor, Math.min(cap, beat(genre) * fraction)));

const v = (presetId: string, overrides: Record<string, number>, gainDb = 0, pan = 0): VoiceSpec => ({
  presetId,
  overrides,
  gainDb,
  pan,
});

const src = (status: SourceStatus, ...refs: string[]) => ({ status, refs });

// ------------------------------------------------------------ theory ------
// Only §2-§4 of the design doc: split bands (P1), start together (P2), keep
// lows dry (P4), inharmonic cymbals (S4), tails inside one beat (INFERENCE
// from forward masking; X2 is only a search-level rule of thumb).

function theoryFor(genre: PatternGenre): CategoryTable {
  const tempoNote = `tails bounded by one beat at ${GENRE_BPM[genre]} BPM`;
  return {
    kick: {
      main: v('membrane_808', {
        pitchDecay: 0.03,
        octaves: 4,
        decay: tail(genre, 0.8, 0.45),
        release: tail(genre, 1, 0.6),
      }),
      layer: v('mono_analog', { attack: 0.0005, decay: 0.02, release: 0.01 }, -10),
      fx: { reverbSend: 0, delaySend: 0 },
      reason: `Body low (falling sine), attack in a different band (short bright pulse) so they do not mask; ${tempoNote}; kept dry.`,
      source: src('CONFIRMED', 'S1', 'P1', 'P2', 'P4'),
    },
    tom: {
      main: v('membrane_mid', {
        pitchDecay: 0.05,
        octaves: 2.5,
        decay: tail(genre, 0.7, 0.4),
        release: tail(genre, 0.8, 0.45),
      }),
      layer: v('fm_electronic', { attack: 0.0005, decay: 0.03, release: 0.02 }, -10),
      fx: { filter: { type: 'highpass', frequency: 60 }, reverbSend: 0.12, delaySend: 0 },
      reason: `Same membrane model as the kick with a smaller sweep; a short broadband FM tick carries the stick attack; ${tempoNote}.`,
      source: src('INFERENCE', 'S1', 'P1', 'X4'),
    },
    cymbal: {
      main: v('metal_closed', {
        resonance: 3400,
        decay: tail(genre, 0.25, 0.09, 0.03),
      }),
      layer: v('noise_closed', { decay: tail(genre, 0.1, 0.035, 0.015) }, -8),
      fx: { filter: { type: 'highpass', frequency: 400 }, reverbSend: 0.15, delaySend: 0 },
      reason:
        'Inharmonic metal body plus a shorter broadband noise onset (the early, bright part of a struck plate); nothing below 400 Hz is needed.',
      source: src('CONFIRMED', 'S4', 'P1', 'P4'),
    },
    clap: {
      main: v('noise_clap', { decay: tail(genre, 0.35, 0.16, 0.06) }),
      layer: v('noise_snare', { decay: 0.05, release: 0.02 }, -8),
      fx: { filter: { type: 'highpass', frequency: 150 }, reverbSend: 0.2, delaySend: 0 },
      reason:
        'Pink-noise body and a shorter white-noise attack split the band by time; high-passed so the reverb return carries no low end.',
      source: src('CONFIRMED', 'S2', 'P1', 'P4'),
    },
  };
}

function theorySpace(genre: PatternGenre): SpaceSpec {
  return {
    reverbDecay: round(Math.min(1.2, beat(genre) * 2)),
    preDelay: 0.02,
    delayTime: '8n',
    delayFeedback: 0.2,
    returnHighpassHz: 300,
    reason: 'Short room-like tail (two beats at most), 20 ms pre-delay keeps the attack clear, lows cut before the return.',
    source: src('INFERENCE', 'P3', 'P4', 'X2'),
  };
}

// -------------------------------------------------------- systematic ------
// The structures from SoS Synth Secrets and the circuit papers, copied as
// structure: a kick whose pitch falls only a few semitones (S1), a two-stage
// oscillator + envelope (S6), cymbals on the circuit paper's oscillator
// frequencies and its two band centres (S5), higher band decaying faster (S7),
// a snare as noise plus a pitched component (S2).

function systematicFor(genre: PatternGenre): CategoryTable {
  return {
    kick: {
      main: v('membrane_acoustic', {
        pitchDecay: 0.05,
        octaves: 0.5,
        decay: tail(genre, 0.9, 0.5),
        release: tail(genre, 1, 0.5),
      }),
      layer: v('mono_analog', { attack: 0.0005, decay: 0.015, release: 0.01 }, -12),
      fx: { reverbSend: 0, delaySend: 0 },
      reason:
        'Triangle oscillator with a pitch fall of about half an octave (the textbook "couple of semitones" is below the slider minimum), plus a pulse stage for the click.',
      source: src('CONFIRMED', 'S1', 'S6'),
    },
    tom: {
      main: v('membrane_mid', {
        pitchDecay: 0.05,
        octaves: 1,
        decay: tail(genre, 0.8, 0.45),
        release: tail(genre, 0.8, 0.45),
      }),
      layer: v('fm_electronic', { attack: 0.0005, decay: 0.025, release: 0.02 }, -12),
      fx: { filter: { type: 'highpass', frequency: 60 }, reverbSend: 0.1, delaySend: 0 },
      reason: 'The kick structure retuned upward with a smaller fall; no tom-specific textbook numbers were found.',
      source: src('INFERENCE', 'S1', 'X4'),
    },
    cymbal: {
      main: v('metal_closed', {
        frequency: 205,
        resonance: 3440,
        decay: tail(genre, 0.3, 0.1, 0.03),
      }),
      layer: v('metal_closed', {
        frequency: 540,
        resonance: 7000,
        decay: tail(genre, 0.15, 0.05, 0.02),
      }, -6),
      fx: { filter: { type: 'highpass', frequency: 500 }, reverbSend: 0.1, delaySend: 0 },
      reason:
        'Circuit-paper oscillator range (205-540 Hz) and its two band centres (3,440 / ~7,100 Hz, capped at 7,000 by the engine); the upper band decays faster.',
      source: src('CONFIRMED', 'S5', 'S7', 'S3'),
    },
    clap: {
      main: v('noise_snare', { decay: tail(genre, 0.3, 0.14, 0.06) }),
      layer: v('metal_rim', { frequency: 200, decay: 0.03 }, -10),
      fx: { filter: { type: 'highpass', frequency: 120 }, reverbSend: 0.15, delaySend: 0 },
      reason:
        'Noise plus a pitched component; the clap lane has no membrane voice, so a low-tuned short metal hit stands in for the drum modes.',
      source: src('CONFIRMED', 'S2'),
    },
  };
}

function systematicSpace(genre: PatternGenre): SpaceSpec {
  return {
    reverbDecay: round(Math.min(1, beat(genre) * 1.5)),
    preDelay: 0.01,
    delayTime: '8n',
    delayFeedback: 0.15,
    returnHighpassHz: 250,
    reason: 'The textbooks give no space settings; a short plain tail with the lows cut, the same rule as the theory approach.',
    source: src('INFERENCE', 'P4'),
  };
}

// --------------------------------------------------------- empirical ------
// Genre numbers from the production press. Per-genre so each row can cite
// the article it came from.

const glue = { threshold: -12, ratio: 2, attack: 0.03, release: 0.1 };

const EMPIRICAL: GenreTable<CategoryTable> = {
  House: {
    kick: {
      main: v('membrane_909', { decay: 0.2, release: 0.3 }),
      layer: v('mono_analog', { decay: 0.02, release: 0.01 }, -12),
      fx: { distortion: { amount: 0.28, wet: 0.3 }, compressor: glue },
      reason: 'Decay shortened for a tighter hit; light drive (28%) and 2-3 dB of slow-attack glue compression.',
      source: src('CONFIRMED', 'E1', 'E2'),
    },
    tom: {
      main: v('membrane_mid', { decay: 0.25, octaves: 3 }),
      layer: v('am_soft', { decay: 0.08 }, -10),
      fx: { reverbSend: 0.1 },
      reason: 'No house tom numbers exist in the articles read; a mid tom with a soft upper layer.',
      source: src('SEARCH-ONLY', 'X4'),
    },
    cymbal: {
      main: v('metal_closed', { attack: 0.003, decay: 0.06 }),
      layer: v('metal_ride', { attack: 0.009, decay: 0.3 }, -12),
      fx: { filter: { type: 'highpass', frequency: 400 }, reverbSend: 0.1 },
      reason: 'Hat attack softened; ride layer with 9.5 ms attack and 300 ms decay.',
      source: src('CONFIRMED', 'E1', 'E2'),
    },
    clap: {
      main: v('noise_clap', { decay: 0.1 }),
      layer: v('noise_snare', { attack: 0.002, decay: 0.07 }, -6),
      fx: { filter: { type: 'highpass', frequency: 120 }, reverbSend: 0.15 },
      reason: 'Clap plus snare, both shortened; snare high-passed near 120 Hz as in deep tech house.',
      source: src('CONFIRMED', 'E1', 'E3'),
    },
  },
  Techno: {
    kick: {
      main: v('membrane_909', { pitchDecay: 0.04, octaves: 6, decay: 0.3 }),
      layer: v('membrane_808', { decay: 0.9, release: 1, octaves: 3 }, -14),
      fx: {
        filter: { type: 'highpass', frequency: 45 },
        compressor: { threshold: -18, ratio: 4, attack: 0.01, release: 0.1 },
        reverbSend: 0.1,
      },
      reason: 'Heavily compressed kick with a clear pitch envelope, lows under ~50 Hz rolled off; a longer second kick underneath.',
      source: src('CONFIRMED', 'E4'),
    },
    tom: {
      main: v('membrane_floor', { decay: 0.3 }),
      layer: v('fm_electronic', { decay: 0.04 }, -10),
      fx: { reverbSend: 0.15, delaySend: 0.1 },
      reason: 'No techno tom numbers were found; a floor tom with a short FM tick.',
      source: src('SEARCH-ONLY', 'X4'),
    },
    cymbal: {
      main: v('metal_closed', { decay: 0.07 }),
      layer: v('noise_closed', { decay: 0.04 }, -10),
      fx: { distortion: { amount: 0.2, wet: 0.3 }, reverbSend: 0.15 },
      reason: 'Hat with light saturation and a little plate-like reverb.',
      source: src('CONFIRMED', 'E5'),
    },
    clap: {
      main: v('noise_clap', { decay: 0.14 }),
      layer: v('noise_snare', { decay: 0.08 }, -8),
      fx: { filter: { type: 'highpass', frequency: 200 }, reverbSend: 0.3 },
      reason: 'Clap and snare to reverb on the backbeat; the articles give no numbers, so the values are ours.',
      source: src('SEARCH-ONLY', 'E4'),
    },
  },
  Eurodance: {
    kick: {
      main: v('membrane_909', { decay: 0.15, release: 0.17 }),
      layer: v('mono_analog', { decay: 0.02 }, -12),
      fx: { compressor: glue },
      reason: 'Tight, short kick (release 173 ms).',
      source: src('CONFIRMED', 'E15', 'E16'),
    },
    tom: {
      main: v('membrane_high', { decay: 0.14 }),
      layer: v('am_soft', { decay: 0.06 }, -10),
      fx: { reverbSend: 0.2 },
      reason: 'No eurodance tom numbers; a short high tom.',
      source: src('SEARCH-ONLY', 'X4'),
    },
    cymbal: {
      main: v('metal_closed', { decay: 0.04 }),
      layer: v('noise_closed', { decay: 0.02 }, -10),
      fx: { filter: { type: 'highpass', frequency: 500 }, reverbSend: 0.05 },
      reason: 'Hat tail shortened.',
      source: src('CONFIRMED', 'E15'),
    },
    clap: {
      main: v('noise_clap', { decay: 0.12, volume: -9 }),
      layer: v('noise_snare', { decay: 0.06 }, -10),
      fx: { filter: { type: 'highpass', frequency: 200 }, reverbSend: 0.7 },
      reason: 'Quiet snare on 2 and 4; clap in a wide, mostly wet reverb (dry/wet 71%).',
      source: src('CONFIRMED', 'E15', 'E16'),
    },
  },
  Trance: {
    kick: {
      main: v('membrane_909', { decay: 0.18 }),
      layer: v('mono_analog', { decay: 0.02 }, -12),
      fx: {
        distortion: { amount: 0.2, wet: 0.25 },
        compressor: { threshold: -15, ratio: 3, attack: 0.01, release: 0.1 },
        delaySend: 0.1,
      },
      reason: 'Short-decay kick with a pinch of overdrive, its own compression and a short slap delay.',
      source: src('CONFIRMED', 'E14'),
    },
    tom: {
      main: v('membrane_mid', { decay: 0.3 }),
      layer: v('fm_electronic', { decay: 0.04 }, -10),
      fx: { reverbSend: 0.25, delaySend: 0.15 },
      reason: 'No trance tom source was reached; a mid tom into the shared delay.',
      source: src('SEARCH-ONLY', 'X1', 'X4'),
    },
    cymbal: {
      main: v('metal_closed', { decay: 0.06 }),
      layer: v('metal_open', { decay: 0.2 }, -12),
      fx: { filter: { type: 'highpass', frequency: 500 }, reverbSend: 0.15, delaySend: 0.25 },
      reason: 'Hats into a tempo-synced delay; the dotted-eighth convention is only a search result.',
      source: src('SEARCH-ONLY', 'X1', 'E23'),
    },
    clap: {
      main: v('noise_clap', { decay: 0.15 }),
      layer: v('noise_snare', { decay: 0.08 }, -8),
      fx: { filter: { type: 'highpass', frequency: 200 }, reverbSend: 0.4 },
      reason: 'Snare or clap on 2 and 4 with reverb.',
      source: src('CONFIRMED', 'E14'),
    },
  },
  Electro: {
    kick: {
      main: v('membrane_808', { decay: 0.21, release: 0.3, octaves: 6 }),
      layer: v('mono_analog', { decay: 0.015 }, -12),
      fx: { distortion: { amount: 0.25, wet: 0.3 } },
      reason: 'Short, tight, tuned kick; bus drive 25%.',
      source: src('CONFIRMED', 'E6'),
    },
    tom: {
      main: v('membrane_high', { decay: 0.18 }),
      layer: v('fm_electronic', { decay: 0.03 }, -10),
      fx: { reverbSend: 0.08 },
      reason: 'No electro tom numbers; a short high tom in the short room.',
      source: src('SEARCH-ONLY', 'X4'),
    },
    cymbal: {
      main: v('metal_closed', { attack: 0.0005, decay: 0.05 }),
      layer: v('metal_open', { decay: 0.375 }, -12),
      fx: { filter: { type: 'highpass', frequency: 317 }, reverbSend: 0.08 },
      reason: 'Closed hat high-passed at 317 Hz; open hat layer at 375 ms.',
      source: src('CONFIRMED', 'E6'),
    },
    clap: {
      main: v('noise_snare', { decay: 0.12 }),
      layer: v('noise_clap', { decay: 0.08, volume: -11 }, -6),
      fx: { reverbSend: 0.08 },
      reason: 'Bright snare, with the clap as a low, short texture layer; short room at about 8% wet.',
      source: src('CONFIRMED', 'E6'),
    },
  },
  Dubstep: {
    kick: {
      main: v('membrane_909', { octaves: 3, decay: 0.2 }),
      layer: v('mono_analog', { decay: 0.02 }, -10),
      fx: { filter: { type: 'highpass', frequency: 50 } },
      reason: 'Kick chosen above the sub-bass (weight near 100 Hz, presence near 5 kHz), everything under 50 Hz cut.',
      source: src('CONFIRMED', 'E7', 'E8'),
    },
    tom: {
      main: v('membrane_floor', { decay: 0.3 }),
      layer: v('fm_electronic', { decay: 0.04 }, -10),
      fx: { reverbSend: 0.2 },
      reason: 'No dubstep tom numbers were found.',
      source: src('SEARCH-ONLY', 'X4'),
    },
    cymbal: {
      main: v('metal_closed', { decay: 0.05 }),
      layer: v('noise_closed', { decay: 0.03 }, -10),
      fx: { filter: { type: 'highpass', frequency: 500 }, reverbSend: 0.1 },
      reason: 'Hats shortened and everything below 500 Hz removed.',
      source: src('CONFIRMED', 'E8'),
    },
    clap: {
      main: v('noise_snare', { decay: 0.14 }),
      layer: v('noise_clap', { decay: 0.12 }, -6),
      fx: { filter: { type: 'highpass', frequency: 180 }, reverbSend: 0.4 },
      reason: 'Snare weight near 200 Hz with a clap on top for the highs; clap reverb about 40% wet, only above 500 Hz.',
      source: src('CONFIRMED', 'E7', 'E8'),
    },
  },
  'Hip-Hop': {
    kick: {
      main: v('membrane_808', { decay: 0.35, release: 0.4, octaves: 4 }),
      layer: v('membrane_acoustic', { decay: 0.06 }, -8),
      fx: { distortion: { amount: 0.15, wet: 0.3 }, compressor: glue },
      reason: 'Two kick layers, a low thump and a snappier upper one; shortened for dryness, light tape-like saturation.',
      source: src('CONFIRMED', 'E10', 'E11'),
    },
    tom: {
      main: v('membrane_floor', { decay: 0.3 }),
      layer: v('am_soft', { decay: 0.1 }, -10),
      fx: { reverbSend: 0.15 },
      reason: 'Tom and conga fills at bar edges are mentioned without numbers.',
      source: src('CONFIRMED', 'E10'),
    },
    cymbal: {
      main: v('metal_closed', { decay: 0.06, volume: -18 }),
      layer: v('metal_open', { decay: 0.25 }, -12),
      fx: { filter: { type: 'highpass', frequency: 400 }, reverbSend: 0.1 },
      reason: 'Closed hats kept low in the mix, open hats as the second layer.',
      source: src('CONFIRMED', 'E10'),
    },
    clap: {
      main: v('noise_snare', { decay: 0.14 }),
      layer: v('noise_clap', { decay: 0.12 }, -6),
      fx: { filter: { type: 'highpass', frequency: 150 }, reverbSend: 0.35 },
      reason: 'Layered snare and clap into a hall-type reverb.',
      source: src('CONFIRMED', 'E10'),
    },
  },
  'Drum & Bass': {
    kick: {
      main: v('membrane_909', { decay: 0.16 }),
      layer: v('mono_analog', { decay: 0.02 }, -8),
      fx: { filter: { type: 'highpass', frequency: 85 }, distortion: { amount: 0.2, wet: 0.3 } },
      reason: 'Kick high-passed at about 85 Hz to leave room for the bass, mids and highs pushed; group saturation.',
      source: src('CONFIRMED', 'E9'),
    },
    tom: {
      main: v('membrane_high', { decay: 0.12 }),
      layer: v('fm_electronic', { decay: 0.03 }, -10),
      fx: { reverbSend: 0.1 },
      reason: 'No D&B tom numbers; a short high tom so fills stay readable at 174 BPM.',
      source: src('SEARCH-ONLY', 'X4'),
    },
    cymbal: {
      main: v('metal_ride', { decay: 0.4, volume: -20 }),
      layer: v('noise_closed', { decay: 0.03 }, -12),
      fx: {
        filter: { type: 'highpass', frequency: 500 },
        compressor: { threshold: -24, ratio: 4, attack: 0.005, release: 0.15 },
        reverbSend: 0.1,
      },
      reason: 'Ride kept back in the mix (the article ducks it from kick and snare; the engine has no sidechain, so it is compressed and lowered).',
      source: src('CONFIRMED', 'E9'),
    },
    clap: {
      main: v('noise_snare', { decay: 0.12 }),
      layer: v('noise_clap', { decay: 0.1 }, -6),
      fx: { filter: { type: 'highpass', frequency: 150 }, reverbSend: 0.25, distortion: { amount: 0.15, wet: 0.2 } },
      reason: 'Stacked snare, the top layer high-passed into a subtle hall; group saturation.',
      source: src('CONFIRMED', 'E9'),
    },
  },
  Gabber: {
    kick: {
      main: v('membrane_909', { decay: 0.25, octaves: 6 }),
      layer: v('membrane_808', { decay: 0.3, octaves: 4 }, -10),
      fx: {
        distortion: { amount: 0.9, wet: 1 },
        filter: { type: 'lowpass', frequency: 3000 },
        compressor: { threshold: -20, ratio: 6, attack: 0.003, release: 0.08 },
      },
      reason: 'Kick overdriven far past clipping towards a square wave, then mids and highs trimmed; the compressor holds the sustain that clipping adds.',
      source: src('CONFIRMED', 'E17', 'E18'),
    },
    tom: {
      main: v('membrane_mid', { decay: 0.15 }),
      layer: v('fm_electronic', { decay: 0.03 }, -10),
      fx: { distortion: { amount: 0.4, wet: 0.5 } },
      reason: 'No gabber tom source; a short tom with some of the same drive.',
      source: src('SEARCH-ONLY', 'X4'),
    },
    cymbal: {
      main: v('metal_closed', { decay: 0.05 }),
      layer: v('noise_closed', { decay: 0.03 }, -10),
      fx: { filter: { type: 'highpass', frequency: 500 } },
      reason: 'No primary source covers cymbals in this genre; short and dry.',
      source: src('SEARCH-ONLY'),
    },
    clap: {
      main: v('noise_clap', { decay: 0.1 }),
      layer: v('noise_snare', { decay: 0.06 }, -8),
      fx: { filter: { type: 'highpass', frequency: 200 }, reverbSend: 0.1 },
      reason: 'No primary source covers claps in this genre; short with a small reverb.',
      source: src('SEARCH-ONLY'),
    },
  },
  Speedcore: {
    kick: {
      main: v('membrane_909', { decay: 0.1, release: 0.08, octaves: 5 }),
      layer: v('mono_analog', { decay: 0.015 }, -10),
      fx: {
        distortion: { amount: 0.95, wet: 1 },
        compressor: { threshold: -20, ratio: 8, attack: 0.002, release: 0.05 },
      },
      reason: 'At very high tempo the gap between kicks vanishes, so the decay is cut hard and distortion pushes the hit out.',
      source: src('CONFIRMED', 'E19'),
    },
    tom: {
      main: v('membrane_high', { decay: 0.08 }),
      layer: v('fm_electronic', { decay: 0.02 }, -10),
      fx: { distortion: { amount: 0.5, wet: 0.5 } },
      reason: 'No speedcore tom source; very short so hits do not blur.',
      source: src('SEARCH-ONLY', 'X4'),
    },
    cymbal: {
      main: v('metal_closed', { decay: 0.03 }),
      layer: v('noise_closed', { decay: 0.015 }, -10),
      fx: { filter: { type: 'highpass', frequency: 600 } },
      reason: 'No cymbal source; the shortest hat so it stays separate at speed.',
      source: src('SEARCH-ONLY'),
    },
    clap: {
      main: v('noise_snare', { decay: 0.06 }),
      layer: v('noise_clap', { decay: 0.05 }, -8),
      fx: { filter: { type: 'highpass', frequency: 200 }, distortion: { amount: 0.4, wet: 0.4 } },
      reason: 'No clap source; short, with distortion like the kick.',
      source: src('SEARCH-ONLY'),
    },
  },
  Breakcore: {
    kick: {
      main: v('membrane_909', { decay: 0.14 }),
      layer: v('mono_analog', { decay: 0.02 }, -10),
      fx: { distortion: { amount: 0.5, wet: 0.5 } },
      reason: 'Breaks are distorted as much as cut; a short kick with drive.',
      source: src('CONFIRMED', 'E20'),
    },
    tom: {
      main: v('membrane_mid', { decay: 0.14 }),
      layer: v('fm_electronic', { decay: 0.03 }, -10),
      fx: { delaySend: 0.3, reverbSend: 0.1 },
      reason: 'Delay throws on the break for a different timbre.',
      source: src('CONFIRMED', 'E20'),
    },
    cymbal: {
      main: v('metal_closed', { decay: 0.05 }),
      layer: v('noise_closed', { decay: 0.03 }, -10),
      fx: { filter: { type: 'highpass', frequency: 500 }, delaySend: 0.2 },
      reason: 'Delay on the break (chorus is not available in this engine).',
      source: src('CONFIRMED', 'E20'),
    },
    clap: {
      main: v('noise_snare', { decay: 0.1 }),
      layer: v('noise_clap', { decay: 0.08 }, -6),
      fx: { filter: { type: 'highpass', frequency: 150 }, distortion: { amount: 0.4, wet: 0.4 }, delaySend: 0.2 },
      reason: 'Distorted snare with delay throws.',
      source: src('CONFIRMED', 'E20'),
    },
  },
  Industrial: {
    kick: {
      main: v('membrane_909', { decay: 0.22 }),
      layer: v('mono_analog', { decay: 0.03 }, -10),
      fx: {
        filter: { type: 'highpass', frequency: 40 },
        distortion: { amount: 0.4, wet: 0.5 },
        compressor: { threshold: -15, ratio: 4, attack: 0.005, release: 0.1 },
      },
      reason: 'Body of the kick hollowed (the 250-300 Hz cut is approximated by drive plus a tight decay; the engine has no EQ band), crunchy overall.',
      source: src('CONFIRMED', 'E5'),
    },
    tom: {
      main: v('membrane_floor', { decay: 0.3 }),
      layer: v('fm_electronic', { decay: 0.05, harmonicity: 3.5 }, -8),
      fx: { distortion: { amount: 0.3, wet: 0.4 }, reverbSend: 0.1 },
      reason: 'Metallic and machine layers over the drums; an inharmonic FM layer on the tom.',
      source: src('CONFIRMED', 'E21'),
    },
    cymbal: {
      main: v('metal_closed', { decay: 0.08 }),
      layer: v('noise_closed', { decay: 0.2 }, -10),
      fx: { distortion: { amount: 0.5, wet: 0.4 }, filter: { type: 'highpass', frequency: 400 }, reverbSend: 0.1 },
      reason: 'Noise hit with medium-long decay and overdrive; short plate on the hats.',
      source: src('CONFIRMED', 'E5'),
    },
    clap: {
      main: v('noise_snare', { decay: 0.12 }),
      layer: v('metal_rim', { decay: 0.04 }, -8),
      fx: { filter: { type: 'highpass', frequency: 150 }, distortion: { amount: 0.3, wet: 0.3 }, reverbSend: 0.1 },
      reason: 'Snare with a metallic layer, crunchy and short.',
      source: src('CONFIRMED', 'E5', 'E21'),
    },
  },
};

const EMPIRICAL_SPACE: GenreTable<SpaceSpec> = {
  House: { reverbDecay: 1, preDelay: 0.015, delayTime: '8n', delayFeedback: 0.2, returnHighpassHz: 300, reason: 'The articles mention reverb only on chords; a modest room.', source: src('SEARCH-ONLY', 'E1') },
  Techno: { reverbDecay: 2.5, preDelay: 0.02, delayTime: '8n', delayFeedback: 0.25, returnHighpassHz: 250, reason: 'Short plate for hats; techno also sends kick to reverb with the return high-passed.', source: src('CONFIRMED', 'E5', 'P4') },
  Eurodance: { reverbDecay: 1.8, preDelay: 0.02, delayTime: '8n', delayFeedback: 0.2, returnHighpassHz: 400, reason: 'Wide, gritty room on the clap.', source: src('CONFIRMED', 'E15') },
  Trance: { reverbDecay: 2.2, preDelay: 0.03, delayTime: '8n.', delayFeedback: 0.3, returnHighpassHz: 400, reason: 'Slap delay on the kick; dotted-eighth delay is only a search result.', source: src('SEARCH-ONLY', 'E14', 'X1') },
  Electro: { reverbDecay: 0.71, preDelay: 0.005, delayTime: '16n', delayFeedback: 0.15, returnHighpassHz: 300, reason: 'Short room, 710 ms.', source: src('CONFIRMED', 'E6') },
  Dubstep: { reverbDecay: 1.5, preDelay: 0.02, delayTime: '8n', delayFeedback: 0.25, returnHighpassHz: 500, reason: 'Reverb only above 500 Hz.', source: src('CONFIRMED', 'E8') },
  'Hip-Hop': { reverbDecay: 1.6, preDelay: 0.02, delayTime: '8n', delayFeedback: 0.2, returnHighpassHz: 300, reason: 'Hall-type preset on the snare.', source: src('CONFIRMED', 'E10') },
  'Drum & Bass': { reverbDecay: 1.2, preDelay: 0.01, delayTime: '16n', delayFeedback: 0.2, returnHighpassHz: 400, reason: 'Subtle hall on the high-passed top snare.', source: src('CONFIRMED', 'E9') },
  Gabber: { reverbDecay: 0.5, preDelay: 0, delayTime: '16n', delayFeedback: 0.1, returnHighpassHz: 400, reason: 'No space source for gabber; kept short.', source: src('SEARCH-ONLY') },
  Speedcore: { reverbDecay: 0.3, preDelay: 0, delayTime: '16n', delayFeedback: 0.1, returnHighpassHz: 500, reason: 'No room between hits at this tempo; almost dry.', source: src('CONFIRMED', 'E19') },
  Breakcore: { reverbDecay: 0.8, preDelay: 0.01, delayTime: '16n.', delayFeedback: 0.35, returnHighpassHz: 300, reason: 'Delay as a timbre effect on breaks.', source: src('CONFIRMED', 'E20') },
  Industrial: { reverbDecay: 0.9, preDelay: 0.01, delayTime: '8n', delayFeedback: 0.2, returnHighpassHz: 300, reason: 'Short plate reverb.', source: src('CONFIRMED', 'E5') },
};

// ------------------------------------------------------------ modern ------
// 2020s combinations. Starts from the empirical row and changes what the
// modern practice changes. Most of this is SEARCH-ONLY.

function modernFor(genre: PatternGenre): CategoryTable {
  const base = EMPIRICAL[genre];
  const copy = (entry: BasisEntry, patch: Partial<BasisEntry>): BasisEntry => ({
    ...entry,
    ...patch,
  });
  switch (genre) {
    case 'Techno':
    case 'Industrial':
      return {
        ...base,
        kick: copy(base.kick, {
          layer: v('membrane_808', { decay: 1.6, release: 1.5, octaves: 2 }, -10),
          fx: {
            filter: { type: 'lowpass', frequency: 900, Q: 4 },
            distortion: { amount: 0.3, wet: 0.4 },
            compressor: { threshold: -18, ratio: 4, attack: 0.01, release: 0.1 },
            reverbSend: 0.45,
          },
          reason: 'Rumble: a second, longer kick through a resonant low-pass with a little drive into a long, wet reverb (return still high-passed).',
          source: src('CONFIRMED', 'E4'),
        }),
      };
    case 'Hip-Hop':
      return {
        ...base,
        kick: copy(base.kick, {
          main: v('membrane_808', { decay: 1.2, release: 1.5, octaves: 3, pitchDecay: 0.06 }),
          layer: v('mono_analog', { decay: 0.02 }, -12),
          fx: { distortion: { amount: 0.2, wet: 0.35 } },
          reason: 'Long kick whose weight is its decay tail, with gentle saturation; tuning to the song key needs a note setting this engine does not expose.',
          source: src('CONFIRMED', 'E12', 'X3'),
        }),
        cymbal: copy(base.cymbal, {
          main: v('metal_closed', { decay: 0.04 }),
          reason: 'Very short hats for fast rolls (the rolls themselves are a pattern, not a sound).',
          source: src('SEARCH-ONLY', 'E13', 'X3'),
        }),
      };
    case 'Dubstep':
      return {
        ...base,
        clap: copy(base.clap, {
          fx: { filter: { type: 'highpass', frequency: 300 }, reverbSend: 0.3, delaySend: 0.35 },
          reason: 'Riddim: dark, repetitive, with wide delays on the percussion.',
          source: src('CONFIRMED', 'E22'),
        }),
        cymbal: copy(base.cymbal, {
          fx: { filter: { type: 'highpass', frequency: 600 }, delaySend: 0.3 },
          reason: 'Riddim: wide delays for space rather than punch.',
          source: src('CONFIRMED', 'E22'),
        }),
      };
    case 'Gabber':
      return {
        ...base,
        kick: copy(base.kick, {
          main: v('membrane_909', { decay: 0.45, release: 0.4, octaves: 6 }),
          fx: {
            distortion: { amount: 1, wet: 1 },
            filter: { type: 'lowpass', frequency: 2500 },
            compressor: { threshold: -22, ratio: 8, attack: 0.003, release: 0.1 },
          },
          reason: 'Mainstream-hardcore kick: deeper and longer envelope than early gabber, fully distorted.',
          source: src('CONFIRMED', 'E18', 'X6'),
        }),
      };
    case 'Speedcore':
    case 'Breakcore':
      return {
        ...base,
        kick: copy(base.kick, {
          fx: {
            ...base.kick.fx,
            distortion: { amount: 1, wet: 1 },
            compressor: { threshold: -24, ratio: 10, attack: 0.002, release: 0.05 },
          },
          reason: 'Hardcore distortion pushed to the maximum, with a harder compressor.',
          source: src('SEARCH-ONLY', 'E19', 'X6'),
        }),
      };
    case 'Trance':
    case 'Eurodance':
    case 'House':
      return {
        ...base,
        kick: copy(base.kick, {
          fx: { ...base.kick.fx, delaySend: 0.08 },
          reason: 'Current practice adds a short slap delay to the kick; only a search-level convention outside trance.',
          source: src('SEARCH-ONLY', 'E14'),
        }),
        cymbal: copy(base.cymbal, {
          fx: { ...base.cymbal.fx, delaySend: 0.2 },
          reason: 'Dotted-eighth delay on hats; a search-level convention.',
          source: src('SEARCH-ONLY', 'X1'),
        }),
      };
    default:
      // Electro, Drum & Bass: no 2020s combination was found, so these keep
      // the empirical sound and say so.
      return Object.fromEntries(
        (Object.keys(base) as DrumId[]).map((category) => [
          category,
          copy(base[category], {
            reason: `No 2020s source found; same as the production-notes approach. ${base[category].reason}`,
            source: src('SEARCH-ONLY', ...base[category].source.refs),
          }),
        ])
      ) as CategoryTable;
  }
}

function modernSpace(genre: PatternGenre): SpaceSpec {
  const base = EMPIRICAL_SPACE[genre];
  if (genre === 'Techno' || genre === 'Industrial') {
    return { ...base, reverbDecay: 4, preDelay: 0.02, returnHighpassHz: 200, reason: 'Long, deep reverb for the rumble layer.', source: src('CONFIRMED', 'E4') };
  }
  if (genre === 'Dubstep') {
    return { ...base, delayTime: '8n.', delayFeedback: 0.4, reason: 'Wide delays (riddim); the note value is our choice.', source: src('SEARCH-ONLY', 'E22', 'X1') };
  }
  return { ...base, source: src('SEARCH-ONLY', ...base.source.refs) };
}

// -------------------------------------------------------------- table ------

const build = <T>(fn: (genre: PatternGenre) => T): GenreTable<T> =>
  Object.fromEntries(GENRES.map((genre) => [genre, fn(genre)])) as GenreTable<T>;

export const SOUND_BASES: Record<SoundBasis, GenreTable<CategoryTable>> = {
  theory: build(theoryFor),
  systematic: build(systematicFor),
  empirical: EMPIRICAL,
  modern: build(modernFor),
};

export const SOUND_SPACES: Record<SoundBasis, GenreTable<SpaceSpec>> = {
  theory: build(theorySpace),
  systematic: build(systematicSpace),
  empirical: EMPIRICAL_SPACE,
  modern: build(modernSpace),
};

export function getBasisEntry(basis: SoundBasis, genre: PatternGenre, category: DrumId): BasisEntry {
  return SOUND_BASES[basis][genre][category];
}

export function isSoundBasis(value: unknown): value is SoundBasis {
  return typeof value === 'string' && (SOUND_BASIS_ORDER as string[]).includes(value);
}

// ------------------------------------------------------- persistence ------

export const SOUND_BASIS_STORAGE_KEY = 'BeatBayashi.soundBasis';

export interface SoundBasisState {
  basis: SoundBasis;
  genre: PatternGenre;
}

export const DEFAULT_SOUND_BASIS_STATE: SoundBasisState = {
  basis: DEFAULT_SOUND_BASIS,
  genre: 'House',
};

export function loadSoundBasisState(): SoundBasisState {
  try {
    const raw = localStorage.getItem(SOUND_BASIS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SOUND_BASIS_STATE };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SOUND_BASIS_STATE };
    const candidate = parsed as Record<string, unknown>;
    return {
      basis: isSoundBasis(candidate.basis) ? candidate.basis : DEFAULT_SOUND_BASIS,
      genre: (GENRES as unknown[]).includes(candidate.genre)
        ? (candidate.genre as PatternGenre)
        : DEFAULT_SOUND_BASIS_STATE.genre,
    };
  } catch {
    return { ...DEFAULT_SOUND_BASIS_STATE };
  }
}

export function saveSoundBasisState(state: SoundBasisState): boolean {
  try {
    localStorage.setItem(SOUND_BASIS_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
