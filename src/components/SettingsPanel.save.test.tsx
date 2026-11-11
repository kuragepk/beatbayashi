// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// ISSUE-BEATBOX-033: pressing Save when the browser refuses local storage
// (quota, private mode) used to throw out of the click handler. The panel now
// shows a notice and does not claim "Saved".
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import type { AudioEngine } from '../audio/AudioEngine';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

const STORE = { 'kick:membrane_808': { pitch: 0.5 } };

// Only what the panel touches before and on Save; a lane with no layers.
function engine(): AudioEngine {
  return {
    getLayers: () => [],
    getAllSettings: () => STORE,
    getLayerSettings: () => ({}),
    playDrum: () => {},
  } as unknown as AudioEngine;
}

function pressSave() {
  render(<SettingsPanel audioEngine={engine()} onPresetChange={() => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
}

describe('SettingsPanel Save (ISSUE-BEATBOX-033)', () => {
  it('stores the settings and shows Saved when storage accepts the write', () => {
    pressSave();

    expect(localStorage.getItem('BeatBayashi.drumSettings')).toBe(JSON.stringify(STORE));
    expect(screen.getByRole('button', { name: /^Saved$/ })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a notice instead of Saved when storage refuses the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(() => pressSave()).not.toThrow();

    expect(screen.getByRole('alert').textContent).toMatch(/could not save/i);
    expect(screen.queryByRole('button', { name: /^Saved$/ })).toBeNull();
  });
});
