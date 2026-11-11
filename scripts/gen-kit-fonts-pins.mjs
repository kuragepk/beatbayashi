#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

/**
 * Regenerates scripts/kit-fonts.pinned.json from the desk's
 * templates/ui-system/fonts/manifest.json. Desk-only maintenance step (needs
 * the desk checkout); the build itself only reads the committed pin list.
 *
 *   node scripts/gen-kit-fonts-pins.mjs <path-to-manifest.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('usage: node scripts/gen-kit-fonts-pins.mjs <manifest.json>');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const pins = manifest.families.map((f) => {
  const url = f.source.origin;
  const pin = { family: f.id, file: f.file, sha256: f.sha256, url };
  if (/\.zip$/i.test(new URL(url).pathname)) pin.archiveMember = path.posix.basename(f.file);
  return pin;
});
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'kit-fonts.pinned.json');
writeFileSync(
  out,
  JSON.stringify(
    {
      $comment:
        'Pinned font list for src/theme/kit/fonts/. Source: templates/ui-system/fonts/manifest.json (owner decision 2026-10-02). A font is used only if its sha256 matches. archiveMember: the URL is a zip; the member with that basename is extracted.',
      generated: '2026-10-02',
      pins,
    },
    null,
    2,
  ) + '\n',
);
console.log(`wrote ${pins.length} pins to ${out}`);
