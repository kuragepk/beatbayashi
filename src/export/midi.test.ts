// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// buildMidiFile's byte layout (VLQ deltas, chunk headers) is covered lightly
// here — the real risk this file guards against is the note-number mapping:
// wiring `presets` to the wrong GM percussion note is silent (the file still
// opens, it just imports as the wrong drum), so each mapping row gets its own
// assertion rather than one combined check.

import { describe, expect, it } from 'vitest';
import { buildMidiFile, midiNoteFromFrequency } from './midi';
import { DEFAULT_LANES, type DrumId } from '../audio/synthPresets';
import type { Accent } from '../accent';

const DEFAULT_PRESETS: Record<DrumId, string> = {
  kick: 'membrane_808',
  tom: 'membrane_mid',
  cymbal: 'metal_closed',
  clap: 'noise_clap',
};

const LANE_ORDER: DrumId[] = ['kick', 'tom', 'cymbal', 'clap'];

/** One bar, one hit on the given lane only, so its note-on event is unambiguous. */
function singleHitGrid(lane: DrumId): boolean[][] {
  return LANE_ORDER.map((id) => [id === lane]);
}

/** Channel-10 note-on is 0x99; the following byte is the GM note number. */
function noteOns(bytes: Uint8Array): number[] {
  const notes: number[] = [];
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x99) notes.push(bytes[i + 1]);
  }
  return notes;
}

/** Finds the second MTrk chunk (the drums) and walks its delta-time-prefixed
 *  events, decoding note-on (0x99) events into {tick, note, velocity}. Good
 *  enough for these tests: it doesn't handle running status or every meta
 *  event type, only what buildMidiFile actually emits. */
function decodeNoteOns(bytes: Uint8Array): { tick: number; note: number; velocity: number }[] {
  const text = (at: number, len: number) => String.fromCharCode(...bytes.subarray(at, at + len));
  const u32 = (at: number) =>
    (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];

  // MThd chunk is 14 bytes total ('MThd' + length + 6-byte body). Track 0
  // ('MTrk' + length + tempo body) follows immediately; track 1 (the drums)
  // follows that.
  expect(text(14, 4)).toBe('MTrk');
  const track0Length = u32(18);
  const track1Start = 14 + 8 + track0Length; // +8 for track 0's 'MTrk'+length
  expect(text(track1Start, 4)).toBe('MTrk');
  const track1Length = u32(track1Start + 4);

  const events: { tick: number; note: number; velocity: number }[] = [];
  let pos = track1Start + 8; // past this track's own 'MTrk' + length header
  const end = pos + track1Length;
  let tick = 0;

  while (pos < end) {
    // Variable-length delta time.
    let delta = 0;
    let b = bytes[pos++];
    delta = b & 0x7f;
    while (b & 0x80) {
      b = bytes[pos++];
      delta = (delta << 7) | (b & 0x7f);
    }
    tick += delta;

    const status = bytes[pos];
    if (status === 0xff) {
      // Meta event: 0xFF, type, length, data...
      const length = bytes[pos + 2];
      pos += 3 + length;
    } else if (status === 0x99 || status === 0x89) {
      const note = bytes[pos + 1];
      const velocity = bytes[pos + 2];
      if (status === 0x99) events.push({ tick, note, velocity });
      pos += 3;
    } else {
      throw new Error(`decodeNoteOns: unexpected status byte 0x${status.toString(16)}`);
    }
  }

  return events;
}

function buildFor(lane: DrumId, presetOverride?: Partial<Record<DrumId, string>>) {
  const presets = presetOverride
    ? { ...DEFAULT_PRESETS, ...presetOverride }
    : undefined;
  const bytes = buildMidiFile({
    lanes: DEFAULT_LANES,
    grid: singleHitGrid(lane),
    bpm: 120,
    resolution: 4,
    bars: 1,
    presets,
  });
  return noteOns(bytes);
}

