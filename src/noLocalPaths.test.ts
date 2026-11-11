// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Release guard (2026-10-03): no tracked text file in the repository may name a
// local Windows user profile, either as a drive path (C:/Users/<name>,
// C:\Users\<name>, file:///C:/Users/<name>) or in the Git Bash / WSL form
// (/c/Users/<name>, /mnt/c/Users/<name>). Scripts take paths as arguments or
// environment variables instead; docs use placeholders such as <local-dev-dir>.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: HERE, encoding: 'utf8' }).trim();

// A profile path only counts when a name segment follows "Users", so a bare
// pattern such as `C:/Users|C:\\Users` in a documented grep command, or a
// placeholder like `C:\\Users\\<user>`, does not match.
const SEP = String.raw`(?:\\{1,2}|/)`;
const NAME = String.raw`[A-Za-z0-9._-]+`;
const PATTERNS: Array<[string, RegExp]> = [
  ['windows-profile', new RegExp(String.raw`\b[A-Za-z]:` + SEP + 'Users' + SEP + NAME, 'i')],
  ['posix-drive-profile', new RegExp(String.raw`(?:^|[^A-Za-z0-9_])/(?:mnt/)?[a-z]/Users/` + NAME, 'im')],
];

// Each entry: repo-relative path and why it may contain a match. Keep empty
// unless a file truly has to carry one (none does today).
const ALLOW: ReadonlyArray<{ path: string; reason: string }> = [];

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

function isText(buf: Buffer): boolean {
  return !buf.subarray(0, 8000).includes(0);
}

describe('no local machine paths in the tree', () => {
  it('finds no Windows user-profile paths in tracked text files', () => {
    const allowed = new Set(ALLOW.map((a) => a.path));
    const hits: string[] = [];
    for (const rel of trackedFiles()) {
      if (allowed.has(rel)) continue;
      const full = path.join(ROOT, rel);
      let buf: Buffer;
      try {
        buf = fs.readFileSync(full);
      } catch {
        continue; // tracked but deleted in the working copy
      }
      if (!isText(buf)) continue;
      const lines = buf.toString('utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const [kind, re] of PATTERNS) if (re.test(line)) hits.push(`${rel}:${i + 1}: ${kind}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('matches the path shapes it is meant to catch', () => {
    const drive = 'C' + ':';
    const samples = [
      `${drive}/Users/someone/x`,
      `${drive}\\Users\\someone\\x`,
      `file:///${drive}/Users/someone/x`,
      // built from parts so this file does not match its own guard
      ['', 'c', 'Users', 'someone', 'x'].join('/'),
      ['', 'mnt', 'c', 'Users', 'someone', 'x'].join('/'),
    ];
    for (const s of samples) expect(PATTERNS.some(([, re]) => re.test(s)), s).toBe(true);
    for (const s of [`${drive}/Users|${drive}\\\\Users`, `${drive}\\\\Users\\\\<user>`, '/Users/', 'Users/someone']) {
      expect(PATTERNS.some(([, re]) => re.test(s)), s).toBe(false);
    }
  });

  it('keeps every allowlist entry tracked and explained', () => {
    const tracked = new Set(trackedFiles());
    for (const a of ALLOW) {
      expect(tracked.has(a.path), a.path).toBe(true);
      expect(a.reason.length, a.path).toBeGreaterThan(10);
    }
  });
});
