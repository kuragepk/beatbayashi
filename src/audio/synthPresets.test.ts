// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Locks DEFAULT_LAYERS to the numbers in docs/DESIGN_20260907_voice_layering.md
// §4 ("最初から良い音"). Each voice's two layers (primary "芯" + secondary
// "補助") are asserted field-by-field so a future edit that quietly drifts
// gain/pan/delay away from the design table fails loudly here rather than
// only being caught by ear.

import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYERS, type LayerConfig } from './synthPresets';

function expectLayer(
  layer: LayerConfig,
  expected: {
    layerId: string;
    presetId: string;
    gainDb: number;
    pan: number;
    delay: { enabled: boolean; timeMs: number; feedback: number; wet: number };
  }
) {
  expect(layer.layerId).toBe(expected.layerId);
  expect(layer.presetId).toBe(expected.presetId);
  expect(layer.gainDb).toBe(expected.gainDb);
  expect(layer.pan).toBe(expected.pan);
  expect(layer.delay.enabled).toBe(expected.delay.enabled);
  expect(layer.delay.timeMs).toBe(expected.delay.timeMs);
  expect(layer.delay.feedback).toBe(expected.delay.feedback);
  expect(layer.delay.wet).toBe(expected.delay.wet);
}

describe('DEFAULT_LAYERS matches design §4', () => {
  it('kick: membrane_808 (core, delayed) + synth_blip (aux, dry)', () => {
    expect(DEFAULT_LAYERS.kick).toHaveLength(2);
    expectLayer(DEFAULT_LAYERS.kick[0], {
      layerId: 'kick-1',
      presetId: 'membrane_808',
      gainDb: 0,
      pan: 0,
      delay: { enabled: true, timeMs: 12, feedback: 0.1, wet: 0.15 },
    });
    expectLayer(DEFAULT_LAYERS.kick[1], {
      layerId: 'kick-2',
      presetId: 'synth_blip',
      gainDb: -8,
      pan: 0,
      delay: { enabled: false, timeMs: 5, feedback: 0, wet: 0 },
    });
  });

  it('tom: membrane_mid (core, dry) + duo_wide (aux, delayed)', () => {
    expect(DEFAULT_LAYERS.tom).toHaveLength(2);
    expectLayer(DEFAULT_LAYERS.tom[0], {
      layerId: 'tom-1',
      presetId: 'membrane_mid',
      gainDb: 0,
      pan: 0,
      delay: { enabled: false, timeMs: 5, feedback: 0, wet: 0 },
    });
    expectLayer(DEFAULT_LAYERS.tom[1], {
      layerId: 'tom-2',
      presetId: 'duo_wide',
      gainDb: -10,
      pan: 0.1,
      delay: { enabled: true, timeMs: 18, feedback: 0.15, wet: 0.2 },
    });
  });

  it('cymbal: metal_closed (core, dry) + noise_closed (aux, delayed)', () => {
    expect(DEFAULT_LAYERS.cymbal).toHaveLength(2);
    expectLayer(DEFAULT_LAYERS.cymbal[0], {
      layerId: 'cymbal-1',
      presetId: 'metal_closed',
      gainDb: 0,
      pan: 0,
      delay: { enabled: false, timeMs: 5, feedback: 0, wet: 0 },
    });
    expectLayer(DEFAULT_LAYERS.cymbal[1], {
      layerId: 'cymbal-2',
      presetId: 'noise_closed',
      gainDb: -9,
      pan: 0,
      delay: { enabled: true, timeMs: 8, feedback: 0.05, wet: 0.2 },
    });
  });

  it('clap: noise_clap (core, dry) + noise_clap (aux, delayed, distinct layerId)', () => {
    expect(DEFAULT_LAYERS.clap).toHaveLength(2);
    expectLayer(DEFAULT_LAYERS.clap[0], {
      layerId: 'clap-1',
      presetId: 'noise_clap',
      gainDb: 0,
      pan: 0,
      delay: { enabled: false, timeMs: 5, feedback: 0, wet: 0 },
    });
    expectLayer(DEFAULT_LAYERS.clap[1], {
      layerId: 'clap-2',
      presetId: 'noise_clap',
      gainDb: -6,
      pan: 0.2,
      delay: { enabled: true, timeMs: 20, feedback: 0.1, wet: 0.35 },
    });
    // Same presetId layered twice must still be addressable as separate
    // instances (§2: "同じpresetIdを2回重ねられるよう、インスタンス識別子を分離").
    expect(DEFAULT_LAYERS.clap[0].layerId).not.toBe(DEFAULT_LAYERS.clap[1].layerId);
    expect(DEFAULT_LAYERS.clap[0].presetId).toBe(DEFAULT_LAYERS.clap[1].presetId);
  });

  it('every disabled delay defaults inside AudioEngine.clampLayerPatch\'s 5..400ms range (ISSUE-BEATBOX-015 finding 13)', () => {
    for (const layers of Object.values(DEFAULT_LAYERS)) {
      for (const layer of layers) {
        if (!layer.delay.enabled) {
          expect(layer.delay.timeMs).toBeGreaterThanOrEqual(5);
        }
      }
    }
  });

  it('every secondary layer is at least 6dB below its primary (design principle §4)', () => {
    for (const layers of Object.values(DEFAULT_LAYERS)) {
      const [primary, ...aux] = layers;
      for (const layer of aux) {
        expect(layer.gainDb).toBeLessThanOrEqual(primary.gainDb - 6);
      }
    }
  });
});
