// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PresetDropdowns } from './PresetDropdowns';
import { SOUND_BASIS_INFO } from '../audio/soundBasis';

afterEach(cleanup);

describe('Sound basis dropdown', () => {
  it('defaults to music theory and lists the four bases in evidence order', () => {
    render(<PresetDropdowns activePresetId={null} onLoadPreset={() => {}} />);
    const select = screen.getByLabelText('Sound basis') as HTMLSelectElement;
    expect(select.value).toBe('theory');
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'theory',
      'systematic',
      'empirical',
      'modern',
    ]);
  });

  it('shows the chosen basis sentence in the UI language only (owner 2026-10-06)', () => {
    render(<PresetDropdowns activePresetId={null} onLoadPreset={() => {}} soundBasis="modern" />);
    const text = screen.getByTestId('sound-basis-description').textContent ?? '';
    expect(text).toBe(SOUND_BASIS_INFO.modern.en);
  });

  it('reports a change', () => {
    const onChange = vi.fn();
    render(
      <PresetDropdowns
        activePresetId={null}
        onLoadPreset={() => {}}
        soundBasis="theory"
        onSoundBasisChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText('Sound basis'), {
      target: { value: 'empirical' },
    });
    expect(onChange).toHaveBeenCalledWith('empirical');
  });
});
