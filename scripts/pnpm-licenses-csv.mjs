// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Turns `pnpm licenses list --prod --json` into the CSV that license-checker
// used to write (columns "module name","license","repository"), and fails when
// a production dependency carries one of the --fail-on licences.
//
// license-checker walks nested node_modules folders the way npm lays them out;
// pnpm keeps transitive packages beside each other under node_modules/.pnpm,
// so it would miss most of them. pnpm itself knows the full production tree.
//
//   cd beatbayashi
//   pnpm licenses list --prod --json > licenses.json
//   node ../scripts/pnpm-licenses-csv.mjs licenses.json --out ../docs/dependency-licenses.csv \
//     --fail-on "GPL-3.0;AGPL-3.0"
//
// Exit: 0 clean, 1 a --fail-on licence was found, 2 usage or input error.

import { readFileSync, writeFileSync } from 'node:fs';

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: node scripts/pnpm-licenses-csv.mjs <licenses.json> [--out <file.csv>] [--fail-on "A;B"]');
  process.exit(2);
}

const args = process.argv.slice(2);
let input;
let out;
let failOn = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') out = args[++i];
  else if (a === '--fail-on') failOn = (args[++i] ?? '').split(';').map((s) => s.trim()).filter(Boolean);
  else if (!input) input = a;
  else usage(`unexpected argument ${a}`);
}
if (!input) usage();

let data;
try {
  data = JSON.parse(readFileSync(input, 'utf8').replace(/^\uFEFF/, ''));
} catch (e) {
  usage(`could not read ${input}: ${e.message}`);
}

// Same splitting as scripts/check-audio-license.js: "(MIT OR Apache-2.0)" -> parts.
const partsOf = (licence) =>
  String(licence ?? '')
    .replace(/[()]/g, '')
    .split(/\s+(?:OR|AND)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

const quote = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const rows = [];
const bad = [];
for (const [group, pkgs] of Object.entries(data)) {
  for (const p of pkgs) {
    const licence = p.license ?? group;
    const versions = p.versions?.length ? p.versions : [p.version];
    for (const v of versions) {
      const id = v ? `${p.name}@${v}` : p.name;
      rows.push([id, licence, p.homepage ?? '']);
      if (partsOf(licence).some((part) => failOn.includes(part))) bad.push(`${id}: ${licence}`);
    }
  }
}
rows.sort((a, b) => a[0].localeCompare(b[0]));

const csv = [['module name', 'license', 'repository'], ...rows].map((r) => r.map(quote).join(',')).join('\n') + '\n';
if (out) writeFileSync(out, csv);
else process.stdout.write(csv);

console.error(`${rows.length} production packages listed.`);
if (bad.length) {
  console.error('Disallowed licences in production dependencies:');
  for (const b of bad) console.error(`  ${b}`);
  process.exit(1);
}
