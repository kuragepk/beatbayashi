// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Guard (2026-10-07): the localStorage table in docs/PRIVACY.md must list every
// key the code uses, and every row must still be a key the code uses.
//
// Why: the table kept the pre-rename prefix `BeatBayashi-KoinonBayashi.*` for
// a day after the code moved to `BeatBayashi.*`, and it never had
// the `bb-ui-settings-v1.*` companions. PRIVACY.md promises that every line can
// be checked in the code, so the check is a test.
//
// How: scan src/**/*.ts(x) (tests excluded) for
//   1. localStorage.getItem/setItem/removeItem(<arg>) and the theme kit's
//      loadUiSettings/saveUiSettings/resetUiSettings(<arg>, ...), where <arg> is a
//      string literal, a template literal or a constant name;
//   2. constants named `*KEY` whose value sits under this app's own prefixes
//      (`BeatBayashi.` or `kb-`), so a key that is defined but whose
//      write is wired later still needs its row.
// Constants resolve within their own file (several files name theirs
// STORAGE_KEY), then through a unique definition elsewhere in src, then through
// EXTERNAL_KEYS. A template with a part that cannot be resolved becomes
// `<prefix>*`; the table then needs a row ending in `*` and matches by prefix.
// A call whose argument is none of the above fails the test instead of being
// skipped, so a new style of call cannot hide a key.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MASTER_DB_STORAGE_KEY } from '@otoinki/loudness';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..');
// The table is in the repository-root docs/ (the Japanese page); the page under
// beatbayashi/docs/ only lists the keys in prose. In the public copy the app is
// the repository root, so the table is at docs/ next to src/.
const IN_MAIN_REPO = fs.existsSync(path.resolve(HERE, '../../../beatbayashi/package.json'));
const PRIVACY = path.resolve(HERE, IN_MAIN_REPO ? '../../../docs/PRIVACY.md' : '../../docs/PRIVACY.md');

/** Keys whose name is defined in a package outside src/. */
const EXTERNAL_KEYS: Record<string, string> = {
  MASTER_DB_STORAGE_KEY,
};

const OWN_PREFIXES = ['BeatBayashi.', 'kb-'];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const CONST_RE = /(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*('([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`)/g;

/** name -> raw literal text (with quotes) for every top-level style constant in a file. */
function constants(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of text.matchAll(CONST_RE)) map.set(m[1], m[2]);
  return map;
}

const files = sourceFiles(SRC).map((file) => {
  const text = fs.readFileSync(file, 'utf8');
  return { file, rel: path.relative(SRC, file).split(path.sep).join('/'), text, consts: constants(text) };
});

/** Constant name -> set of distinct raw definitions across src (for imports). */
const globalDefs = new Map<string, Set<string>>();
for (const f of files) {
  for (const [name, raw] of f.consts) {
    if (!globalDefs.has(name)) globalDefs.set(name, new Set());
    globalDefs.get(name)!.add(raw);
  }
}

function unquote(raw: string): { value: string; template: boolean } {
  return { value: raw.slice(1, -1), template: raw.startsWith('`') };
}

/** Resolves a constant name to its key text; undefined when unknown or ambiguous. */
function resolveName(name: string, local: Map<string, string>, depth = 0): string | undefined {
  if (depth > 5) return undefined;
  if (name in EXTERNAL_KEYS) return EXTERNAL_KEYS[name];
  let raw = local.get(name);
  if (raw === undefined) {
    const defs = globalDefs.get(name);
    if (defs && defs.size === 1) raw = [...defs][0];
  }
  return raw === undefined ? undefined : resolveLiteral(raw, local, depth + 1);
}

/** Resolves a quoted/template literal; an unresolvable `${...}` ends the key with `*`. */
function resolveLiteral(raw: string, local: Map<string, string>, depth = 0): string {
  const { value, template } = unquote(raw);
  if (!template) return value;
  let out = '';
  let i = 0;
  while (i < value.length) {
    const open = value.indexOf('${', i);
    if (open < 0) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, open);
    const close = value.indexOf('}', open);
    const expr = value.slice(open + 2, close).trim();
    const resolved = /^[A-Za-z_][A-Za-z0-9_]*$/.test(expr) ? resolveName(expr, local, depth + 1) : undefined;
    if (resolved === undefined) return out + '*';
    out += resolved;
    i = close + 1;
  }
  return out;
}