describe('buildMidiFile — header and framing', () => {
  it('writes a format-1, two-track header at 480 ticks/quarter', () => {
    const bytes = buildMidiFile({
      lanes: DEFAULT_LANES,
      grid: singleHitGrid('kick'),
      bpm: 120,
      resolution: 16,
      bars: 1,
    });

    const ascii = (offset: number, length: number) =>
      String.fromCharCode(...bytes.subarray(offset, offset + length));
    const uint16 = (offset: number) => (bytes[offset] << 8) | bytes[offset + 1];

    expect(ascii(0, 4)).toBe('MThd');
    expect(uint16(8)).toBe(1); // format 1
    expect(uint16(10)).toBe(2); // two tracks
    expect(uint16(12)).toBe(480); // ticks per quarter
    expect(ascii(14, 4)).toBe('MTrk'); // tempo track starts right after the header
  });

  it('writes the rights line as a text meta event when given', () => {
    const line = 'Content: CC0-1.0 OR MIT-0, your choice, no attribution needed. https://creativecommons.org/publicdomain/zero/1.0/';
    const bytes = buildMidiFile({
      lanes: DEFAULT_LANES,
      grid: singleHitGrid('kick'),
      bpm: 120,
      resolution: 16,
      bars: 1,
      rightsText: line,
    });
    const asText = String.fromCharCode(...bytes);
    const at = asText.indexOf(line);
    expect(at).toBeGreaterThan(0);
    expect(bytes[at - 3]).toBe(0xff);
    expect(bytes[at - 2]).toBe(0x01);
    expect(bytes[at - 1]).toBe(line.length);
  });
});

describe('buildMidiFile — GM note mapping without presets (fallback)', () => {
  it('falls back to the fixed 36/45/42/39 mapping', () => {
    expect(buildFor('kick')).toEqual([36]);
    expect(buildFor('tom')).toEqual([45]);
    expect(buildFor('cymbal')).toEqual([42]);
    expect(buildFor('clap')).toEqual([39]);
  });
});

describe('buildMidiFile — GM note mapping with presets', () => {
  it('kick and tom always map to 36/45, regardless of preset', () => {
    expect(buildFor('kick', { kick: 'membrane_909' })).toEqual([36]);
    expect(buildFor('kick', { kick: 'mono_analog' })).toEqual([36]);
    expect(buildFor('tom', { tom: 'fm_electronic' })).toEqual([45]);
    expect(buildFor('tom', { tom: 'duo_wide' })).toEqual([45]);
  });

  it.each([
    ['metal_closed', 42],
    ['noise_closed', 42],
    ['metal_open', 46],
    ['metal_ride', 51],
    ['metal_crash', 49],
  ] as const)('cymbal preset %s maps to note %i', (presetId, note) => {
    expect(buildFor('cymbal', { cymbal: presetId })).toEqual([note]);
  });

  it.each([
    ['noise_clap', 39],
    ['noise_snare', 38],
    ['noise_brush', 40],
    ['metal_rim', 37],
    ['pluck_block', 76],
  ] as const)('clap preset %s maps to note %i', (presetId, note) => {
    expect(buildFor('clap', { clap: presetId })).toEqual([note]);
  });

  it('falls back to the fixed note for a preset id it does not recognise', () => {
    expect(buildFor('cymbal', { cymbal: 'not-a-real-preset' })).toEqual([42]);
    expect(buildFor('clap', { clap: 'not-a-real-preset' })).toEqual([39]);
  });
});

