// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Where the web app lives, seen from the repository root.
//
// In the main (private) repository the app is in beatbayashi/. The public copy
// (see docs/PUBLIC_MIRROR.md) puts the app at its root, with no beatbayashi/
// folder. The scripts in scripts/ ask here, so the same file runs in both.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function appRoot(repoRoot) {
  const nested = join(repoRoot, 'beatbayashi');
  return existsSync(join(nested, 'package.json')) ? nested : repoRoot;
}
