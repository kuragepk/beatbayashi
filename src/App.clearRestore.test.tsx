// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Restore after Clear puts back one snapshot. It used to hold only
// grid/subGrid/accents and to stay on screen after later edits, so a bar
// change followed by Restore left a grid of the old shape under the new bar
// count, and a note drawn after Clear was silently thrown away.
//
// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useSequencerStore } from './store/sequencerStore';
import App from './App';

vi.mock('./audio/AudioEngine', () => {
  class AudioEngine {
    initialize = async () => undefined;
    dispose() {}
    scheduleRepeat() {
      return 1;
    }
    startTransport() {}
    stopTransport() {}
    clearScheduled() {}
    setTransportBpm() {}
    drawAt(_time: number, callback: () => void) {
      callback();
    }
    playDrumAt() {}
    playDrum() {}
    resumeIfInterrupted() {
      return Promise.resolve();
    }
    addLane() {}
    removeLane() {}
    loadAllSettings() {}
    loadSoundDocument() {
      return [] as string[];
    }
    subscribeChange() {
      return () => {};
    }
    getSoundDocument() {
      return { version: 1, lanes: {} };
    }
    async applySoundBasis() {}
    setMasterDb() {}
    getMasterDb() {
      return -6;
    }
    setLaneAudible() {}
    getLayers() {
      return [];
    }
    getCurrentPreset() {
      return '';
    }
  }
  return { AudioEngine };
});

vi.mock('./components/SequencerGrid', () => ({ SequencerGrid: () => null }));
vi.mock('./components/ControlPanel', () => ({ ControlPanel: () => null }));
vi.mock('./components/RightsBanner', () => ({ RightsBanner: () => null }));
vi.mock('./components/PresetDropdowns', () => ({ PresetDropdowns: () => null }));
vi.mock('./components/PanelFrame', () => ({
  PanelFrame: ({ children }: { children: ReactNode }) => children,
}));

const store = () => useSequencerStore.getState();

const restoreButton = () => screen.queryByRole('button', { name: /Restore/ });

/** Draws one note, then goes through the Clear button and its dialog. */
const clearOneNote = () => {
  render(<App />);
  act(() => {
    store().setGridConfig(1, 16);
    store().setGridCell(0, 3, true);
  });
  fireEvent.click(screen.getByTitle(/clear/i));
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear' }));
  expect(store().grid[0][3]).toBe(false);
  expect(restoreButton()).not.toBeNull();
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no backend in tests')));
  useSequencerStore.setState({ isPlaying: false, currentStep: 0 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Restore after Clear', () => {
  it('puts the pattern back when nothing changed since Clear', () => {
    clearOneNote();
    fireEvent.click(restoreButton()!);
    expect(store().grid[0][3]).toBe(true);
    expect(restoreButton()).toBeNull();
  });

  it('is gone after one grid edit, and the edit stays', () => {
    clearOneNote();
    act(() => store().toggleGridCell(1, 5));
    expect(restoreButton()).toBeNull();
    expect(store().grid[1][5]).toBe(true);
    expect(store().grid[0][3]).toBe(false);
  });

  it('is gone after an accent edit', () => {
    clearOneNote();
    act(() => store().cycleAccent(1, 5));
    expect(restoreButton()).toBeNull();
  });

  it('is gone after a change of bars, so grid rows keep the shape of the lanes and bars', () => {
    clearOneNote();
    act(() => store().setBars(2));
    expect(restoreButton()).toBeNull();

    const { grid, lanes, bars, resolution } = store();
    expect(grid).toHaveLength(lanes.length);
    for (const row of grid) expect(row).toHaveLength(bars * resolution);
  });

  it('is gone after a change of resolution', () => {
    clearOneNote();
    act(() => store().setResolution(32));
    expect(restoreButton()).toBeNull();
  });

  it('is gone after a lane is added, and grid rows still equal the lanes', () => {
    clearOneNote();
    act(() => {
      store().addLane('kick');
    });
    expect(restoreButton()).toBeNull();
    expect(store().grid).toHaveLength(store().lanes.length);
  });

  it('stays through changes that are not edits of the pattern', () => {
    clearOneNote();
    act(() => {
      store().setBPM(140);
      store().setCurrentStep(4);
    });
    expect(restoreButton()).not.toBeNull();
  });

  it('brings back lanes, bars and resolution with the grid', () => {
    clearOneNote();
    const { lanes, bars, resolution } = store();
    fireEvent.click(restoreButton()!);
    expect(store().lanes).toEqual(lanes);
    expect(store().bars).toBe(bars);
    expect(store().resolution).toBe(resolution);
    expect(store().grid).toHaveLength(store().lanes.length);
    for (const row of store().grid) {
      expect(row).toHaveLength(store().bars * store().resolution);
    }
  });
});
