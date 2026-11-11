// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom is only needed where localStorage is involved; per-file
    // environment comments keep the rest running in plain Node.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    server: { deps: { inline: ['tone'] } },
  },
});
