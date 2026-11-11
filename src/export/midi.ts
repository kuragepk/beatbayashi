// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

/**
 * Pattern -> Standard MIDI File.
 *
 * A MIDI file is the one format every DAW on every platform reads without a
 * plugin, an account, or a converter. Exporting one is what makes "carry it
 * into your DAW" true rather than aspirational.
 *
 * We write a format-1 file: track 0 carries the tempo map, track 1 carries the
 * drums on channel 10 (the General MIDI percussion channel), so the notes land
 * on the right instruments in Cubase, Studio One, Ableton, Logic and Reaper
 * without any remapping.
 */

import { type DrumId, type Lane } from '../audio/synthPresets';
import { ACCENT_MIDI_VELOCITY, DEFAULT_ACCENT, type Accent } from '../accent';

const TICKS_PER_QUARTER = 480;

/**
 * General MIDI percussion note numbers, in the lane order the sequencer uses.
 * These are the GM standard assignments, so a DAW's drum map names them
 * correctly on import.
 */
export const GM_DRUM_NOTES = {
  kick: 36, // Bass Drum 1
  tom: 45, // Low Tom
  cymbal: 42, // Closed Hi-Hat
  clap: 39, // Hand Clap
} as const;

/** Notes a sub sound falls back to when its own note would land on the
 *  main sound's note (or an earlier sub's), so each sub stays its own note
 *  in a DAW. Index = sub number - 1. GM: 35 Acoustic Bass Drum, 37 Side
 *  Stick, 47 Low-Mid Tom, 50 High Tom, 44 Pedal Hi-Hat, 46 Open Hi-Hat,
 *  40 Electric Snare, 54 Tambourine. */
export const SUB_FALLBACK_NOTES: Record<keyof typeof GM_DRUM_NOTES, readonly number[]> = {
  kick: [35, 37],
  tom: [47, 50],
  cymbal: [44, 46],
  clap: [40, 54],
};

/**
 * Preset-specific GM percussion notes for the two voices whose sound varies
 * enough that one fixed note misrepresents it in a DAW (a ride cymbal shown
 * as a closed hat, say). Kick and tom stay on 36/45 regardless of preset —
 * every kick/tom preset is still recognisably a kick or tom.
 */
const CYMBAL_NOTE_BY_PRESET: Record<string, number> = {
  metal_closed: 42, // Closed Hi-Hat
  noise_closed: 42, // Closed Hi-Hat
  metal_open: 46, // Open Hi-Hat
  metal_ride: 51, // Ride Cymbal 1
  metal_crash: 49, // Crash Cymbal 1
};

const CLAP_NOTE_BY_PRESET: Record<string, number> = {
  noise_clap: 39, // Hand Clap
  noise_snare: 38, // Acoustic Snare
  noise_brush: 40, // Electric Snare
  metal_rim: 37, // Side Stick
  pluck_block: 76, // High Wood Block
};

/** Converts a frequency in Hz to the nearest MIDI note number (P2-15),
 *  A4 = 440Hz = note 69, twelve notes per octave. Clamped to the valid MIDI
 *  range (0..127) since a synth's slider can go lower/higher than any GM
 *  drum note the format can represent. */
export function midiNoteFromFrequency(hz: number): number {
  const note = Math.round(69 + 12 * Math.log2(hz / 440));
  return Math.min(127, Math.max(0, note));
}

/** Resolves the GM note for one lane. A lane whose voice has a configurable
 *  pitch (P2-15: cymbal/clap presets built on MetalSynth, tuned via a
 *  `frequency` Hz value rather than a fixed GM assignment) uses that pitch
 *  directly, so a hit exported to MIDI lands on the note a DAW's pitch wheel
 *  or piano roll actually agrees is "that" pitch — not a fixed table entry
 *  that stops matching the moment someone drags the Frequency slider.
 *  Everything else falls back to the preset-specific table, then the fixed
 *  per-category default (unknown preset id, or no `presets`/`frequencies`
 *  map at all). */
function laneNote(drum: DrumId, presetId: string | undefined, frequencyHz: number | undefined): number {
  if (frequencyHz !== undefined) return midiNoteFromFrequency(frequencyHz);
  if (drum === 'cymbal' && presetId !== undefined) {
    const mapped = CYMBAL_NOTE_BY_PRESET[presetId];
    if (mapped !== undefined) return mapped;
  }
  if (drum === 'clap' && presetId !== undefined) {
    const mapped = CLAP_NOTE_BY_PRESET[presetId];
    if (mapped !== undefined) return mapped;
  }
  return GM_DRUM_NOTES[drum];
}

