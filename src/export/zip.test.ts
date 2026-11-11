// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
import { describe, it, expect } from 'vitest';
import { createZip, crc32 } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

describe('crc32', () => {
  it('matches the known value for "123456789"', () => {
    // The standard CRC-32 check value. If this drifts, every archive this
    // writes is rejected by every unzip tool, silently.
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for nothing', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('createZip', () => {
  it('starts with a local file header and ends with the central directory', () => {
    const zip = createZip([{ path: 'a.txt', bytes: bytes('hello') }]);
    const v = view(zip);

    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50);
  });

  it('records every entry once in the directory', () => {
    const zip = createZip([
      { path: 'instrument.sfz', bytes: bytes('<region>') },
      { path: 'samples/kick.wav', bytes: bytes('RIFF....') },
    ]);
    const v = view(zip);

    expect(v.getUint16(zip.length - 14, true)).toBe(2); // entries on this disk
    expect(v.getUint16(zip.length - 12, true)).toBe(2); // entries in total
  });

  it('stores the content verbatim, so an unzip returns exactly what went in', () => {
    const content = bytes('hello');
    const zip = createZip([{ path: 'a.txt', bytes: content }]);
    const start = 30 + 'a.txt'.length;

    expect(zip.slice(start, start + content.length)).toEqual(content);
    expect(view(zip).getUint16(8, true)).toBe(0); // 0 = stored, not deflated
  });

  it('writes the same size in both size fields and a matching CRC', () => {
    const content = bytes('hello');
    const zip = createZip([{ path: 'a.txt', bytes: content }]);
    const v = view(zip);

    expect(v.getUint32(14, true)).toBe(crc32(content));
    expect(v.getUint32(18, true)).toBe(content.length);
    expect(v.getUint32(22, true)).toBe(content.length);
  });

  it('points the directory entry at the local header it describes', () => {
    const first = { path: 'a.txt', bytes: bytes('one') };
    const zip = createZip([first, { path: 'b.txt', bytes: bytes('two') }]);
    const firstLength = 30 + first.path.length + first.bytes.length;
    const directoryStart = view(zip).getUint32(zip.length - 6, true);

    // Second directory entry: 46 bytes of header + the first entry's name.
    const secondEntry = directoryStart + 46 + first.path.length;
    expect(view(zip).getUint32(secondEntry + 42, true)).toBe(firstLength);
  });

  it('makes an empty archive rather than failing on no entries', () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22);
    expect(view(zip).getUint16(8, true)).toBe(0);
  });
});
