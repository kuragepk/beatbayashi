#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Verifies that every relative link between this project's Markdown files
// points at something that exists.
//
//   node scripts/check-doc-links.mjs
//
// The project's own policy lists documents it promises to keep. Four of them
// were linked from that list for three weeks without ever being written, and
// nothing noticed. A promise you cannot follow is worse than no promise, so
// the links are checked now instead of trusted.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.expo']);
// publish/overlay holds files written for the public copy, where the paths are
// different (docs/PUBLIC_MIRROR.md). scripts/build-public-tree.mjs checks their
// links in the tree it builds.
const SKIP_PATHS = new Set(['publish/overlay']);

function markdownFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (SKIP_PATHS.has(relative(repoRoot, full).split(sep).join('/'))) continue;
    if (statSync(full).isDirectory()) found.push(...markdownFiles(full));
    else if (entry.endsWith('.md')) found.push(full);
  }
  return found;
}

// [text](target) — inline links only; reference-style links are not used here.
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

// Strip inline code (`...`) and fenced code blocks (```...```) before scanning,
// so that shell commands like `grep -Ei '[.](wav|mp3)$'` are not mistaken for links.
function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
}

const broken = [];

for (const file of markdownFiles(repoRoot)) {
  const body = stripCode(readFileSync(file, 'utf8'));
  for (const [, target] of body.matchAll(LINK)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue; // external or in-page
    const path = decodeURIComponent(target.split('#')[0]);
    if (!path) continue;
    const resolved = resolve(dirname(file), path);
    if (!existsSync(resolved)) {
      broken.push(`${relative(repoRoot, file)} → ${target}`);
    }
  }
}

if (broken.length > 0) {
  console.error(`Broken links in the documentation (${broken.length}):\n`);
  for (const entry of broken) console.error(`  ${entry}`);
  console.error('\nEither write the file or stop linking to it.');
  process.exit(1);
}

console.log('ok       every relative link in the documentation resolves');

// standard-stamp: src=templates/cloud-claude-md/check-doc-links.mjs src-sha256=41d117afd77c self-sha256=41d117afd77c stamped=2026-09-15T21:41:15Z