/** MIDI stores delta times as variable-length quantities, 7 bits per byte. */
function variableLengthQuantity(value: number): number[] {
  const bytes = [value & 0x7f];
  let remaining = value >>> 7;
  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  return bytes;
}

function text(value: string): number[] {
  return Array.from(value, (char) => char.charCodeAt(0) & 0xff);
}

function uint32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function uint16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function chunk(id: string, body: number[]): number[] {
  return [...text(id), ...uint32(body.length), ...body];
}

interface MidiEvent {
  tick: number;
  /** Note-offs must be written before note-ons at the same tick. */
  order: number;
  bytes: number[];
}

export interface MidiExportOptions {
  /** The grid's lanes, in the same order as its rows (P2-17) — resolves
   *  each row's category for GM note lookup. ISSUE-BEATBOX-011: a lane's
   *  `muted`/`solo` is ignored here — this writes the pattern as authored,
   *  not as it currently sounds through mute/solo, the same way it already
   *  ignores whether the transport happens to be playing. */
  lanes: Lane[];
  /** [lane][step] booleans, in the same order as `lanes`. */
  grid: boolean[][];
  bpm: number;
  /** Steps per bar (16 = sixteenth notes). */
  resolution: number;
  bars: number;
  /** Optional name written into the file as a track name. */
  name?: string;
  /** Optional text written as a MIDI Text meta event (0xFF 0x01), used for the
   *  content-rights line. Kept under 128 bytes so its length is one byte. */
  rightsText?: string;
  /** Per-lane preset id, used to pick a more accurate GM note for cymbal and
   *  clap categories (e.g. a ride cymbal preset maps to Ride rather than
   *  Closed Hi-Hat). Keyed by lane id. Omitted: falls back to the fixed
   *  36/45/42/39-per-category mapping. */
  presets?: Record<string, string>;
  /** Per-lane pitch in Hz (P2-15), for voices whose actual sound is tuned by
   *  a frequency slider rather than a fixed drum note (currently the
   *  MetalSynth-based cymbal/clap presets — see `laneNote`). Keyed by lane
   *  id, same as `presets`. When a lane has an entry here, it overrides that
   *  lane's `presets`/fixed-table lookup: this is the pitch actually
   *  configured, not a guess from the preset name. Omitted or lane absent:
   *  falls back to `presets`/the fixed per-category mapping. */
  frequencies?: Record<string, number>;
  /** Per-cell accent (P2-16), same shape as `grid`. Omitted: every hit gets
   *  the mid/default velocity. */
  accents?: Accent[][];
  /** Sub-sound steps (pattern format v3), `subGrid[lane][sub][step]`. Each
   *  sub that exists (see `subPresets`) is written as its own note on its
   *  own steps. Omitted: only the main steps are written, as before v3. */
  subGrid?: boolean[][][];
  /** Preset id of each existing sub sound, per lane id, in sub order. A lane
   *  absent here (or an empty list) has no sub sound, so its sub rows are
   *  not written. */
  subPresets?: Record<string, string[]>;
  /** 0..MAX_SWING percent (P2-16): delays every other step's note-on by this
   *  much of a step's length. Omitted or 0: straight time. */
  swing?: number;
  /** Written as a Copyright Notice meta event (0xFF 0x02) at tick 0 of the
   *  tempo track (finding 11, P1-1 licensing-provenance audit): once a
   *  .mid file leaves this app nothing else says it has no sampled or
   *  third-party audio in it. Defaults to a fixed notice; pass '' to omit
   *  the event entirely. */
  copyright?: string;
}

const DEFAULT_COPYRIGHT =
  'BeatBayashi - all sounds synthesised, no samples or third-party recordings.';

/**
 * Builds a complete .mid file as bytes.
 */
