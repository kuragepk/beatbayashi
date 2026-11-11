// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Must stay the first import: moves pre-rename `orb-*` localStorage keys to
// `kb-*` and `beatBayashi.*` to `BeatBayashi.*` before any
// store module below reads them (owner decisions 2026-10-01).
import './storage/runLegacyKeyMigration';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Owner decisions #70-71 (2026-09-27): the 15 preset UI themes + the bridge
// that maps their colours onto this app's existing look (src/theme/README
// via templates/ui-system/web/README.md; do not hand-edit the kit files).
import './theme/kit/themes.css';
import './theme/kit/fonts.css';
import './theme/theme-bridge.css';
import './theme/retro-ux.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA offline support: production builds only, and only when served over
// http(s) — the Electron shell loads this same bundle over file://, where
// service workers cannot register at all.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is a progressive enhancement; a failed registration
      // (unsupported browser, blocked scope, etc.) should not break the app.
    });
  });
}
