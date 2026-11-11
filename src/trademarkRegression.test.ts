// SPDX-FileCopyrightText: 2026 Open Rhythm Box contributors
//
// SPDX-License-Identifier: MIT-0
//
// P1-1 licensing-provenance audit, finding 10: nothing stopped a future edit
// from reintroducing a real product or track name into user-facing text.
// This pins every name/description/label field this project ships against
// the pattern the audit used to confirm the repository was clean on
// 2026-09-19. It should pass today; a failure names the offending entries
// instead of being "fixed" by loosening the pattern.

import { describe, expect, it } from 'vitest';
import { PRESETS, CHARACTER_DESCRIPTIONS } from './presets';
import { SYNTH_PRESETS } from './audio/synthPresets';
import { DRUM_SAMPLES } from './audio/DrumSamples';

// From docs/audits/RAW_20260919_licensing_provenance_audit.md, finding 10.
const TRADEMARK_OR_TITLE =
  /\b(808|909|roland|tr-?\d{3}|linn|akai|mpc|oberheim|simmons|amen|funky drummer|apache)\b/i;

describe('trademark and track-title regression', () => {
  it('keeps preset names and descriptions free of trademarks or track titles', () => {
    for (const preset of PRESETS) {
      expect(preset.name, preset.id).not.toMatch(TRADEMARK_OR_TITLE);
      expect(preset.description, preset.id).not.toMatch(TRADEMARK_OR_TITLE);
    }
  });

  it('keeps character descriptions free of trademarks or track titles', () => {
    for (const [character, text] of Object.entries(CHARACTER_DESCRIPTIONS)) {
      expect(text, character).not.toMatch(TRADEMARK_OR_TITLE);
    }
  });

  it('keeps synth preset names free of trademarks or track titles', () => {
    for (const [drumId, presets] of Object.entries(SYNTH_PRESETS)) {
      for (const [presetId, config] of Object.entries(presets)) {
        expect(config.name, `${drumId}.${presetId}`).not.toMatch(TRADEMARK_OR_TITLE);
      }
    }
  });

  it('keeps generated drum sample names free of trademarks or track titles', () => {
    for (const [drumId, sample] of Object.entries(DRUM_SAMPLES)) {
      expect(sample.name, drumId).not.toMatch(TRADEMARK_OR_TITLE);
    }
  });
});
