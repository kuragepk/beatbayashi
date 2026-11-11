// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0 AND (CC0-1.0 OR MIT-0)
//
// Two licences, two parts: the TypeScript code in this file is MIT-0; the
// built-in rhythm pattern data (the 72 patterns' ids, names, genres,
// characters, tempos, step grids and descriptions, and the genre and character
// tables) is offered under CC0 1.0 or MIT-0, whichever you choose (owner
// decision 2026-10-02). This covers only the project's own rights; patterns a
// user makes stay the user's. See LICENSES/CC0-1.0.txt, LICENSES/MIT-0.txt
// and REUSE.toml.

// Rhythm patterns: 12 genres x 6 characters, authored as 1 bar of 16th notes.
//
// Lanes are [kick, tom, cymbal, clap]; cymbal doubles as hi-hat and clap as
// snare, since the machine has four voices.
//
// A note on `character`: drum patterns carry no major/minor tonality -- that is
// harmony, not rhythm. The six groups split by rhythmic character instead:
//   bright — straight, on-grid, open
//   dark   — sparse, heavy, weight on the downbeat
//   groove — syncopated, busy, extra hits between the beats
//   hard   — maximum density, doubled kicks, relentless
//   break  — breakbeat displacement, snare off the expected beat
//   jazzy  — hats skip beats 2 and 4 for the 16th after, extra snares, kick pickups
//
// The engine plays every step at one fixed strength on a straight 16th grid.
// Descriptions say what is on the grid, not a feel the engine cannot produce.
//
// Tempos come from a search sweep of stated BPM ranges per genre (2026-08-20);
// where sources disagreed the most-repeated figure won.

export type PatternCharacter =
  | 'bright'
  | 'dark'
  | 'groove'
  | 'hard'
  | 'break'
  | 'jazzy';
export type PatternGenre =
  | 'House'
  | 'Electro'
  | 'Dubstep'
  | 'Techno'
  | 'Hip-Hop'
  | 'Drum & Bass'
  | 'Gabber'
  | 'Speedcore'
  | 'Breakcore'
  | 'Eurodance'
  | 'Trance'
  | 'Industrial';

export interface Preset {
  id: string;
  name: string;
  description: string;
  character: PatternCharacter;
  genre: PatternGenre;
  /** Loaded with the pattern so each genre plays at its own tempo. */
  bpm: number;
  /** [lane][step], 1 bar of 16ths. */
  grid: number[][];
}

export const PRESET_RESOLUTION = 16;

/**
 * Genres grouped by rhythmic family. The table reads top-to-bottom as a
 * progression: steady pulse, then displaced beats, then extreme tempo.
 */
export type GenreFamily = 'Four on the Floor' | 'Bass & Breaks' | 'Hardcore';

export const GENRE_FAMILY_ORDER: GenreFamily[] = [
  'Four on the Floor',
  'Bass & Breaks',
  'Hardcore',
];

export const GENRE_FAMILIES: Record<GenreFamily, PatternGenre[]> = {
  'Four on the Floor': ['House', 'Techno', 'Eurodance', 'Trance'],
  'Bass & Breaks': ['Electro', 'Dubstep', 'Hip-Hop', 'Drum & Bass'],
  Hardcore: ['Gabber', 'Speedcore', 'Breakcore', 'Industrial'],
};

/** Flat order, derived from the families so the two can never disagree. */
export const GENRE_ORDER: PatternGenre[] = GENRE_FAMILY_ORDER.flatMap(
  (family) => GENRE_FAMILIES[family]
);

/** Shown under each column heading so the axis explains itself. */
export const CHARACTER_DESCRIPTIONS: Record<PatternCharacter, string> = {
  bright: 'straight, on-grid',
  dark: 'sparse, heavy',
  groove: 'syncopated, busy',
  hard: 'dense, relentless',
  break: 'displaced snare',
  jazzy: 'off-beat hats, extra snares',
};

export const CHARACTER_ORDER: PatternCharacter[] = [
  'bright',
  'dark',
  'groove',
  'hard',
  'break',
  'jazzy',
];