export function buildMidiFile({
  lanes,
  grid,
  bpm,
  resolution,
  bars,
  name = 'BeatBayashi',
  rightsText,
  presets,
  frequencies,
  accents,
  subGrid,
  subPresets,
  swing = 0,
  copyright = DEFAULT_COPYRIGHT,
}: MidiExportOptions): Uint8Array {
  const totalSteps = bars * resolution;
  // A quarter note spans resolution/4 steps, so one step is this many ticks.
  const ticksPerStep = Math.max(1, Math.round((TICKS_PER_QUARTER * 4) / resolution));
  // Hits are short: a drum note's length does not affect how it sounds, but a
  // sensible gate makes the notes visible as blocks in a DAW's piano roll.
  const gateTicks = Math.max(1, Math.floor(ticksPerStep * 0.5));
  // Classic swing: every other step's note-on lands a little late.
  const swingTicks = Math.round((swing / 100) * ticksPerStep);

  // ---- Track 0: tempo map -------------------------------------------------
  const microsecondsPerQuarter = Math.round(60_000_000 / bpm);
  const tempoTrack: number[] = [
    ...(copyright
      ? [
          ...variableLengthQuantity(0),
          0xff,
          0x02,
          ...variableLengthQuantity(text(copyright).length),
          ...text(copyright),
        ]
      : []),
    ...variableLengthQuantity(0),
    0xff,
    0x51,
    0x03,
    (microsecondsPerQuarter >>> 16) & 0xff,
    (microsecondsPerQuarter >>> 8) & 0xff,
    microsecondsPerQuarter & 0xff,
    // 4/4 time signature: numerator 4, denominator 2^2, 24 clocks, 8 32nds
    ...variableLengthQuantity(0),
    0xff,
    0x58,
    0x04,
    0x04,
    0x02,
    0x18,
    0x08,
    ...variableLengthQuantity(0),
    0xff,
    0x2f,
    0x00, // end of track
  ];

  // ---- Track 1: the drums -------------------------------------------------
  const events: MidiEvent[] = [];

  grid.forEach((lane, laneIndex) => {
    const laneInfo = lanes[laneIndex];
    if (laneInfo === undefined) return;
    const note = laneNote(laneInfo.category, presets?.[laneInfo.id], frequencies?.[laneInfo.id]);

    const writeRow = (row: boolean[], rowNote: number) => {
      for (let step = 0; step < Math.min(totalSteps, row.length); step++) {
        if (!row[step]) continue;

        const onTick = step * ticksPerStep + (step % 2 === 1 ? swingTicks : 0);
        const accent = accents?.[laneIndex]?.[step] ?? DEFAULT_ACCENT;
        // 0x99 = note-on, channel 10 (zero-indexed 9).
        events.push({ tick: onTick, order: 1, bytes: [0x99, rowNote, ACCENT_MIDI_VELOCITY[accent]] });
        events.push({ tick: onTick + gateTicks, order: 0, bytes: [0x89, rowNote, 0] });
      }
    };
    writeRow(lane, note);

    const used = [note];
    (subPresets?.[laneInfo.id] ?? []).forEach((subPreset, subIdx) => {
      const row = subGrid?.[laneIndex]?.[subIdx];
      if (!row) return;
      let subNote = laneNote(laneInfo.category, subPreset, undefined);
      if (used.includes(subNote)) {
        subNote =
          SUB_FALLBACK_NOTES[laneInfo.category].find((n) => !used.includes(n)) ?? subNote;
      }
      used.push(subNote);
      writeRow(row, subNote);
    });
  });

  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const drumTrack: number[] = [
    // Track name meta event
    ...variableLengthQuantity(0),
    0xff,
    0x03,
    ...variableLengthQuantity(text(name).length),
    ...text(name),
    ...(rightsText
      ? [
          ...variableLengthQuantity(0),
          0xff,
          0x01,
          ...variableLengthQuantity(text(rightsText).length),
          ...text(rightsText),
        ]
      : []),
  ];

  let previousTick = 0;
  for (const event of events) {
    drumTrack.push(...variableLengthQuantity(event.tick - previousTick));
    drumTrack.push(...event.bytes);
    previousTick = event.tick;
  }

  // Let the loop breathe to the end of the last bar before the file stops.
  const endTick = totalSteps * ticksPerStep;
  drumTrack.push(
    ...variableLengthQuantity(Math.max(0, endTick - previousTick)),
    0xff,
    0x2f,
    0x00
  );

  // ---- Assemble -----------------------------------------------------------
  const header = chunk('MThd', [
    ...uint16(1), // format 1
    ...uint16(2), // two tracks
    ...uint16(TICKS_PER_QUARTER),
  ]);

  return Uint8Array.from([
    ...header,
    ...chunk('MTrk', tempoTrack),
    ...chunk('MTrk', drumTrack),
  ]);
}

/** Triggers a browser download of the pattern as a .mid file. */
export function downloadMidi(options: MidiExportOptions, filename: string): void {
  const bytes = buildMidiFile(options);
  // buildMidiFile allocates its own Uint8Array, so the backing buffer is never a SharedArrayBuffer.
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
