#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// There is no existing logo asset in this repo to derive PWA icons from
// (see docs/HANDOVER.md, ISSUE-BEATBOX-PWA-001), so this script draws a
// small placeholder icon procedurally: the app's background colour
// (#0a0a0a) with a 4x4 grid of squares in the app's teal accent
// (#0f8a80), echoing the step-sequencer grid that is the app's UI. It
// writes raw PNG bytes with only Node's built-in zlib module — no image
// library, no new dependency. Run it again after the real logo exists to
// replace these placeholders.
//
//   node scripts/generate-pwa-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appRoot } from './lib/app-root.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(appRoot(repoRoot), 'public/icons');

const BG = [0x0a, 0x0a, 0x0a, 0xff]; // #0a0a0a, matches index.html body background
const FG = [0x0f, 0x8a, 0x80, 0xff]; // #0f8a80, matches the app's teal accent (App.tsx, ControlPanel.tsx)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** 4x4 grid of squares, checkerboard-active, teal on dark. */
function pixelAt(x, y, size) {
  const margin = Math.round(size * 0.12);
  const gridSize = size - margin * 2;
  if (x < margin || y < margin || x >= margin + gridSize || y >= margin + gridSize) return BG;
  const cell = Math.floor(gridSize / 4);
  const gx = Math.min(3, Math.floor((x - margin) / cell));
  const gy = Math.min(3, Math.floor((y - margin) / cell));
  const gap = Math.max(1, Math.round(cell * 0.12));
  const withinCol = (x - margin) % cell;
  const withinRow = (y - margin) % cell;
  const onGap = withinCol < gap || withinRow < gap;
  const active = (gx + gy) % 2 === 0;
  if (onGap) return BG;
  return active ? FG : BG;
}

function buildPng(size) {
  const rowBytes = size * 4;
  const raw = Buffer.alloc((rowBytes + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // filter type 0 (none)
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y, size);
      const px = rowStart + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const path = join(outDir, `icon-${size}.png`);
  writeFileSync(path, buildPng(size));
  console.log(`wrote ${path}`);
}
