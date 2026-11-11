// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
import { describe, it, expect } from 'vitest';
import { buildSfz } from './sfz';

const build = () =>
  buildSfz({
    name: 'My Kit',
    generatedAt: '2026-09-11T00:00:00.000Z',
    regions: [
      { sample: 'kick.wav', key: 36, label: 'Kick', technique: 'Pitch-swept oscillator' },
      { sample: 'clap.wav', key: 39, label: 'Clap' },
    ],
  });

describe('buildSfz', () => {
  it('names every sample it was given, in the samples folder', () => {
    const sfz = build();
    expect(sfz).toContain('default_path=samples/');
    expect(sfz).toContain('sample=kick.wav');
    expect(sfz).toContain('sample=clap.wav');
  });

  it('gives each region its own key', () => {
    const sfz = build();
    expect(sfz).toContain('key=36');
    expect(sfz).toContain('key=39');
  });

  it('does not re-pitch a drum one-shot across the keyboard', () => {
    expect(build()).toContain('pitch_keytrack=0');
  });

  it('plays each hit to the end rather than looping it', () => {
    expect(build()).toContain('loop_mode=one_shot');
  });

  it('says in the file itself that the sounds are synthesised and free to use', () => {
    const sfz = build();
    expect(sfz).toContain('synthesised, not recorded');
    expect(sfz).toContain('no attribution required');
  });

  it('names the content dedication and the generator licence separately', () => {
    const sfz = build();
    expect(sfz).toContain('Content: CC0-1.0 OR MIT-0, your choice, no attribution needed. https://creativecommons.org/publicdomain/zero/1.0/');
    expect(sfz).toContain('code licence: MIT-0');
  });

  it('writes one region per voice', () => {
    expect(build().match(/<region>/g)).toHaveLength(2);
  });
});