export const CHARACTER_LABELS: Record<PatternCharacter, string> = {
  bright: 'Bright',
  dark: 'Dark',
  groove: 'Groove',
  hard: 'Hard',
  break: 'Break',
  jazzy: 'Jazzy',
};

const p = (
  id: string,
  name: string,
  genre: PatternGenre,
  character: PatternCharacter,
  bpm: number,
  description: string,
  kick: number[],
  tom: number[],
  cymbal: number[],
  clap: number[]
): Preset => ({
  id,
  name,
  genre,
  character,
  bpm,
  description,
  grid: [kick, tom, cymbal, clap],
});

export const PRESETS: Preset[] = [
  // ------------------------------------------------------------ HOUSE (124)
  p('house-bright', 'House Major 1', 'House', 'bright', 124,
    'Four-on-the-floor kick, offbeat hats, clap on 2 and 4.',
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('house-dark', 'Deep House', 'House', 'dark', 122,
    'Same pulse, hats thinned out and a kick pickup into the bar.',
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,1],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('house-groove', 'Funky House', 'House', 'groove', 126,
    'Four-on-the-floor with a kick on the a of 2; offbeat hats plus an extra 16th on the e of 2 and 4.',
    [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [0,0,1,0, 0,1,1,0, 0,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),

  // ---------------------------------------------------------- ELECTRO (128)
  p('electro-bright', 'Electro Pop', 'Electro', 'bright', 128,
    'Broken kick that skips beat 2, bright offbeat hats.',
    [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('electro-dark', 'Electro Bass', 'Electro', 'dark', 126,
    'Doubled kick hits and hats pulled back to straight 8ths.',
    [1,0,0,1, 0,0,0,0, 1,0,1,0, 0,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0],
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('electro-groove', 'Electro Funk', 'Electro', 'groove', 130,
    'Clustered kicks and 8th hats with tom answers.',
    [1,0,0,0, 0,1,1,0, 0,0,1,0, 1,0,0,0],
    [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,1,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),

  // ---------------------------------------------------------- DUBSTEP (140)
  p('dubstep-bright', 'Dubstep Lite', 'Dubstep', 'bright', 140,
    'Half-time: one snare on beat 3, hats keeping the offbeat.',
    [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]),
  p('dubstep-dark', 'Dubstep Heavy', 'Dubstep', 'dark', 140,
    'Sparse and weighty — kick clusters, hats only on the beat.',
    [1,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]),
  p('dubstep-groove', 'Dubstep Skip', 'Dubstep', 'groove', 142,
    'Half-time snare with a skipping kick and a tom fill.',
    [1,0,0,0, 0,0,1,0, 0,0,0,1, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0],
    [0,0,1,0, 0,0,1,0, 0,1,1,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]),

  // ----------------------------------------------------------- TECHNO (132)
  p('techno-bright', 'Techno Drive', 'Techno', 'bright', 132,
    'Four-on-the-floor kick; hats on the offbeat 8ths; a single clap on 3.',
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]),
  p('techno-dark', 'Minimal Techno', 'Techno', 'dark', 130,
    'Stripped to the pulse: four-on-the-floor kick, a half-bar hat, one tom hit on the e of 4.',
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0]),
  p('techno-groove', 'Tech House', 'Techno', 'groove', 134,
    '16th hats over a kick that pushes into the next bar.',
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0],
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),

  // ------------------------------------------------------------ HIP-HOP (90)
  p('hiphop-bright', 'Boom Bap', 'Hip-Hop', 'bright', 90,
    'The classic boom-bap: kick on 1, snare on 2 and 4, 8th hats.',
    [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('hiphop-dark', 'Lo-Fi', 'Hip-Hop', 'dark', 84,
    'Kick on 1, the a of 2 and the & of 3; hats on the beat only — space between every hit.',
    [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('hiphop-groove', 'Trap', 'Hip-Hop', 'groove', 140,
    'Rolling 16th hats, syncopated kick, snare on 3.',
    [1,0,0,1, 0,0,0,0, 0,0,1,0, 0,1,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,1, 1,0,0,0]),

  // ------------------------------------------------------ DRUM & BASS (174)
  p('dnb-bright', 'Two-Step', 'Drum & Bass', 'bright', 174,
    'The two-step foundation: kick on 1, snare on 2 and 4.',
    [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('dnb-dark', 'Neurofunk', 'Drum & Bass', 'dark', 172,
    'Kick on 1 and the a of 3; hats on the offbeat 8ths; claps on 2 and 4.',
    [1,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('dnb-groove', 'Breakbeat Classic', 'Drum & Bass', 'groove', 174,
    'Snares on 2, the & of 3 and 4; kick on 1 and the & of 2 and 4; 8th hats.',
    [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0]),

  // ----------------------------------------------------------- GABBER (170)
  p('gabber-bright', 'Gabber Pound', 'Gabber', 'bright', 170,
    'Relentless kick roll with dense 16th hats and snare on 3 and 4.',
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 1,0,0,0]),
  p('gabber-dark', 'Gabber Raw', 'Gabber', 'dark', 168,
    'Sparse kick clusters and minimal hats — heavy and aggressive.',
    [1,0,0,1, 0,0,0,0, 1,0,1,0, 0,0,0,1],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 0,0,0,1, 1,0,0,0, 0,0,0,1]),
  p('gabber-groove', 'Gabber Rave', 'Gabber', 'groove', 172,
    'Kick on 1, the a of 1, the e of 2, 3, the & of 3 and the e of 4; hats add the e of 2 and 4 to the 8ths; tom fills on the a of 2 and the e of 4.',
    [1,0,0,1, 0,1,0,0, 1,0,1,0, 0,1,0,0],
    [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,1,0],
    [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,1, 1,0,0,0]),

  // --------------------------------------------------------- SPEEDCORE (210)
  p('speedcore-bright', 'Speedcore Rush', 'Speedcore', 'bright', 210,
    'Machine-gun kick at maximum intensity, dense everything.',
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,1,0, 1,0,1,0, 0,0,1,0, 1,0,1,0]),
  p('speedcore-dark', 'Speedcore Assault', 'Speedcore', 'dark', 208,
    'Deliberately sparse — kick attacks and void. Claustrophobic.',
    [1,0,1,0, 0,0,0,1, 1,0,1,0, 0,0,0,1],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0]),
  p('speedcore-groove', 'Speedcore Chaos', 'Speedcore', 'groove', 212,
    'Displaced kicks and hi-hats — controlled chaos.',
    [1,0,1,0, 0,1,0,1, 1,0,1,0, 0,1,0,1],
    [0,0,0,1, 0,0,0,1, 0,0,0,1, 0,0,0,1],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,1,0,0, 1,0,0,0, 0,1,0,0, 1,0,0,0]),

  // ------------------------------------------------------ BREAKCORE (175)
  p('breakcore-bright', 'Breakcore Jitter', 'Breakcore', 'bright', 175,
    'Fractured kick pattern with sharp hi-hats — broken but precise.',
    [1,0,0,1, 0,1,0,0, 1,0,1,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,1, 1,0,0,0]),
  p('breakcore-dark', 'Breakcore Glitch', 'Breakcore', 'dark', 173,
    'Sparse and unpredictable — silence broken by sudden attacks.',
    [1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,1],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0],
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,1, 0,0,0,0, 1,0,0,0, 0,0,1,0]),
  p('breakcore-groove', 'Breakcore Twist', 'Breakcore', 'groove', 177,
    'Complex syncopation with tom fills and layered hats.',
    [1,0,0,1, 0,1,0,0, 0,0,1,0, 1,0,1,0],
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,1,0,0],
    [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,1, 1,0,0,0]),

  // ---------------------------------------------------- EURODANCE (124)
  p('eurodance-bright', 'Eurodance Pop', 'Eurodance', 'bright', 124,
    'Bouncy four-on-the-floor with bright rising hi-hats.',
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,1,0, 0,1,1,0, 0,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('eurodance-dark', 'Eurodance Dark', 'Eurodance', 'dark', 122,
    'Heavy synth foundation with sparse percussion.',
    [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('eurodance-groove', 'Eurodance Rave', 'Eurodance', 'groove', 126,
    'Energetic with syncopated kicks and layered hats.',
    [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [0,0,1,0, 0,1,1,0, 0,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),

  // ------------------------------------------------------ TRANCE (136)
  p('trance-bright', 'Trance Euphoria', 'Trance', 'bright', 136,
    'Rising energy with a pulsing kick and layered percussion.',
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,1,0, 0,1,1,0, 0,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('trance-dark', 'Trance Minimal', 'Trance', 'dark', 134,
    'Four-on-the-floor kick; hats on the & of 2 and 4; a single clap on the & of 2; tom on the e of 4.',
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0]),
  p('trance-groove', 'Trance Breakdown', 'Trance', 'groove', 138,
    'Syncopated kick with complex hi-hat patterns.',
    [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,1,0],
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [0,0,1,0, 0,1,1,0, 0,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),

  // --------------------------------------------------- INDUSTRIAL (128)
  p('industrial-bright', 'Industrial Stomp', 'Industrial', 'bright', 128,
    'Sharp, aggressive hits with metallic percussion.',
    [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('industrial-dark', 'Industrial Noise', 'Industrial', 'dark', 126,
    'Oppressive and sparse — kick attacks amid silence.',
    [1,0,0,1, 0,0,0,1, 1,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    [0,0,0,1, 0,0,0,0, 1,0,0,0, 0,0,1,0]),
  p('industrial-groove', 'Industrial Harsh', 'Industrial', 'groove', 130,
    'Syncopated kicks with harsh, displaced hi-hats.',
    [1,0,0,1, 0,1,0,1, 1,0,0,1, 0,1,0,0],
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,1, 1,0,0,0]),

  // ================================================== HARD / BREAK / JAZZY ===
  // The second three characters, added for players who read charts rather than
  // bars: hard is density, break is displacement, jazzy is off-beat hats and extra snares.

  // -------- HOUSE
  p('house-hard', 'Hard House', 'House', 'hard', 126,
    'Doubled kicks under relentless 16th hats.',
    [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,1],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('house-break', 'House Break', 'House', 'break', 124,
    'Four-on-the-floor abandoned for a displaced snare.',
    [1,0,0,0, 0,0,1,0, 0,0,0,1, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0]),
  p('house-jazzy', 'Jazzy House', 'House', 'jazzy', 122,
    'Hats on the 8ths, 2 and 4 moved a 16th later; extra snare on the a of 2; kick pickup on the a of 3.',
    [1,0,0,0, 1,0,0,0, 1,0,0,1, 1,0,0,0],
    [0,0,0,1, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0]),

  // -------- ELECTRO
  p('electro-hard', 'Hard Electro', 'Electro', 'hard', 130,
    'Kick on every offbeat with a wall of 16th hats.',
    [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('electro-break', 'Electro Break', 'Electro', 'break', 128,
    'Snare thrown late, kick scattered around it.',
    [1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    [1,1,1,0, 1,0,1,1, 1,0,1,0, 1,1,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0]),
  p('electro-jazzy', 'Electro Offbeat', 'Electro', 'jazzy', 126,
    'Hats on the 8ths, 2 and 4 moved a 16th later; kick on 1, 3, the e and & of 2 and the e of 4; toms on the & of 1 and 3.',
    [1,0,0,0, 0,1,1,0, 1,0,0,0, 0,1,0,0],
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0]),

  // -------- DUBSTEP
  p('dubstep-hard', 'Dubstep Brutal', 'Dubstep', 'hard', 142,
    'Half-time frame filled in with doubled kicks.',
    [1,0,0,1, 0,0,0,1, 1,0,0,1, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]),
  p('dubstep-break', 'Dubstep Break', 'Dubstep', 'break', 140,
    'Snare pulled early and late around the half-time anchor.',
    [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0],
    [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,0,1,0],
    [0,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0]),
  p('dubstep-jazzy', 'Dubstep Skip Hats', 'Dubstep', 'jazzy', 138,
    'Half-time snare on 3 plus an extra on the a of 2; hats on the 8ths, 2 and 4 moved a 16th later; kick on 1 and the & of 2 and 4.',
    [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 0,0,0,1, 1,0,0,0, 0,0,0,0]),

  // -------- TECHNO
  p('techno-hard', 'Hard Techno', 'Techno', 'hard', 138,
    'Kick doubling into every bar with 16th hats throughout.',
    [1,0,0,1, 1,0,0,0, 1,0,0,1, 1,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('techno-break', 'Techno Break', 'Techno', 'break', 134,
    'The pulse broken open, snare landing off the beat.',
    [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0]),
  p('techno-jazzy', 'Techno Offbeat', 'Techno', 'jazzy', 130,
    'Four-on-the-floor with a kick on the a of 2; hats on the 8ths, 2 and 4 moved a 16th later; extra snare on the a of 2.',
    [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,0],
    [0,0,0,1, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0]),

  // -------- HIP-HOP
  p('hiphop-hard', 'Hard Trap', 'Hip-Hop', 'hard', 145,
    'Dense kick roll under rapid-fire hats.',
    [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,1,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('hiphop-break', 'Boom Bap Break', 'Hip-Hop', 'break', 92,
    'The break chopped — snare early, kick answering late.',
    [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0]),
  p('hiphop-jazzy', 'Jazzy Hip-Hop', 'Hip-Hop', 'jazzy', 88,
    'Kick on 1, the a of 2 and the & of 3; snares on 2 and 4 with extras on the a of each; hats on the 8ths, 2 and 4 moved a 16th later.',
    [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0],
    [0,0,0,1, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1]),

  // -------- DRUM & BASS
  p('dnb-hard', 'Hard DnB', 'Drum & Bass', 'hard', 176,
    'Doubled kicks under a constant 16th ride.',
    [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('dnb-break', 'Chopped Break', 'Drum & Bass', 'break', 174,
    'Same kick and snares as Breakbeat Classic; the hats add 16ths on the a of 1 and the e of 3.',
    [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0],
    [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0]),
  p('dnb-jazzy', 'Liquid DnB', 'Drum & Bass', 'jazzy', 172,
    'Kick on 1, the e of 2 and the & of 3; snares on 2 and 4 with an extra on the a of 2; hats on the 8ths, 2 and 4 moved a 16th later.',
    [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,0],
    [0,0,1,0, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0]),

  // -------- GABBER
  p('gabber-hard', 'Gabber Extreme', 'Gabber', 'hard', 175,
    'Kick on ten of the sixteen steps (every 8th plus the a of 1 and 3); hats on the 8ths; claps on the offbeat 8ths.',
    [1,0,1,1, 1,0,1,0, 1,0,1,1, 1,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0]),
  p('gabber-break', 'Gabber Break', 'Gabber', 'break', 172,
    'Kick roll interrupted by displaced snare hits.',
    [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0],
    [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,1,0],
    [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0]),
  p('gabber-jazzy', 'Gabber Offbeat', 'Gabber', 'jazzy', 168,
    'Four-on-the-floor kick plus the a of 2; hats on the 8ths, 2 and 4 moved a 16th later; extra snare on the a of 2.',
    [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,0],
    [0,0,0,1, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0]),

  // -------- SPEEDCORE
  p('speedcore-hard', 'Speedcore Extreme', 'Speedcore', 'hard', 215,
    'Kick saturation — the densest pattern in the machine.',
    [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,1,0, 1,0,1,0, 0,0,1,0, 1,0,1,0]),
  p('speedcore-break', 'Speedcore Break', 'Speedcore', 'break', 210,
    'Displaced kicks and toms tearing the grid apart.',
    [1,0,1,0, 0,1,0,1, 1,0,1,0, 0,1,0,1],
    [0,0,0,1, 0,0,0,1, 0,0,0,1, 0,0,0,1],
    [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,0,1,0],
    [0,1,0,0, 1,0,0,0, 0,1,0,0, 1,0,0,0]),
  p('speedcore-jazzy', 'Speedcore Offbeat', 'Speedcore', 'jazzy', 205,
    'Kick on every 8th except beats 2 and 4; hats on the 8ths, 2 and 4 moved a 16th later; extra snare on the a of 2.',
    [1,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,1,0],
    [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0]),

  // -------- BREAKCORE
  p('breakcore-hard', 'Breakcore Wall', 'Breakcore', 'hard', 180,
    'Fractured kicks packed to saturation.',
    [1,0,1,1, 0,1,0,1, 1,0,1,1, 0,1,0,1],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,1, 1,0,0,0]),
  p('breakcore-break', 'Breakcore Chop', 'Breakcore', 'break', 175,
    'The break diced — every hit displaced from where it belongs.',
    [1,0,0,1, 0,1,0,0, 1,0,0,0, 0,1,1,0],
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,1,0,0],
    [1,1,1,0, 1,0,1,1, 1,0,1,0, 1,1,1,0],
    [0,0,0,0, 1,0,0,0, 0,1,0,1, 1,0,0,0]),
  p('breakcore-jazzy', 'Breakcore Offbeat', 'Breakcore', 'jazzy', 172,
    'Kick on 1, the e of 2, 3 and the a of 3; snares on 2 and 4 with extras on the a of each; hats on the 8ths, 2 and 4 moved a 16th later.',
    [1,0,0,0, 0,1,0,0, 1,0,0,1, 0,0,0,0],
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1]),

  // -------- EURODANCE
  p('eurodance-hard', 'Hard Eurodance', 'Eurodance', 'hard', 128,
    'Doubled kicks driving under bright 16th hats.',
    [1,0,0,1, 1,0,0,0, 1,0,0,1, 1,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('eurodance-break', 'Eurodance Break', 'Eurodance', 'break', 124,
    'The floor pulled out — snare lands where the kick should.',
    [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0]),
  p('eurodance-jazzy', 'Eurodance Bounce', 'Eurodance', 'jazzy', 122,
    'Four-on-the-floor kick with a pickup on the a of 2; hats on the 8ths, 2 and 4 moved a 16th later; extra snare on the a of 2.',
    [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,0],
    [0,0,0,1, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0]),

  // -------- TRANCE
  p('trance-hard', 'Hard Trance', 'Trance', 'hard', 142,
    'Relentless doubled kick under a driving 16th pulse.',
    [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,1],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('trance-break', 'Trance Break', 'Trance', 'break', 136,
    'The drop pulled apart — kick displaced, snare answering.',
    [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0]),
  p('trance-jazzy', 'Trance Offbeat', 'Trance', 'jazzy', 132,
    'Four-on-the-floor kick with a pickup on the a of 3; hats on the 8ths, 2 and 4 moved a 16th later; extra snare on the a of 2.',
    [1,0,0,0, 1,0,0,0, 1,0,0,1, 1,0,0,0],
    [0,0,0,1, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0]),

  // -------- INDUSTRIAL
  p('industrial-hard', 'Industrial Wall', 'Industrial', 'hard', 132,
    'Metallic kick saturation with a hammering hat.',
    [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]),
  p('industrial-break', 'Industrial Break', 'Industrial', 'break', 128,
    'Kick on 1, the a of 1, the e of 2, 3, the a of 3 and the e of 4; toms on the & of 2 and 4; snares on 2, the & of 3 and 4.',
    [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0],
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    [1,1,1,0, 1,0,1,1, 1,0,1,0, 1,1,1,0],
    [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0]),
  p('industrial-jazzy', 'Industrial Offbeat', 'Industrial', 'jazzy', 126,
    'Kick on 1 and 3 with a second hit on the a of each; toms on the & of 1 and 3; snares on 2 and 4 with extras on the a of each; hats on the 8ths, 2 and 4 moved a 16th later.',
    [1,0,0,1, 0,0,0,0, 1,0,0,1, 0,0,0,0],
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
    [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1]),
];

export const DEFAULT_PRESET_ID = 'house-bright';

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

export function findPreset(
  genre: PatternGenre,
  character: PatternCharacter
): Preset | undefined {
  return PRESETS.find((x) => x.genre === genre && x.character === character);
}
