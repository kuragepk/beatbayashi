#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Covers scripts/cli-export.mjs against a fixed pattern: the bytes it writes
// must be identical to calling beatbayashi/src/export/midi.ts's
// buildMidiFile() directly (the library the app's own "Export as MIDI"
// button uses via ExportPanel.tsx), and must not drift run to run - both
// checked with a golden sha256 so any change to either path is visible in a
// diff, not just "still runs".
//
//   node --test scripts/cli-export.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { appRoot } from './lib/app-root.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const webApp = appRoot(repoRoot);
const cliExport = join(repoRoot, 'scripts', 'cli-export.mjs');

// One fixed pattern, deliberately not the empty/all-false case (P2-17 grid
// shape: one lane per voice, kick/tom/cymbal/clap in that order).
// grid is a boolean[][], one lane per voice (kick/tom/cymbal/clap, P2-17).
const GOLDEN_GRID = [
  [true, false, true, false],
  [false, true, false, false],
  [false, false, false, true],
  [true, false, false, false],
];

// docs/API-CONTRACT.md: `grid` is stored as a JSON string, not an array
// (that is how the Spring service's TEXT column round-trips it, and what
// cli-export.mjs's decodeGrid() expects on the wire).
const GOLDEN_PATTERN = {
  id: 'golden-1',
  name: 'Golden Pattern',
  bpm: 120,
  bars: 1,
  resolution: 4,
  grid: JSON.stringify(GOLDEN_GRID),
};

// Locked in by an actual run of the CLI against GOLDEN_PATTERN
// (scripts/cli-export.mjs); a change to either the CLI's own grid decoding
// or to midi.ts's byte layout will change this hash.
const GOLDEN_SHA256 = 'd3d9cce23ef2ca032b7da6d17b21b8eaa113b8e828c386414a449688cf22b13c';

async function loadBuildMidiFile() {
  // esbuild comes with vite; resolve it from there (pnpm does not hoist it).
  const appRequire = createRequire(join(webApp, 'package.json'));
  const require = createRequire(appRequire.resolve('vite/package.json'));
  const esbuild = require('esbuild');
  const entry = join(webApp, 'src/export/midi.ts');
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
  });
  const outDir = await mkdtemp(join(tmpdir(), 'bb-cli-export-test-'));
  const outFile = join(outDir, 'midi.mjs');
  await writeFile(outFile, result.outputFiles[0].text);
  try {
    return await import(pathToFileURL(outFile).href);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('cli-export.mjs (MIDI)', () => {
  it('writes bytes byte-identical to buildMidiFile() called directly, and to the golden hash', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bb-cli-export-fixture-'));
    try {
      const patternPath = join(dir, 'pattern.json');
      const outPath = join(dir, 'out.mid');
      await writeFile(patternPath, JSON.stringify(GOLDEN_PATTERN));

      execFileSync(process.execPath, [cliExport, patternPath, '-o', outPath]);
      const cliBytes = await readFile(outPath);

      const { buildMidiFile } = await loadBuildMidiFile();
      const lanes = ['kick', 'tom', 'cymbal', 'clap'].map((id) => ({
        id,
        category: id,
        label: id,
        muted: false,
        solo: false,
      }));
      const libraryBytes = buildMidiFile({
        lanes,
        grid: GOLDEN_GRID,
        bpm: GOLDEN_PATTERN.bpm,
        resolution: GOLDEN_PATTERN.resolution,
        bars: GOLDEN_PATTERN.bars,
        name: GOLDEN_PATTERN.name,
      });

      assert.equal(sha256(cliBytes), sha256(Buffer.from(libraryBytes)));
      assert.equal(sha256(cliBytes), GOLDEN_SHA256);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('is stable across repeated runs (no timestamp/randomness in the bytes)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bb-cli-export-repeat-'));
    try {
      const patternPath = join(dir, 'pattern.json');
      await writeFile(patternPath, JSON.stringify(GOLDEN_PATTERN));

      const hashes = [];
      for (let i = 0; i < 2; i++) {
        const outPath = join(dir, `out-${i}.mid`);
        execFileSync(process.execPath, [cliExport, patternPath, '-o', outPath]);
        hashes.push(sha256(await readFile(outPath)));
      }

      assert.equal(hashes[0], hashes[1]);
      assert.equal(hashes[0], GOLDEN_SHA256);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
