// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
import { describe, it, expect } from 'vitest';
import { encodeWav } from './wav';

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.slice(at, at + length));

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

describe('encodeWav', () => {
  it('writes a RIFF/WAVE header a sampler will accept', () => {
    const bytes = encodeWav({ sampleRate: 44100, channels: [new Float32Array(4)] });
    const v = view(bytes);

    expect(ascii(bytes, 0, 4)).toBe('RIFF');
    expect(ascii(bytes, 8, 4)).toBe('WAVE');
    expect(ascii(bytes, 12, 4)).toBe('fmt ');
    expect(ascii(bytes, 36, 4)).toBe('data');
    expect(v.getUint16(20, true)).toBe(1);      // uncompressed PCM
    expect(v.getUint16(34, true)).toBe(16);     // bits per sample
    expect(v.getUint32(24, true)).toBe(44100);  // sample rate
  });

  it('declares sizes that match the bytes it actually wrote', () => {
    const bytes = encodeWav({ sampleRate: 48000, channels: [new Float32Array(10)] });
    const v = view(bytes);

    expect(bytes.length).toBe(44 + 10 * 2);
    expect(v.getUint32(4, true)).toBe(bytes.length - 8);
    expect(v.getUint32(40, true)).toBe(10 * 2);
  });

  it('interleaves stereo frames, left then right', () => {
    const left = Float32Array.from([1, 0]);
    const right = Float32Array.from([0, -1]);
    const bytes = encodeWav({ sampleRate: 44100, channels: [left, right] });
    const v = view(bytes);

    expect(v.getUint16(22, true)).toBe(2);   // channel count
    expect(v.getUint16(32, true)).toBe(4);   // block align
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(0);
    expect(v.getInt16(48, true)).toBe(0);
    expect(v.getInt16(50, true)).toBe(-32768);
  });

  it('clamps instead of wrapping, so a hot sample does not click', () => {
    const bytes = encodeWav({ sampleRate: 44100, channels: [Float32Array.from([2, -2])] });
    const v = view(bytes);

    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
  });

  it('refuses input it cannot write correctly', () => {
    expect(() => encodeWav({ sampleRate: 44100, channels: [] })).toThrow();
    expect(() =>
      encodeWav({ sampleRate: 44100, channels: [new Float32Array(2), new Float32Array(3)] })
    ).toThrow(/length/);
  });
});

describe('encodeWav — provenance metadata (LIST/INFO)', () => {
  it('omits the LIST chunk when no metadata is given (unchanged from before)', () => {
    const bytes = encodeWav({ sampleRate: 44100, channels: [new Float32Array(4)] });
    expect(ascii(bytes, 36, 4)).toBe('data');
    expect(bytes.length).toBe(44 + 4 * 2);
  });

  it('writes a valid LIST/INFO chunk with ISFT and ICMT, and the data chunk after it', () => {
    const bytes = encodeWav({
      sampleRate: 44100,
      channels: [new Float32Array(2)],
      metadata: { software: 'BeatBayashi', comment: 'synthesised, not sampled' },
    });
    const v = view(bytes);

    expect(ascii(bytes, 36, 4)).toBe('LIST');
    const listBodyLength = v.getUint32(40, true);
    expect(ascii(bytes, 44, 4)).toBe('INFO');

    // Walk the INFO subchunks and collect id -> text.
    const tags: Record<string, string> = {};
    let pos = 48; // past 'LIST' + length + 'INFO'
    const listEnd = 44 + listBodyLength;
    while (pos < listEnd) {
      const id = ascii(bytes, pos, 4);
      const len = v.getUint32(pos + 4, true);
      const raw = ascii(bytes, pos + 8, len - 1); // drop NUL terminator
      tags[id] = raw;
      const padded = len % 2 === 0 ? len : len + 1;
      pos += 8 + padded;
    }
    expect(tags.ISFT).toBe('BeatBayashi');
    expect(tags.ICMT).toBe('synthesised, not sampled');

    // The data chunk (and its declared size) sits right after LIST, and the
    // RIFF size field still accounts for everything correctly.
    const dataOffset = 36 + 8 + listBodyLength;
    expect(ascii(bytes, dataOffset, 4)).toBe('data');
    expect(v.getUint32(dataOffset + 4, true)).toBe(4); // 2 samples * 2 bytes
    expect(v.getUint32(4, true)).toBe(bytes.length - 8);
    expect(bytes.length).toBe(dataOffset + 8 + 4);
  });

  it('pads odd-length INFO text to keep the file byte-aligned', () => {
    // 3-char value -> NUL-terminated text is 4 bytes (even), no pad needed;
    // a 2-char value -> 3 bytes (odd) needs one pad byte. Either way the
    // chunk must still parse and the trailing data chunk must be reachable.
    const bytes = encodeWav({
      sampleRate: 44100,
      channels: [new Float32Array(1)],
      metadata: { software: 'ab' },
    });
    const v = view(bytes);
    const listBodyLength = v.getUint32(40, true);
    expect(listBodyLength % 2).toBe(0); // INFO (4) + subchunk header (8) + padded text
    const dataOffset = 36 + 8 + listBodyLength;
    expect(ascii(bytes, dataOffset, 4)).toBe('data');
  });
});