describe('buildMidiFile — copyright provenance (finding 11)', () => {
  /** Reads the first meta event (0xFF, type, length, text) out of track 0. */
  function firstTrack0Meta(bytes: Uint8Array, type: number): string | undefined {
    const text = (at: number, len: number) => String.fromCharCode(...bytes.subarray(at, at + len));
    const u32 = (at: number) =>
      (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
    expect(text(14, 4)).toBe('MTrk');
    const track0Length = u32(18);
    let pos = 22; // past track 0's 'MTrk' + length header
    const end = pos + track0Length;
    while (pos < end) {
      // delta time (always 0x00 for these fixed events in this file)
      while (bytes[pos] & 0x80) pos++;
      pos++;
      if (bytes[pos] !== 0xff) return undefined; // only meta events appear in track 0
      const eventType = bytes[pos + 1];
      const length = bytes[pos + 2];
      if (eventType === type) return text(pos + 3, length);
      pos += 3 + length;
    }
    return undefined;
  }

  it('writes a default copyright notice at tick 0 of the tempo track', () => {
    const bytes = buildMidiFile({
      lanes: DEFAULT_LANES,
      grid: singleHitGrid('kick'),
      bpm: 120,
      resolution: 16,
      bars: 1,
    });
    const notice = firstTrack0Meta(bytes, 0x02);
    expect(notice).toBeDefined();
    expect(notice).toMatch(/synthesis|synthesised/i);
  });

  it('writes a caller-supplied copyright notice verbatim', () => {
    const bytes = buildMidiFile({
      lanes: DEFAULT_LANES,
      grid: singleHitGrid('kick'),
      bpm: 120,
      resolution: 16,
      bars: 1,
      copyright: 'Custom notice',
    });
    expect(firstTrack0Meta(bytes, 0x02)).toBe('Custom notice');
  });

  it('omits the copyright event when explicitly set to empty', () => {
    const bytes = buildMidiFile({
      lanes: DEFAULT_LANES,
      grid: singleHitGrid('kick'),
      bpm: 120,
      resolution: 16,
      bars: 1,
      copyright: '',
    });
    expect(firstTrack0Meta(bytes, 0x02)).toBeUndefined();
  });
});

describe('midiNoteFromFrequency (P2-15)', () => {
  it('maps A4 (440Hz) to note 69', () => {
    expect(midiNoteFromFrequency(440)).toBe(69);
  });

  it('maps A3 (220Hz, one octave down) to note 57', () => {
    expect(midiNoteFromFrequency(220)).toBe(57);
  });

  it('rounds to the nearest semitone rather than truncating', () => {
    // 300Hz sits between D4 (293.66Hz, note 62) and D#4 (311.13Hz, note 63),
    // closer to D4.
    expect(midiNoteFromFrequency(300)).toBe(62);
  });

  it('clamps to the valid MIDI range instead of going negative or past 127', () => {
    expect(midiNoteFromFrequency(1)).toBe(0);
    expect(midiNoteFromFrequency(100_000)).toBe(127);
  });
});

describe('buildMidiFile — GM note follows instrument pitch (P2-15)', () => {
  it('a lane with a configured frequency uses the pitch-derived note, not the preset table', () => {
    const bytes = buildMidiFile({
      lanes: DEFAULT_LANES,
      grid: singleHitGrid('cymbal'),
      bpm: 120,
      resolution: 4,
      bars: 1,
      presets: DEFAULT_PRESETS, // metal_closed would otherwise map to 42
      frequencies: { cymbal: 440 }, // A4 -> note 69
    });
    expect(noteOns(bytes)).toEqual([69]);
  });

  it('a lane without a frequency entry keeps using the preset table', () => {
    const bytes = buildMidiFile({
      lanes: DEFAULT_LANES,
      grid: singleHitGrid('cymbal'),
      bpm: 120,
      resolution: 4,
      bars: 1,
      presets: DEFAULT_PRESETS,
      frequencies: { clap: 440 }, // a different lane's entry must not leak here
    });
    expect(noteOns(bytes)).toEqual([42]);
  });
});

describe('buildMidiFile — accents and swing (P2-16)', () => {
  it('maps each accent level to its MIDI velocity', () => {
    const accents: Accent[][] = [[0], [1], [2], [1]]; // kick/tom/cymbal/clap
    const bytes = buildMidiFile({
      lanes: DEFAULT_LANES,
      grid: [[true], [true], [true], [true]],
      bpm: 120,
      resolution: 4,
      bars: 1,
      accents,
    });

    const notes = decodeNoteOns(bytes);
    const velocityFor = (note: number) => notes.find((n) => n.note === note)?.velocity;

    expect(velocityFor(36)).toBe(70); // kick, weak
    expect(velocityFor(45)).toBe(100); // tom, mid
    expect(velocityFor(42)).toBe(127); // cymbal, strong
    expect(velocityFor(39)).toBe(100); // clap, mid
  });

  it('defaults every hit to the mid velocity when accents is omitted', () => {
    const notes = decodeNoteOns(
      buildMidiFile({
        lanes: DEFAULT_LANES,
        grid: singleHitGrid('kick'),
        bpm: 120,
        resolution: 4,
        bars: 1,
      })
    );
    expect(notes[0].velocity).toBe(100);
  });

  it('delays odd steps by the swing amount, leaves even steps in place', () => {
    // 1/16 at 120 BPM: 480 * 4 / 16 = 120 ticks per step.
    const grid = [[true, true], [false, false], [false, false], [false, false]];
    const bytes = buildMidiFile({
      lanes: DEFAULT_LANES,
      grid,
      bpm: 120,
      resolution: 16,
      bars: 1,
      swing: 50,
    });

    const notes = decodeNoteOns(bytes).sort((a, b) => a.tick - b.tick);
    expect(notes).toHaveLength(2);
    expect(notes[0].tick).toBe(0); // step 0 (even): untouched
    expect(notes[1].tick).toBe(180); // step 1 (odd): +50% of 120 ticks
  });

  it('swing 0 is identical to swing omitted', () => {
    const grid = [[true, true], [false, false], [false, false], [false, false]];
    const withZero = decodeNoteOns(
      buildMidiFile({ lanes: DEFAULT_LANES, grid, bpm: 120, resolution: 16, bars: 1, swing: 0 })
    );
    const omitted = decodeNoteOns(
      buildMidiFile({ lanes: DEFAULT_LANES, grid, bpm: 120, resolution: 16, bars: 1 })
    );
    expect(withZero).toEqual(omitted);
  });
});

describe('buildMidiFile — 32 bars (owner decision 2026-09-29)', () => {
  it('the drum track ends exactly at the end of bar 32', () => {
    const resolution = 32;
    const bars = 32;
    const total = bars * resolution;
    const grid = LANE_ORDER.map(() => Array(total).fill(false));
    const bytes = buildMidiFile({ lanes: DEFAULT_LANES, grid, bpm: 120, resolution, bars });
    // Empty grid: the last event is <delta = endTick> FF 2F 00.
    expect(Array.from(bytes.slice(-3))).toEqual([0xff, 0x2f, 0x00]);
    let i = bytes.length - 4;
    let value = bytes[i] & 0x7f;
    let shift = 7;
    while (i > 0 && (bytes[i - 1] & 0x80) !== 0) {
      i--;
      value |= (bytes[i] & 0x7f) << shift;
      shift += 7;
    }
    const ticksPerStep = (480 * 4) / resolution;
    expect(value).toBe(total * ticksPerStep); // 32 bars x 4 quarters x 480
  });
});

// Owner decision 2026-10-01: the exported file's track name is the product
// name. The shared encoders package (music-kit) holds no product name and
// reads this one from the app's output.
describe('track name', () => {
  function trackNameOf(bytes: Uint8Array): string {
    for (let i = 0; i + 2 < bytes.length; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0x03) {
        return String.fromCharCode(...bytes.slice(i + 3, i + 3 + bytes[i + 2]));
      }
    }
    throw new Error('no track-name meta event');
  }
  const base = {
    lanes: DEFAULT_LANES,
    grid: DEFAULT_LANES.map(() => new Array(16).fill(false)),
    bpm: 120,
    resolution: 16,
    bars: 1,
  };

  it('is BeatBayashi by default', () => {
    expect(trackNameOf(buildMidiFile(base))).toBe('BeatBayashi');
  });

  it('uses the name the caller passes', () => {
    expect(trackNameOf(buildMidiFile({ ...base, name: 'BeatBayashi' }))).toBe('BeatBayashi');
  });
});

describe('sub sounds (pattern format v3)', () => {
  const grid = [[true, false], [false, false], [false, false], [false, false]];
  const subGrid = DEFAULT_LANES.map((_, lane) => [
    [false, lane === 0],
    [false, false],
  ]);

  it('writes an existing sub as its own note on its own steps', () => {
    const notes = decodeNoteOns(
      buildMidiFile({
        lanes: DEFAULT_LANES,
        grid,
        subGrid,
        subPresets: { kick: ['membrane_808'] },
        bpm: 120,
        resolution: 2,
        bars: 1,
      })
    );
    expect(notes.map((n) => n.note)).toEqual([36, 35]);
    expect(notes[1].tick).toBeGreaterThan(notes[0].tick);
  });

  it('writes no sub notes for a lane without a sub sound, or without subGrid', () => {
    expect(
      decodeNoteOns(
        buildMidiFile({ lanes: DEFAULT_LANES, grid, subGrid, bpm: 120, resolution: 2, bars: 1 })
      ).map((n) => n.note)
    ).toEqual([36]);
  });
});
