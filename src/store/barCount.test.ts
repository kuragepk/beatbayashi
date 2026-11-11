// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Owner decision 2026-09-29: bar count is a 1..32 counter. "+" appends an
// empty bar, "-" drops the last one. Covers the store actions, limits and a
// save/load round trip at the 32-bar maximum.
//
// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  useSequencerStore,
  loadSequencerState,
  saveSequencerState,
  MAX_BARS,
  MIN_BARS,
  clampBars,
} from './sequencerStore';

// Starts from the store's initial state, not just bars/resolution: the
// hand-edited-save test below loads `lanes: []`, and a reset that kept the
// previous test's lanes left later tests with an empty grid when run after it.
function reset(resolution: 16 | 32 = 16) {
  useSequencerStore.setState({
    ...useSequencerStore.getInitialState(),
    bars: 1,
    resolution,
    currentStep: 0,
  });
  useSequencerStore.getState().resetGrid();
}

describe('bar counter store actions', () => {
  beforeEach(() => reset());

  it('limits are 1 and 32', () => {
    expect(MIN_BARS).toBe(1);
    expect(MAX_BARS).toBe(32);
  });

  it('addBar appends an empty bar and keeps existing bars', () => {
    const grid = useSequencerStore.getState().grid.map((r) => [...r]);
    grid[0][0] = true;
    grid[0][15] = true;
    useSequencerStore.setState({ grid });
    useSequencerStore.getState().addBar();
    const s = useSequencerStore.getState();
    expect(s.bars).toBe(2);
    s.grid.forEach((row) => expect(row).toHaveLength(32));
    s.accents.forEach((row) => expect(row).toHaveLength(32));
    expect(s.grid[0][0]).toBe(true);
    expect(s.grid[0][15]).toBe(true);
    expect(s.grid.some((row) => row.slice(16).some(Boolean))).toBe(false);
  });

  it('addBar stops at 32', () => {
    for (let i = 0; i < 40; i++) useSequencerStore.getState().addBar();
    const s = useSequencerStore.getState();
    expect(s.bars).toBe(32);
    s.grid.forEach((row) => expect(row).toHaveLength(32 * 16));
  });

  it('removeLastBar drops only the last bar and stops at 1', () => {
    useSequencerStore.getState().addBar();
    useSequencerStore.getState().addBar();
    const grid = useSequencerStore.getState().grid.map((r) => [...r]);
    grid[1][17] = true;
    useSequencerStore.setState({ grid });
    useSequencerStore.getState().removeLastBar();
    let s = useSequencerStore.getState();
    expect(s.bars).toBe(2);
    expect(s.grid[1][17]).toBe(true);
    for (let i = 0; i < 5; i++) useSequencerStore.getState().removeLastBar();
    s = useSequencerStore.getState();
    expect(s.bars).toBe(1);
    s.grid.forEach((row) => expect(row).toHaveLength(16));
  });

  it('lastBarHasNotes looks only at the last bar', () => {
    useSequencerStore.getState().addBar();
    const grid = useSequencerStore.getState().grid.map((r) => [...r]);
    grid[0][3] = true;
    useSequencerStore.setState({ grid });
    expect(useSequencerStore.getState().lastBarHasNotes()).toBe(false);
    grid[2][20] = true;
    useSequencerStore.setState({ grid: grid.map((r) => [...r]) });
    expect(useSequencerStore.getState().lastBarHasNotes()).toBe(true);
  });

  it('lastBarHasNotes counts sub-sound steps in the last bar', () => {
    useSequencerStore.getState().addBar();
    const s0 = useSequencerStore.getState();
    expect(s0.lastBarHasNotes()).toBe(false);
    const subGrid = s0.subGrid.map((rows) => rows.map((r) => [...r]));
    expect(subGrid[0].length).toBeGreaterThan(0);
    subGrid[0][0][s0.resolution + 2] = true;
    useSequencerStore.setState({ subGrid });
    expect(useSequencerStore.getState().grid.some((r) => r.some(Boolean))).toBe(false);
    expect(useSequencerStore.getState().lastBarHasNotes()).toBe(true);
  });

  it('clampBars keeps values in 1..32', () => {
    expect(clampBars(0)).toBe(1);
    expect(clampBars(33)).toBe(32);
    expect(clampBars(Number.NaN)).toBe(1);
    expect(clampBars('7')).toBe(1);
    expect(clampBars(12)).toBe(12);
  });
});

describe('save/load round trip at 32 bars x 32 steps', () => {
  beforeEach(() => {
    localStorage.clear();
    reset(32);
  });

  it('keeps every step and accent', () => {
    for (let i = 1; i < MAX_BARS; i++) useSequencerStore.getState().addBar();
    const grid = useSequencerStore.getState().grid.map((r) => [...r]);
    grid[0][0] = true;
    grid[1][32 * 32 - 1] = true;
    grid[3][500] = true;
    useSequencerStore.setState({ grid });
    const before = JSON.stringify(useSequencerStore.getState().grid);
    saveSequencerState();
    reset(16);
    loadSequencerState();
    const s = useSequencerStore.getState();
    expect(s.bars).toBe(32);
    expect(s.resolution).toBe(32);
    expect(JSON.stringify(s.grid)).toBe(before);
    s.accents.forEach((row) => expect(row).toHaveLength(1024));
  });

  it('clamps a hand-edited save above 32 bars and rebuilds its grid', () => {
    localStorage.setItem(
      'BeatBayashi.sequencer',
      JSON.stringify({ bpm: 120, bars: 99, resolution: 16, grid: [], lanes: [], accents: [] })
    );
    loadSequencerState();
    const s = useSequencerStore.getState();
    expect(s.bars).toBe(32);
    // The save had no lanes at all; the four core lanes come back, empty.
    expect(s.lanes.map((l) => l.id)).toEqual(['kick', 'tom', 'cymbal', 'clap']);
    expect(s.grid).toHaveLength(4);
    expect(s.accents).toHaveLength(4);
    s.grid.forEach((row) => {
      expect(row).toHaveLength(32 * 16);
      expect(row.some(Boolean)).toBe(false);
    });
    s.accents.forEach((row) => expect(row).toHaveLength(32 * 16));
  });
});
