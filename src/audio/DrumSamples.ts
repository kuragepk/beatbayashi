// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Drum samples definition with sound sources
// Each drum is generated from Tone.js synthesizers for CORS-free operation

export const DRUM_SAMPLES = {
  kick: {
    name: 'Sub Kick (Deep Sub)',
    category: 'Kick',
    type: 'synth' as const,
    config: {
      oscillator: { type: 'sine' as const },
      envelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.2 },
      pitch: { from: 150, to: 40, duration: 0.08 },
    },
  },
  tom: {
    name: 'Tom (Mid Pitch)',
    category: 'Tom',
    type: 'synth' as const,
    config: {
      oscillator: { type: 'sine' as const },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 },
      pitch: { from: 400, to: 150, duration: 0.08 },
    },
  },
  cymbal: {
    name: 'Hi-Hat (Bright)',
    category: 'Cymbal',
    type: 'metal' as const,
    config: {
      frequency: 350,
      envelope: { attack: 0.001, decay: 0.2, release: 0.05 },
      harmonicity: 12,
      resonance: 2500,
      volume: -8,
    },
  },
  clap: {
    name: 'Clap (Acoustic)',
    category: 'Clap',
    type: 'metal' as const,
    config: {
      frequency: 250,
      envelope: { attack: 0.002, decay: 0.12, release: 0.08 },
      harmonicity: 8,
      resonance: 3200,
      volume: -10,
    },
  },
};

export type DrumId = keyof typeof DRUM_SAMPLES;
