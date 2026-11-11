// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Owner request 2026-10-03: the UI shows pixel icons (src/components/PixelIcon.tsx)
// instead of emoji and symbol glyphs. This scans every .tsx file under src for
// emoji / pictograph / arrow / geometric-shape code points so a glyph does not
// creep back in. Comment lines are skipped (they do not render). If one ever has
// to stay, add it to ALLOWED with the file, the character and the reason.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.dirname(fileURLToPath(import.meta.url));

// Arrows, misc technical (media keys), enclosed / geometric shapes, misc symbols,
// dingbats (check, cross, gear, warning), supplemental arrows, misc symbols and
// arrows, all emoji planes, minus sign, fullwidth plus; plus variation selector 16
// (U+FE0F, checked on its own: inside a character class it trips no-misleading-character-class).
const GLYPH =
  /[\u2190-\u21FF\u2300-\u23FF\u2460-\u24FF\u25A0-\u27BF\u2900-\u297F\u2B00-\u2BFF\u2212\uFF0B\u{1F000}-\u{1FAFF}]/u;

const ALLOWED: { file: string; char: string; reason: string }[] = [];

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) tsxFiles(full, out);
    else if (e.name.endsWith('.tsx') && !/\.test\.tsx$/.test(e.name)) out.push(full);
  }
  return out;
}

const isComment = (line: string) => /^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(line);

describe('no emoji or symbol glyphs in UI source', () => {
  it('finds the .tsx files it is meant to scan', () => {
    expect(tsxFiles(SRC).length).toBeGreaterThan(10);
  });

  it('has none outside comments and the allow list', () => {
    const hits: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const rel = path.relative(SRC, file).replace(/\\/g, '/');
      fs.readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (isComment(line)) return;
          for (const ch of line) {
            if (!GLYPH.test(ch) && ch !== '\uFE0F') continue;
            if (ALLOWED.some((a) => a.file === rel && a.char === ch)) continue;
            hits.push(`${rel}:${i + 1} U+${ch.codePointAt(0)!.toString(16).toUpperCase()} ${line.trim()}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
