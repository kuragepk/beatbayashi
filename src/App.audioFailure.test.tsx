// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// AudioEngine.initialize() used to catch its own failure and return, so App
// stored an engine that looked ready but never sounded (playDrumAt returns
// early when the engine did not finish initialising), and the error and Retry
// UI of ISSUE-BEATBOX-023 never appeared. This renders the real App, ControlPanel
// and AudioEngine, with only the Tone context faked to refuse to start, and
// checks the failure reaches the screen and no engine is kept.
//
// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSequencerStore } from './store/sequencerStore';

const tone = vi.hoisted(() => {
  class FakeNode {
    connect = vi.fn(() => this);
    disconnect = vi.fn();
    dispose = vi.fn();
  }
  const rawContext = { currentTime: 0 };
  const liveContext = {
    state: 'suspended',
    resume: vi.fn(async () => {}),
    now: () => 0,
    sampleRate: 44100,
    rawContext,
  };
  return {
    FakeNode,
    liveContext,
    start: vi.fn(async () => {
      throw new Error('The AudioContext was not allowed to start');
    }),
    transport: {
      bpm: { value: 120 },
      scheduleRepeat: vi.fn(() => 1),
      clear: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    },
    busDispose: vi.fn(),
  };
});

vi.mock('tone', () => ({
  Gain: tone.FakeNode,
  getContext: () => tone.liveContext,
  setContext: vi.fn(),
  start: tone.start,
  now: () => 0,
  Transport: tone.transport,
  Draw: { schedule: vi.fn() },
}));

// The shared master bus needs a real Web Audio graph; a stub is enough because
// initialization fails before any sound is built.
vi.mock('@otoinki/loudness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@otoinki/loudness')>()),
  createMasterBus: () => ({
    input: {},
    arm: vi.fn(),
    setMasterDb: vi.fn(),
    getMasterDb: () => -6,
    dispose: tone.busDispose,
  }),
}));

vi.mock('./components/SequencerGrid', () => ({ SequencerGrid: () => null }));
vi.mock('./components/RightsBanner', () => ({ RightsBanner: () => null }));
vi.mock('./components/PresetDropdowns', () => ({ PresetDropdowns: () => null }));
vi.mock('./components/PanelFrame', () => ({
  PanelFrame: ({ children }: { children: ReactNode }) => children,
}));

import App from './App';

beforeEach(() => {
  localStorage.clear();
  tone.start.mockClear();
  tone.transport.scheduleRepeat.mockClear();
  tone.transport.start.mockClear();
  tone.busDispose.mockClear();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no backend in tests')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useSequencerStore.setState({ isPlaying: false, currentStep: 0, bars: 1, resolution: 16 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('App with an AudioEngine whose Tone context cannot start', () => {
  it('shows the error and a Retry button, keeps no engine, and does not start playback', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'PLAY' }));
    });

    expect(tone.start).toHaveBeenCalled();
    expect(screen.getByText('Audio initialization failed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    // No Play (or Initialising) button is left to press, and nothing was
    // scheduled: no engine was set.
    expect(screen.queryByRole('button', { name: 'PLAY' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Initialising...' })).toBeNull();
    expect(useSequencerStore.getState().isPlaying).toBe(false);
    expect(tone.transport.scheduleRepeat).not.toHaveBeenCalled();
    expect(tone.transport.start).not.toHaveBeenCalled();
    // The half-built engine's master bus was released.
    expect(tone.busDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the error after Retry when the context still cannot start', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'PLAY' }));
    });
    expect(tone.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });

    expect(tone.start).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Audio initialization failed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(tone.transport.scheduleRepeat).not.toHaveBeenCalled();
  });
});
