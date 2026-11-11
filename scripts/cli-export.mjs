#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Exports a saved pattern (the JSON shape used by patterns.json / the
// Spring API — see docs/API-CONTRACT.md) to a Standard MIDI File, from the
// command line, with no browser involved.
//
//   node scripts/cli-export.mjs patterns.json --output pattern.mid
//
// Reuses beatbayashi/src/export/midi.ts as-is (via esbuild, shipped with
// vite in the web app) rather than re-implementing the format twice.

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appRoot } from './lib/app-root.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const webApp = appRoot(repoRoot);

const HELP = `Usage: node scripts/cli-export.mjs <pattern.json> [options]

Reads a pattern (the shape saved to patterns.json / the Spring API — see
docs/API-CONTRACT.md) and writes it out as a Standard MIDI File.

Options:
  -o, --output <file>   Write the .mid file here (default: stdout)
  --pattern <id>        Pick one pattern by id, if the input is an array
  -h, --help            Show this help
`;

function parseArgs(argv) {
  const args = { input: undefined, output: undefined, patternId: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      args.help = true;
    } else if (arg === '-o' || arg === '--output') {
      args.output = argv[++i];
    } else if (arg === '--pattern') {
      args.patternId = argv[++i];
    } else if (!args.input) {
      args.input = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

// Mirrors beatbayashi-mobile/gridCodec.js's parseGrid: a grid is either
// one lane per voice, or (older patterns) a single flat lane -> kick.
function decodeGrid(raw, total) {
  const blank = () => ['kick', 'tom', 'cymbal', 'clap'].map(() => Array(total).fill(false));
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return blank();
  }
  if (!Array.isArray(value)) return blank();
  if (value.every((lane) => Array.isArray(lane))) {
    const grid = blank();
    value.slice(0, 4).forEach((lane, voice) => {
      if (lane.length !== total) return;
      grid[voice] = lane.map(Boolean);
    });
    return grid;
  }
  if (value.length === total) {
    const grid = blank();
    grid[0] = value.map(Boolean);
    return grid;
  }
  return blank();
}

// buildMidiFile has no browser dependency (only downloadMidi does, which we
// never call), so it runs under Node once transpiled via esbuild.
async function loadBuildMidiFile() {
  // esbuild is not a direct dependency of the web app; it comes with vite.
  // pnpm does not hoist it to beatbayashi/node_modules, so resolve it from
  // vite's own location (works with npm's flat layout too).
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
  const outDir = await mkdtemp(join(tmpdir(), 'bb-cli-export-'));
  const outFile = join(outDir, 'midi.mjs');
  await writeFile(outFile, result.outputFiles[0].text);
  try {
    return await import(pathToFileURL(outFile).href);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    process.stdout.write(HELP);
    process.exit(args.help ? 0 : 1);
  }

  const raw = await readFile(resolve(args.input), 'utf8');
  const parsed = JSON.parse(raw);
  const patterns = Array.isArray(parsed) ? parsed : [parsed];
  const pattern = args.patternId
    ? patterns.find((p) => p.id === args.patternId)
    : patterns[0];
  if (!pattern) {
    throw new Error(
      args.patternId ? `No pattern with id "${args.patternId}"` : 'No pattern found in input file'
    );
  }

  const { bpm, bars, resolution, name } = pattern;
  const total = bars * resolution;
  const grid = decodeGrid(pattern.grid, total);
  const lanes = ['kick', 'tom', 'cymbal', 'clap'].map((id) => ({
    id,
    category: id,
    label: id,
    muted: false,
    solo: false,
  }));

  const { buildMidiFile } = await loadBuildMidiFile();
  const bytes = buildMidiFile({ lanes, grid, bpm, resolution, bars, name });

  if (args.output) {
    await writeFile(args.output, bytes);
  } else {
    process.stdout.write(bytes);
  }
}

main().catch((error) => {
  console.error(`cli-export: ${error.message}`);
  process.exit(1);
});
