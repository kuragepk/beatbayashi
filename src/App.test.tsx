// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// The sequencer effect (App.tsx) deliberately excludes `grid` from its
// dependency array — the scheduled callback reads the latest grid through a
// ref instead — so that toggling a step mid-playback does not tear down and
// rebuild the Tone.Transport schedule (ISSUE-REL-004 IT-4). Before that fix
// (back when this ran on a plain setInterval), an edit during playback
// restarted the interval, which could skip or double a step. This test
// renders the real App and checks the observable symptom: editing the grid
// while playing must not call `scheduleRepeat` again.
//
// AudioEngine talks to a real AudioContext, which jsdom does not provide, so
// it is replaced with a lightweight mock; `playDrumAt`/`scheduleRepeat` are
// spies in case a test wants to assert on them. Child panels that need
// `ResizeObserver` or open a real network connection are stubbed out — this
// test is about the sequencer effect, not the full UI tree.
//
// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useSequencerStore } from './store/sequencerStore';
import App from './App';

const playDrumAt = vi.fn();
const scheduleRepeat = vi.fn((_callback: (time: number) => void, _resolution: number) => 1);
const clearScheduled = vi.fn();
const startTransport = vi.fn();
const stopTransport = vi.fn();
const setTransportBpm = vi.fn();
const drawAt = vi.fn((_time: number, callback: () => void) => callback());
const setMasterDb = vi.fn();
// Toggled by the init-failure test below to make the mocked engine's
// initialize() reject once, standing in for a real AudioContext failure
// (e.g. no output device, browser policy refusal).
let failNextInit = false;

vi.mock('./audio/AudioEngine', () => {
  class AudioEngine {
    async initialize() {
      if (failNextInit) {
        throw new Error('mock audio init failure');
      }
      return undefined;
    }
    loadAllSettings() {}
    loadSoundDocument() {
      return [];
    }
    subscribeChange() {
      return () => {};
    }
    getSoundDocument() {
      return { version: 1, lanes: {} };
    }
    playDrum() {}
    playDrumAt = playDrumAt;
    scheduleRepeat = scheduleRepeat;
    clearScheduled = clearScheduled;
    startTransport = startTransport;
    stopTransport = stopTransport;
    setTransportBpm = setTransportBpm;
    drawAt = drawAt;
    getCurrentPreset() {
      return '';
    }
    changeDrumPreset() {}
    getSettings() {
      return {};
    }
    setSettings() {}
    clearSettings() {}
    getAllSettings() {
      return {};
    }
    setMasterDb = setMasterDb;
    getMasterDb() {
      return -6;
    }
    addLane() {}
    async applySoundBasis() {}
    removeLane() {}
    setLaneAudible() {}
    dispose() {}
  }
  return { AudioEngine };
});

// These panels are not what this test is about; stubbing them keeps the
// render free of ResizeObserver, <select> option churn, and other DOM
// machinery jsdom either lacks or that is irrelevant here.
vi.mock('./components/SequencerGrid', () => ({ SequencerGrid: () => null }));
vi.mock('./components/ControlPanel', () => ({ ControlPanel: () => null }));
vi.mock('./components/RightsBanner', () => ({ RightsBanner: () => null }));
vi.mock('./components/PresetDropdowns', () => ({ PresetDropdowns: () => null }));
vi.mock('./components/PanelFrame', () => ({
  PanelFrame: ({ children }: { children: ReactNode }) => children,
}));

