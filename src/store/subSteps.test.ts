// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Sub-sound steps (pattern format v3, owner request 2026-10-06): migration
// of older saves, store operations keeping subGrid in shape.
//
// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  PATTERN_FORMAT_VERSION,
  SUB_ROWS,
  loadSequencerState,
  saveSequencerState,
  useSequencerStore,
} from './sequencerStore';
import { DEFAULT_LANES } from '../audio/synthPresets';

const STORAGE_KEY = 'BeatBayashi.sequencer';

function oldSave(version: number | undefined, grid: boolean[][]) {
  return JSON.stringify({
    ...(version === undefined ? {} : { version }),
    isPlaying: false,
    currentStep: 0,
    bpm: 120,
    bars: 1,
    resolution: 4,
    lanes: DEFAULT_LANES,
    grid,
    accents: grid.map((row) => row.map(() => 1)),
    swing: 0,
    selectedDrum: 'kick',
  });
}

describe('pattern format v3: sub steps', () => {
  beforeEach(() => {
    localStorage.clear();
    useSequencerStore.setState({ bars: 1, resolution: 4, lanes: DEFAULT_LANES });
    useSequencerStore.getState().setGridConfig(1, 4);
  });

  it('is version 3', () => {
    expect(PATTERN_FORMAT_VERSION).toBe(3);
  });

  for (const version of [undefined, 2]) {
    it(`a version ${version ?? 1} save loads with every sub row a copy of its main row`, () => {
      const grid = [
        [true, false, true, false],
        [false, true, false, false],
        [false, false, false, true],
        [true, true, false, false],
      ];
      localStorage.setItem(STORAGE_KEY, oldSave(version, grid));
      loadSequencerState();
      const { subGrid } = useSequencerStore.getState();
      expect(subGrid).toHaveLength(4);
      subGrid.forEach((rows, lane) => {
        expect(rows).toHaveLength(SUB_ROWS);
        rows.forEach((row) => expect(row).toEqual(grid[lane]));
      });
    });
  }

  it('a v3 save round-trips its own sub rows', () => {
    const s = useSequencerStore.getState();
    s.setGridCell(0, 0, true);
    s.toggleSubCell(0, 0, 2);
    saveSequencerState();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.version).toBe(3);
    useSequencerStore.getState().resetGrid();
    loadSequencerState();
    const { grid, subGrid } = useSequencerStore.getState();
    expect(grid[0]).toEqual([true, false, false, false]);
    expect(subGrid[0][0]).toEqual([false, false, true, false]);
  });

  it('a corrupted subGrid falls back to the main rows', () => {
    const grid = DEFAULT_LANES.map(() => [true, false, false, false]);
    const raw = JSON.parse(oldSave(3, grid));
    raw.subGrid = 'nope';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    loadSequencerState();
    expect(useSequencerStore.getState().subGrid[1][1]).toEqual(grid[1]);
  });

  it('resizes keep subGrid the same shape as grid', () => {
    const s = useSequencerStore.getState();
    s.toggleSubCell(0, 1, 1);
    s.addBar();
    let st = useSequencerStore.getState();
    expect(st.subGrid[0][1]).toHaveLength(8);
    expect(st.subGrid[0][1][1]).toBe(true);
    st.setResolution(8);
    st = useSequencerStore.getState();
    expect(st.subGrid[0][1]).toHaveLength(16);
    expect(st.subGrid[0][1][2]).toBe(true);
    st.removeLastBar();
    expect(useSequencerStore.getState().subGrid[0][1]).toHaveLength(8);
    const id = useSequencerStore.getState().addLane('kick');
    expect(id).not.toBeNull();
    expect(useSequencerStore.getState().subGrid).toHaveLength(5);
    useSequencerStore.getState().removeLane(id!);
    expect(useSequencerStore.getState().subGrid).toHaveLength(4);
  });

  it('a new sub layer starts on the main steps; removing one shifts later rows up', () => {
    const s = useSequencerStore.getState();
    s.setGridCell(0, 3, true);
    s.toggleSubCell(0, 1, 0);
    s.subLayerAdded('kick', 0);
    expect(useSequencerStore.getState().subGrid[0][0]).toEqual([false, false, false, true]);
    useSequencerStore.getState().subLayerRemoved('kick', 0);
    const rows = useSequencerStore.getState().subGrid[0];
    expect(rows[0]).toEqual([true, false, false, false]);
    expect(rows[1]).toEqual([false, false, false, false]);
  });

  it('presets load with subs following the main steps', () => {
    useSequencerStore.getState().loadPattern([[1, 0, 1, 0]], 4);
    expect(useSequencerStore.getState().subGrid[0][0]).toEqual([true, false, true, false]);
  });
});
