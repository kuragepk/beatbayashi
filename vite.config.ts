// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { swPrecache } from './scripts/sw-precache.mjs';

export default defineConfig({
  // swPrecache fills dist/sw.js with this build's hashed assets (BB-T17).
  plugins: [react(), swPrecache()],
  base: './', // relative asset paths so file:// loads work inside the packaged Electron app
  server: {
    port: 5173,
    // localhost only (owner 2026-10-19): vite/esbuild advisories apply to a
    // dev server open to the LAN. For a phone on the LAN, run `pnpm dev --host`.
  },
});
