// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Side-effect module: imported first in main.tsx, so the old `orb-*` keys are
// moved to `kb-*`, and `beatBayashi.*` to `BeatBayashi.*`,
// before any store module reads localStorage at import time (ES modules
// evaluate their imports in source order).

import { migrateLegacyStorageKeys } from './legacyKeys';

migrateLegacyStorageKeys();
