// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// SFZ instrument definition.
//
// SFZ is a *sampler* format: every region names an audio file. This app has no
// audio files - each drum is synthesised as it plays - so an SFZ can only be
// written by first rendering each voice to a one-shot WAV and shipping those
// alongside. That is what the export does, and it is why the export is a zip
// rather than a single .sfz.
//
// The notes match the General MIDI drum map, the same map the MIDI export
// uses, so a pattern exported as MIDI lands on the right voice of this
// instrument in any DAW.

import { CONTENT_RIGHTS_LINE, GENERATOR, GENERATOR_LICENCE } from './rights';

export interface SfzRegion {
  /** File name inside the archive, relative to the .sfz. */
  sample: string;
  /** MIDI note this voice answers to. */
  key: number;
  /** Human-readable, written into the file as a comment. */
  label: string;
  /** The synthesis technique the sample was rendered from, for the comment. */
  technique?: string;
}

export interface SfzOptions {
  name: string;
  regions: SfzRegion[];
  generatedAt: string;
}

export function buildSfz({ name, regions, generatedAt }: SfzOptions): string {
  const lines: string[] = [
    `// ${name}`,
    '//',
    '// Made with BeatBayashi. These samples were synthesised, not recorded:',
    '// no third-party recording is in them. They are yours - sell, publish,',
    '// modify or redistribute them, with no attribution required.',
    `// ${CONTENT_RIGHTS_LINE}`,
    `// Generator: ${GENERATOR} (code licence: ${GENERATOR_LICENCE})`,
    '//',
    `// Generated ${generatedAt}`,
    '',
    '<control>',
    'default_path=samples/',
    '',
    '<global>',
    'ampeg_attack=0.001',
    'ampeg_release=0.2',
    'loop_mode=one_shot',
    '',
  ];

  for (const region of regions) {
    lines.push(
      `// ${region.label}${region.technique ? ` — ${region.technique}` : ''}`,
      '<region>',
      `sample=${region.sample}`,
      `key=${region.key}`,
      'pitch_keycenter=' + region.key,
      // A drum one-shot should not be re-pitched by the key it lands on: the
      // region answers to exactly one key, so lock the tracking off.
      'pitch_keytrack=0',
      ''
    );
  }

  return lines.join('\n');
}
