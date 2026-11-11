#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Validates docs/dependency-licenses.csv: every row (across all three
// scopes - web, mobile, backend) must carry a license we consider safe to
// ship/build with (MIT/Apache-2.0/BSD-family/0BSD/etc). This does not
// require node_modules or a Maven build to be present - it checks the
// checked-in ledger itself, so it can run in any CI job as a fast gate.
//
// It intentionally does NOT re-derive the ledger from node_modules or
// pom.xml; that is done separately (guard.yml's "licenses" job for web via
// license-checker, and manually for mobile/backend - see
// docs/PROVENANCE.md for what is and is not verified). This script only
// answers: "does everything already in the ledger declare an allowed
// license?".
//
// Run: node scripts/check-audio-license.js

const fs = require('fs');
const path = require('path');

const ALLOWED_LICENSE_RE =
  /^(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|ISC|0BSD|CC0-1\.0|Unlicense|Python-2\.0|Zlib|WTFPL|MIT-0)$/i;

// The project's own package.json legitimately has no "license" resolved by
// license-checker in some environments; it is not a third-party dependency.
const SELF_PACKAGES = new Set(['beatbayashi@0.1.0']);

function parseCsvLine(line) {
  // Values are always double-quoted in this file (see
  // docs/dependency-licenses.csv); no embedded commas or quotes appear in
  // practice, so a straightforward split is sufficient and easy to audit.
  const fields = [];
  const re = /"([^"]*)"/g;
  let match;
  while ((match = re.exec(line)) !== null) {
    fields.push(match[1]);
  }
  return fields;
}

function main() {
  const rootDir = path.join(__dirname, '..');
  const csvPath = path.join(rootDir, 'docs', 'dependency-licenses.csv');
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    console.error(`${csvPath}: no data rows found`);
    process.exit(1);
  }

  const header = parseCsvLine(lines[0]);
  const scopeIdx = header.indexOf('scope');
  const moduleIdx = header.indexOf('module name');
  const licenseIdx = header.indexOf('license');

  if (scopeIdx === -1 || moduleIdx === -1 || licenseIdx === -1) {
    console.error(
      `${csvPath}: expected columns "scope", "module name", "license" in header, got: ${lines[0]}`
    );
    process.exit(1);
  }

  const ok = [];
  const problems = [];
  const scopesSeen = new Set();

  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const scope = fields[scopeIdx];
    const moduleName = fields[moduleIdx];
    const license = fields[licenseIdx];
    if (scope) scopesSeen.add(scope);

    if (SELF_PACKAGES.has(moduleName)) {
      ok.push(`[${scope}] ${moduleName}: ${license} (project's own package, skipped)`);
      continue;
    }

    const parts = (license || '')
      .replace(/[()]/g, '')
      .split(/\s+(?:OR|AND)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length === 0 || !parts.every((p) => ALLOWED_LICENSE_RE.test(p))) {
      problems.push(`[${scope}] ${moduleName}: license "${license}" is not in the allowed list`);
      continue;
    }

    ok.push(`[${scope}] ${moduleName}: ${license}`);
  }

  console.log('Checked dependency ledger rows:');
  ok.forEach((line) => console.log(`  OK   ${line}`));

  const expectedScopes = ['web', 'mobile', 'backend'];
  const missingScopes = expectedScopes.filter((s) => !scopesSeen.has(s));
  if (missingScopes.length > 0) {
    problems.push(`ledger is missing scope(s): ${missingScopes.join(', ')}`);
  }

  if (problems.length > 0) {
    console.error('\nLicense check FAILED for:');
    problems.forEach((line) => console.error(`  FAIL ${line}`));
    process.exit(1);
  }

  console.log(`\nAll ${ok.length} ledger rows (scopes: ${[...scopesSeen].join(', ')}) have allowed licenses.`);
}

main();
