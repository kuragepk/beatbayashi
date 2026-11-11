#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

/**
 * Fails if a colour literal (hex) shows up in src/ outside of:
 *   - the theme tokens/kit files (src/theme/kit/**, src/theme/theme-bridge.css),
 *     which are allowed to define the actual colour values a theme uses
 *   - a `var(--app-<role>, #hex)` fallback -- the frozen default look, kept
 *     so switching themes changes something instead of nothing (owner
 *     decisions #70-71, 2026-09-27)
 *   - a line/lines marked `ui-color-check-ignore` (a fixed, non-themeable
 *     colour that encodes information rather than app chrome: a national
 *     flag in FlagIcons.tsx, a genre-family colour, a colour-picker's own
 *     required literal value)
 *   - test files (*.test.ts(x)), which assert against literal values
 *
 * Modelled after projects/recensio's scripts/check-ui-colors.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '..', 'src');

const EXCLUDED_DIRS = [path.join(SRC_DIR, 'theme', 'kit')];
const EXCLUDED_FILES = [
  path.join(SRC_DIR, 'theme', 'theme-bridge.css'),
  path.join(SRC_DIR, 'components', 'FlagIcons.tsx'),
];

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
// A hex literal is allowed when it is the fallback of a var(--app-*, ...) call.
// Token names may carry a ramp step number (--app-blue-4, 2026-10-06).
const ALLOWED_CONTEXT_RE = /var\(--app-[a-z0-9-]+,\s*$/;

function isExcluded(file) {
  if (EXCLUDED_FILES.includes(file)) return true;
  if (EXCLUDED_DIRS.some((dir) => file.startsWith(dir + path.sep))) return true;
  if (/\.test\.[tj]sx?$/.test(file)) return true;
  return false;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function checkFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);
  const problems = [];

  lines.forEach((line, idx) => {
    if (line.includes('ui-color-check-ignore')) return;
    // A `// ...` comment-only line (or trailing comment) does not restyle
    // anything at runtime; only check the code portion. This is a light
    // heuristic (it does not parse JS/TS), matching recensio's script.
    const codePart = line.split('//')[0];

    let match;
    HEX_RE.lastIndex = 0;
    while ((match = HEX_RE.exec(codePart))) {
      const before = codePart.slice(0, match.index);
      if (ALLOWED_CONTEXT_RE.test(before)) continue;
      problems.push({ line: idx + 1, hex: match[0], text: line.trim() });
    }
  });

  return problems;
}

function main() {
  const files = walk(SRC_DIR).filter((f) => !isExcluded(f));
  let total = 0;
  for (const file of files) {
    const problems = checkFile(file);
    for (const p of problems) {
      total++;
      console.error(
        `${path.relative(process.cwd(), file)}:${p.line}: colour literal ${p.hex} outside var(--app-*, ...)\n  ${p.text}`
      );
    }
  }

  if (total > 0) {
    console.error(
      `\n${total} colour literal(s) found outside tokens/themes/bridge fallbacks. ` +
        `Wrap them as var(--app-<role>, <same hex>) (see src/theme/theme-bridge.css), ` +
        `or mark the line with a ui-color-check-ignore comment if it is a fixed, ` +
        `non-themeable colour (a data category, not app chrome).`
    );
    process.exit(1);
  }

  console.log(`check-ui-colors: ${files.length} files checked, no bare colour literals.`);
}

main();
