// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// A ZIP file, stored (uncompressed), written by hand.
//
// An SFZ instrument is a folder: one text file plus the samples it names. To
// hand that over as one download it has to be zipped, and pulling in a zip
// library for a format this small would add a dependency whose licence someone
// then has to check. Audio is already compressed-ish and these files are tiny,
// so "stored" is fine and the whole writer fits on one screen.

export interface ZipEntry {
  /** Path inside the archive, forward slashes. */
  path: string;
  bytes: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

export function createZip(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new Uint8Array(30 + name.length + size);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); // local file header
    localView.setUint16(4, 20, true);         // version needed
    localView.setUint16(6, 0, true);          // flags
    localView.setUint16(8, 0, true);          // 0 = stored
    localView.setUint16(10, 0, true);         // modification time
    localView.setUint16(12, 0x21, true);      // modification date (1980-01-01)
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);      // compressed size
    localView.setUint32(22, size, true);      // uncompressed size
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);         // extra field length
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); // central directory header
    centralView.setUint16(4, 20, true);         // version made by
    centralView.setUint16(6, 20, true);         // version needed
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x21, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);         // extra
    centralView.setUint16(32, 0, true);         // comment
    centralView.setUint16(34, 0, true);         // disk number
    centralView.setUint16(36, 0, true);         // internal attributes
    centralView.setUint32(38, 0, true);         // external attributes
    centralView.setUint32(42, offset, true);    // offset of local header
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); // end of central directory
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const total = offset + centralSize + end.length;
  const zip = new Uint8Array(total);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    zip.set(part, at);
    at += part.length;
  }
  return zip;
}