describe('App — sequencer effect', () => {
  beforeEach(() => {
    localStorage.clear();
    playDrumAt.mockClear();
    scheduleRepeat.mockClear();
    clearScheduled.mockClear();
    startTransport.mockClear();
    stopTransport.mockClear();
    setTransportBpm.mockClear();
    drawAt.mockClear();
    setMasterDb.mockClear();
    // App pings an optional local backend on mount; stub it out so the test
    // does not depend on network access or an unpredictable ECONNREFUSED delay.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no backend in tests')));
    useSequencerStore.setState({
      isPlaying: false,
      currentStep: 0,
      bpm: 120,
      bars: 1,
      resolution: 16,
      swing: 0,
      grid: useSequencerStore.getState().grid.map((row) => row.map(() => false)),
      accents: useSequencerStore.getState().accents.map((row) => row.map(() => 1 as const)),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderAndStartAudio() {
    render(<App />);
    // Audio only initialises after a user gesture (App.tsx's
    // handleFirstInteraction listener on `document`); a click stands in for it.
    await act(async () => {
      document.dispatchEvent(new Event('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('does not call scheduleRepeat again when the grid is edited during playback', async () => {
    await renderAndStartAudio();

    act(() => {
      useSequencerStore.getState().togglePlayback();
    });

    // Sanity check: playback actually scheduled something. If this is 0, the
    // audio engine never initialised and the rest of the assertion would
    // pass vacuously.
    expect(scheduleRepeat).toHaveBeenCalledTimes(1);
    expect(startTransport).toHaveBeenCalledTimes(1);

    act(() => {
      useSequencerStore.getState().toggleGridCell(0, 0);
      useSequencerStore.getState().toggleGridCell(0, 1);
      useSequencerStore.getState().toggleGridCell(0, 2);
    });

    expect(scheduleRepeat).toHaveBeenCalledTimes(1);
    expect(clearScheduled).not.toHaveBeenCalled();
  });

  it('shows a retry button instead of "Initialising..." when audio init fails, and retry can recover (ISSUE-BEATBOX-023)', async () => {
    failNextInit = true;
    const { unmount } = render(<App />);
    await act(async () => {
      document.dispatchEvent(new Event('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // ControlPanel is stubbed in this file's top-level mocks, so this test
    // asserts on App's own error state via its exposed prop; a full render
    // of the real ControlPanel error UI is covered separately in
    // ControlPanel.test.tsx.
    expect(scheduleRepeat).not.toHaveBeenCalled();

    failNextInit = false;
    unmount();
  });

  it('applies the saved master level (dB) to the engine on init (ISSUE-BEATBOX-015 finding 4; dB since owner decision 2026-09-27/28)', async () => {
    act(() => {
      useSequencerStore.setState({ masterDb: -12 });
    });

    await renderAndStartAudio();

    expect(setMasterDb).toHaveBeenCalledTimes(1);
    expect(setMasterDb).toHaveBeenCalledWith(-12);
  });

  it('updates the transport tempo in place, without rescheduling, when BPM changes during playback', async () => {
    await renderAndStartAudio();

    act(() => {
      useSequencerStore.getState().togglePlayback();
    });

    expect(scheduleRepeat).toHaveBeenCalledTimes(1);
    setTransportBpm.mockClear();

    act(() => {
      useSequencerStore.getState().setBPM(140);
    });

    expect(setTransportBpm).toHaveBeenCalledWith(140);
    expect(scheduleRepeat).toHaveBeenCalledTimes(1);
    expect(clearScheduled).not.toHaveBeenCalled();
  });

  it('stops the transport and clears the schedule when playback stops', async () => {
    await renderAndStartAudio();

    act(() => {
      useSequencerStore.getState().togglePlayback();
    });
    expect(scheduleRepeat).toHaveBeenCalledTimes(1);

    act(() => {
      useSequencerStore.getState().togglePlayback();
    });

    expect(clearScheduled).toHaveBeenCalledTimes(1);
    expect(stopTransport).toHaveBeenCalledTimes(1);
  });

  it('lights the step that is sounding, not the next one, and moves on with each tick', async () => {
    await renderAndStartAudio();

    act(() => {
      useSequencerStore.getState().setGridCell(0, 3, true);
      // Resume from step 3, so the first tick plays (and lights) 3 -- a value
      // the old "light the next step" behaviour could not produce.
      useSequencerStore.setState({ currentStep: 3 });
      useSequencerStore.getState().togglePlayback();
    });

    const onTick = scheduleRepeat.mock.calls[0][0] as (time: number) => void;

    act(() => {
      onTick(0);
    });
    // Default accent (mid) -> ACCENT_VELOCITY[1] = 0.85 (src/accent.ts).
    expect(playDrumAt).toHaveBeenCalledWith('kick', 0, 0.85, expect.any(Function));
    // Step 3 sounds, step 3 is lit (the grid labels it 4; "ステップ n" is index + 1).
    expect(useSequencerStore.getState().currentStep).toBe(3);

    act(() => {
      onTick(0.125);
    });
    expect(useSequencerStore.getState().currentStep).toBe(4);
  });

  it('the first step lit after Play is step 1 (index 0), and the bar wraps back to it', async () => {
    useSequencerStore.setState({ bars: 1, resolution: 16 });
    await renderAndStartAudio();

    act(() => {
      useSequencerStore.getState().togglePlayback();
    });
    const onTick = scheduleRepeat.mock.calls[0][0] as (time: number) => void;

    act(() => onTick(0));
    expect(useSequencerStore.getState().currentStep).toBe(0);
    for (let step = 1; step < 16; step++) act(() => onTick(step * 0.125));
    expect(useSequencerStore.getState().currentStep).toBe(15);
    act(() => onTick(16 * 0.125));
    expect(useSequencerStore.getState().currentStep).toBe(0);
  });

  it('pausing leaves the cursor on the step that plays next, so resuming does not repeat a step', async () => {
    await renderAndStartAudio();

    act(() => {
      useSequencerStore.getState().togglePlayback();
    });
    const onTick = scheduleRepeat.mock.calls[0][0] as (time: number) => void;
    act(() => onTick(0));
    act(() => onTick(0.125));
    expect(useSequencerStore.getState().currentStep).toBe(1);

    act(() => {
      useSequencerStore.getState().togglePlayback(); // pause
    });
    expect(useSequencerStore.getState().isPlaying).toBe(false);
    expect(useSequencerStore.getState().currentStep).toBe(2);

    // Reset still rewinds to the top.
    act(() => {
      useSequencerStore.getState().stop();
    });
    expect(useSequencerStore.getState().currentStep).toBe(0);
  });

  it('a sub-only step fires only the sub layers; a main-only step only the main (v3)', async () => {
    await renderAndStartAudio();

    act(() => {
      const st = useSequencerStore.getState();
      st.setGridCell(0, 0, true);
      useSequencerStore.setState({
        subGrid: st.subGrid.map((rows, lane) =>
          rows.map((row, sub) => row.map((_, step) => lane === 0 && sub === 0 && step === 1))
        ),
      });
      st.togglePlayback();
    });

    const onTick = scheduleRepeat.mock.calls[0][0] as (time: number) => void;
    act(() => onTick(0));
    const mainOnly = playDrumAt.mock.calls[playDrumAt.mock.calls.length - 1][3] as (i: number) => boolean;
    expect(mainOnly(0)).toBe(true);
    expect(mainOnly(1)).toBe(false);

    act(() => onTick(0.125));
    const subOnly = playDrumAt.mock.calls[playDrumAt.mock.calls.length - 1][3] as (i: number) => boolean;
    expect(subOnly(0)).toBe(false);
    expect(subOnly(1)).toBe(true);
    expect(subOnly(2)).toBe(false);
  });

  it('plays an accented step at its own velocity (P2-16)', async () => {
    await renderAndStartAudio();

    act(() => {
      useSequencerStore.getState().setGridCell(0, 0, true);
      // Cycle mid -> strong.
      useSequencerStore.getState().cycleAccent(0, 0);
      useSequencerStore.getState().togglePlayback();
    });

    const onTick = scheduleRepeat.mock.calls[0][0] as (time: number) => void;
    act(() => onTick(0));

    // Strong -> ACCENT_VELOCITY[2] = 1.0.
    expect(playDrumAt).toHaveBeenCalledWith('kick', 0, 1, expect.any(Function));
  });

  it('delays odd steps by the swing amount, straight steps not at all', async () => {
    await renderAndStartAudio();

    act(() => {
      // An empty grid at mount auto-loads the default preset (its own BPM
      // included), which already ran by this point - pin bpm back down so
      // the expected swing offset below is deterministic.
      useSequencerStore.getState().setBPM(120);
      useSequencerStore.getState().setGridCell(0, 0, true);
      useSequencerStore.getState().setGridCell(0, 1, true);
      useSequencerStore.getState().setSwing(50); // 50% of a step
      useSequencerStore.getState().togglePlayback();
    });

    const onTick = scheduleRepeat.mock.calls[0][0] as (time: number) => void;

    // Step 0 (even/on-beat): no delay.
    act(() => onTick(0));
    expect(playDrumAt).toHaveBeenLastCalledWith('kick', 0, 0.85, expect.any(Function));

    // Step 1 (odd/off-beat): delayed by 50% of a 1/16 step at 120 BPM
    // (60 / 120 / 4 = 0.125s per step -> 0.0625s).
    act(() => onTick(1));
    expect(playDrumAt).toHaveBeenLastCalledWith('kick', 1.0625, 0.85, expect.any(Function));
  });
});
