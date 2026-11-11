// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Owner decision 2026-10-03: this folder moves to Portus as its own package
// after the 2026-10-16 release. It must therefore stand alone: no file in it
// may import from outside the folder (relative paths that climb out, or app
// aliases), and the only package it may use at runtime is React. Tests may also
// use vitest, @testing-library/react and node: built-ins.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_PACKAGES = new Set(['react', 'react/jsx-runtime']);
const TEST_PACKAGES = new Set(['vitest', '@testing-library/react']);

function codeFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    // source/ holds the desk-side generator scripts (records, not shipped code).
    if (e.isDirectory()) {
      if (e.name !== 'source') codeFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const SPEC = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

describe('pixel-icons folder is self-contained', () => {
  it('finds its own files', () => {
    expect(codeFiles(HERE).map((f) => path.basename(f))).toEqual(
      expect.arrayContaining(['index.ts', 'PixelIcon.tsx', 'pixelIconData.ts']),
    );
  });

  it('imports nothing from outside the folder', () => {
    const bad: string[] = [];
    for (const file of codeFiles(HERE)) {
      const isTest = /\.test\.tsx?$/.test(file);
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(SPEC)) {
        const spec = m[1] ?? m[2] ?? m[3];
        const rel = path.relative(HERE, file).replace(/\\/g, '/');
        if (spec.startsWith('.')) {
          const target = path.resolve(path.dirname(file), spec);
          if (path.relative(HERE, target).startsWith('..')) bad.push(`${rel}: ${spec}`);
        } else if (spec.startsWith('node:')) {
          if (!isTest) bad.push(`${rel}: ${spec} (node built-in outside a test)`);
        } else if (!RUNTIME_PACKAGES.has(spec) && !(isTest && TEST_PACKAGES.has(spec))) {
          bad.push(`${rel}: ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('sets no colour of its own (currentColor or a passed token only)', () => {
    for (const file of codeFiles(HERE).filter((f) => !/\.test\.tsx?$/.test(f))) {
      const code = fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      expect(code, path.basename(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    }
  });
});
