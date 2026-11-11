// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Owner decision 2026-10-07 ("最初から有効にする"): the Play button is enabled
// from the first render, and pressing it before any audio engine exists
// creates the engine and starts playback in that same press. Before, the
// button was `disabled` until a separate first click elsewhere had built the
// engine, and a click on a disabled button is dropped by the browser, so the
// first press of Play did nothing.
//
// Unlike App.test.tsx, the real ControlPanel is rendered here (that is the
// button under test); only the AudioEngine is a fake, because jsdom has no
// Web Audio API.
//
// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSequencerStore } from './store/sequencerStore';
import App from './App';

const fake = vi.hoisted(() => ({
  constructed: 0,
  initialize: vi.fn(async () => undefined as void),
  scheduleRepeat: vi.fn((_cb: (time: number) => void, _resolution: number) => 1),
  startTransport: vi.fn(),
  dispose: vi.fn(),
  loadSoundDocument: vi.fn((_doc: unknown) => [] as string[]),
  applySoundBasis: vi.fn(async (..._args: unknown[]) => {}),
  changeListener: null as null | (() => void),
}));

vi.mock('./audio/AudioEngine', () => {
  class AudioEngine {
    constructor() {
      fake.constructed += 1;
    }
    initialize = fake.initialize;
    dispose = fake.dispose;
    scheduleRepeat = fake.scheduleRepeat;
    startTransport = fake.startTransport;
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
    loadSoundDocument = fake.loadSoundDocument;
    subscribeChange(listener: () => void) {
      fake.changeListener = listener;
      return () => {
        fake.changeListener = null;
      };
    }
    getSoundDocument() {
      return { version: 1, lanes: { kick: { marker: 'current' } } };
    }
    applySoundBasis = fake.applySoundBasis;
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
vi.mock('./components/RightsBanner', () => ({ RightsBanner: () => null }));
vi.mock('./components/PresetDropdowns', () => ({ PresetDropdowns: () => null }));
vi.mock('./components/PanelFrame', () => ({
  PanelFrame: ({ children }: { children: ReactNode }) => children,
}));

beforeEach(() => {
  localStorage.clear();
  fake.constructed = 0;
  fake.initialize.mockReset();
  fake.initialize.mockResolvedValue(undefined);
  fake.scheduleRepeat.mockClear();
  fake.startTransport.mockClear();
  fake.dispose.mockClear();
  fake.loadSoundDocument.mockClear();
  fake.loadSoundDocument.mockReturnValue([]);
  fake.applySoundBasis.mockClear();
  fake.changeListener = null;
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no backend in tests')));
  useSequencerStore.setState({ isPlaying: false, currentStep: 0, bars: 1, resolution: 16 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const playButton = () => screen.getByRole('button', { name: 'PLAY' }) as HTMLButtonElement;

describe('Play on the very first press', () => {
  it('is enabled from the first render, with no engine and no "Initialising" label', () => {
    render(<App />);
    expect(fake.constructed).toBe(0);
    expect(playButton().disabled).toBe(false);
    expect(screen.queryByText(/Initialising/)).toBeNull();
  });

  it('one press creates the engine and starts playback in the same action', async () => {
    render(<App />);
    expect(useSequencerStore.getState().isPlaying).toBe(false);

    await act(async () => {
      fireEvent.click(playButton());
    });

    // One engine, even though the same click also reached the document's
    // first-gesture listener.
    expect(fake.constructed).toBe(1);
    expect(fake.initialize).toHaveBeenCalledTimes(1);
    expect(useSequencerStore.getState().isPlaying).toBe(true);
    expect(fake.scheduleRepeat).toHaveBeenCalledTimes(1);
    expect(fake.startTransport).toHaveBeenCalledTimes(1);
    // The button now offers Stop, not "Initialising...".
    expect(screen.getByRole('button', { name: 'STOP' })).toBeTruthy();
  });

  it('shows the "Initialising" label (and refuses a second press) only while that press is in flight', async () => {
    let finishInit: () => void = () => {};
    fake.initialize.mockImplementation(
      () => new Promise<void>((resolve) => { finishInit = resolve; })
    );
    render(<App />);

    await act(async () => {
      fireEvent.click(playButton());
    });
    const busy = screen.getByRole('button', { name: 'Initialising...' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.title).toBe('Audio initialising...');
    expect(useSequencerStore.getState().isPlaying).toBe(false);

    await act(async () => {
      finishInit();
    });
    expect(useSequencerStore.getState().isPlaying).toBe(true);
    expect(screen.queryByRole('button', { name: 'Initialising...' })).toBeNull();
    expect(fake.constructed).toBe(1);
  });

  it('falls into the error and Retry UI when the engine cannot start, without starting playback; Retry recovers', async () => {
    fake.initialize.mockRejectedValueOnce(new Error('no audio output'));
    render(<App />);

    await act(async () => {
      fireEvent.click(playButton());
    });

    expect(useSequencerStore.getState().isPlaying).toBe(false);
    expect(fake.scheduleRepeat).not.toHaveBeenCalled();
    expect(screen.getByText('Audio initialization failed')).toBeTruthy();
    expect(screen.queryByText(/Initialising/)).toBeNull();
    // The half-built engine was released.
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });
    expect(fake.constructed).toBe(2);
    expect(screen.queryByText('Audio initialization failed')).toBeNull();
    // Retry only rebuilds the engine; the player presses Play again.
    expect(useSequencerStore.getState().isPlaying).toBe(false);
    await act(async () => {
      fireEvent.click(playButton());
    });
    expect(useSequencerStore.getState().isPlaying).toBe(true);
    expect(fake.constructed).toBe(2);
  });
});

describe('per-lane sound document at start-up and afterwards (ISSUE: sound settings did not persist)', () => {
  it('hands the stored document to the engine and keeps the restored lanes out of the genre default', async () => {
    const stored = { version: 1, lanes: { kick: { marker: 'stored' } } };
    localStorage.setItem('BeatBayashi.drumSettings.v2', JSON.stringify(stored));
    fake.loadSoundDocument.mockReturnValue(['kick']);
    render(<App />);

    await act(async () => {
      fireEvent.click(playButton());
    });

    expect(fake.loadSoundDocument).toHaveBeenCalledWith(stored);
    expect(fake.applySoundBasis).toHaveBeenCalledTimes(1);
    expect(fake.applySoundBasis.mock.calls[0][2]).toEqual({ respectSaved: true, keepLanes: ['kick'] });
  });

  it('starts from nothing when the stored document is junk or absent', async () => {
    localStorage.setItem('BeatBayashi.drumSettings.v2', '{not json');
    render(<App />);
    await act(async () => {
      fireEvent.click(playButton());
    });
    expect(fake.loadSoundDocument).toHaveBeenCalledWith(null);
    expect(useSequencerStore.getState().isPlaying).toBe(true);
  });

  it('writes the document back about half a second after the last change, and not at load time', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(playButton());
    });
    const key = 'BeatBayashi.drumSettings.v2';
    expect(localStorage.getItem(key)).toBeNull(); // loading wrote nothing
    expect(fake.changeListener).not.toBeNull();

    fake.changeListener!();
    fake.changeListener!();
    expect(localStorage.getItem(key)).toBeNull(); // debounced
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
    });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({
      version: 1,
      lanes: { kick: { marker: 'current' } },
    });
  });

  it('writes a pending change when the page is about to close', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(playButton());
    });
    fake.changeListener!();
    window.dispatchEvent(new Event('beforeunload'));
    expect(localStorage.getItem('BeatBayashi.drumSettings.v2')).not.toBeNull();
  });
});
