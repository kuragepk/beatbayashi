<!--
SPDX-FileCopyrightText: 2026 BeatBayashi contributors

SPDX-License-Identifier: MIT-0
-->

# sound-lab

Measurement only; not part of the app build. Renders the app's own voices through the app's own offline renderer in headless Chromium and reports numbers (and listening WAVs).
計測専用で、アプリのビルドには入りません。アプリ自身の音源を、アプリ自身のオフライン描画で鳴らして数字と試聴用の WAV を出します。

```
node tools/sound-lab/run.mjs --label before --out <out-dir>/beatbayashi-sound --playwright <dir>/node_modules/playwright
node tools/sound-lab/explore.mjs --playwright <dir>/node_modules/playwright --specs specs.json
```

- `run.mjs`: every preset alone, the cymbal lane of 4 sound bases x 12 genres, and one pattern per genre (about 12 minutes; most of it is the loudness measurement of each distinct sound). Writes `<label>_metrics.json` and WAVs (44.1 kHz, 16-bit, stereo).
- `run-match.mjs`: the web side of the web-versus-phone loudness match (2026-10-29): the web preset that stands for each phone voice, through the live layer chain (normalisation gain, and the soft peak limiter for marked presets), several renders, numbers (JSON) and one mono listening WAV each. The phone side and the comparison table: `beatbayashi-mobile/scripts/compare-web-mobile.js`.
- `explore.mjs`: try parameter values on one voice, or a whole lane of a genre, without editing the presets.
- Levels follow live playback: each layer gets its own loudness-normalisation gain. The app's Export button does not apply that gain.
- Playwright is not a dependency (same as `scripts/smoke.mjs`): pass the module directory.
- The floors the cymbal family must keep are in `src/audio/cymbalTargets.ts`; the same numbers are checked by `src/audio/CymbalSynth.test.ts` (recipe) and `src/audio/AudioEngine.real.test.ts` (rendered, browser only).