const ARG = "(`[^`]*`|'[^']*'|\"[^\"]*\"|[A-Za-z_][A-Za-z0-9_]*)";
const DIRECT_CALL = /localStorage\.(?:getItem|setItem|removeItem)\(/g;
const DIRECT_ARG = new RegExp('localStorage\\.(?:getItem|setItem|removeItem)\\(\\s*' + ARG, 'g');
const KIT_ARG = new RegExp('\\b(?:loadUiSettings|saveUiSettings|resetUiSettings)\\(\\s*' + ARG, 'g');

function keysInCode(): { keys: Map<string, string>; unparsed: string[] } {
  const keys = new Map<string, string>(); // key -> first file seen
  const unparsed: string[] = [];
  for (const f of files) {
    const calls = [...f.text.matchAll(DIRECT_CALL)].length;
    const parsed = [...f.text.matchAll(DIRECT_ARG)];
    if (calls !== parsed.length) unparsed.push(`${f.rel}: ${calls - parsed.length} localStorage call(s) with an argument this test cannot read`);
    for (const m of [...parsed, ...f.text.matchAll(KIT_ARG)]) {
      const arg = m[1];
      const key = /^[`'"]/.test(arg) ? resolveLiteral(arg, f.consts) : resolveName(arg, f.consts);
      if (key === undefined) {
        unparsed.push(`${f.rel}: cannot resolve \`${arg}\``);
      } else if (!keys.has(key)) {
        keys.set(key, f.rel);
      }
    }
    for (const [name, raw] of f.consts) {
      if (!/KEY$/.test(name)) continue;
      const key = resolveLiteral(raw, f.consts);
      if (OWN_PREFIXES.some((p) => key.startsWith(p)) && !keys.has(key)) keys.set(key, f.rel);
    }
  }
  return { keys, unparsed };
}

/** Rows for keys that only a package outside src/ touches (the shared loudness
 *  package moves the old volume key once at start-up and deletes it). */
const ROWS_OUTSIDE_SRC = new Set(['grammateion.masterDb']);

function tableRows(): string[] {
  const text = fs.readFileSync(PRIVACY, 'utf8');
  const start = text.indexOf('\n## 1.');
  const end = text.indexOf('\n## 2.');
  expect(start, 'section "## 1." in docs/PRIVACY.md').toBeGreaterThan(-1);
  expect(end, 'section "## 2." in docs/PRIVACY.md').toBeGreaterThan(start);
  const rows: string[] = [];
  for (const line of text.slice(start, end).split('\n')) {
    const m = /^\|\s*`([^`]+)`\s*\|/.exec(line);
    if (m) rows.push(m[1]);
  }
  return rows;
}

function covers(rowKey: string, codeKey: string): boolean {
  if (rowKey.endsWith('*')) return codeKey.startsWith(rowKey.slice(0, -1));
  return rowKey === codeKey;
}

describe('docs/PRIVACY.md localStorage table matches the code', () => {
  const { keys, unparsed } = keysInCode();
  const rows = tableRows();

  it('reads every localStorage call in src (nothing skipped)', () => {
    expect(unparsed).toEqual([]);
  });

  it('finds the keys it is known to find (the scan itself works)', () => {
    for (const expected of [
      'BeatBayashi.sequencer',
      'BeatBayashi.drumSettings.v2',
      'bb-ui-settings-v1.on-style',
      'bb-ui-settings-v1.control-order',
      'grammarouban.masterDb',
    ]) {
      expect([...keys.keys()], `scan result`).toContain(expected);
    }
    expect(rows.length).toBeGreaterThan(5);
  });

  it('has a row for every key the code uses', () => {
    const missing = [...keys].filter(([key]) => !rows.some((r) => covers(r, key))).map(([key, file]) => `${key} (${file})`);
    expect(missing, 'keys in code with no row in docs/PRIVACY.md section 1').toEqual([]);
  });

  it('has no row for a key the code no longer uses', () => {
    const stale = rows
      .filter((r) => !ROWS_OUTSIDE_SRC.has(r))
      .filter((r) => ![...keys.keys()].some((k) => covers(r, k)));
    expect(stale, 'rows in docs/PRIVACY.md section 1 that no code uses').toEqual([]);
  });
});
