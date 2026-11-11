// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// These cover the re-timing rules, which are the easiest thing here to break
// without noticing: they run whenever the user changes resolution or bar count,
// and a wrong answer silently moves or deletes someone's pattern.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useSequencerStore,
  startAutosave,
  isLaneAudible,
  lanesAboveLimit,
  loadSequencerState,
  saveSequencerState,
  MAX_SWING,
  PATTERN_FORMAT_VERSION,
} from './sequencerStore';
import { DEFAULT_LANES, type Lane } from '../audio/synthPresets';
import type { Accent } from '../accent';

/** Indices of the steps that are on, which reads better in failures than a bool array. */
function onSteps(lane: number): number[] {
  const row = useSequencerStore.getState().grid[lane];
  return row.flatMap((on, i) => (on ? [i] : []));
}

function setLane(lane: number, steps: number[], totalSteps: number) {
  const grid = useSequencerStore.getState().grid.map((_row, i) =>
    i === lane
      ? Array.from({ length: totalSteps }, (_, s) => steps.includes(s))
      : Array(totalSteps).fill(false)
  );
  useSequencerStore.setState({ grid });
}

function createGridFor(laneCount: number, totalSteps: number): boolean[][] {
  return Array.from({ length: laneCount }, () => Array(totalSteps).fill(false));
}

function createAccentsFor(laneCount: number, totalSteps: number): Accent[][] {
  return Array.from({ length: laneCount }, () => Array<Accent>(totalSteps).fill(1));
}

describe('setResolution', () => {
  beforeEach(() => {
    useSequencerStore.setState({ bars: 1, resolution: 8 });
  });

  it('keeps a beat on the same beat when the resolution doubles', () => {
    // Four on the floor at 1/8: every other step is a beat.
    setLane(0, [0, 2, 4, 6], 8);

    useSequencerStore.getState().setResolution(16);

    // At 1/16 the same beats sit twice as far apart.
    expect(onSteps(0)).toEqual([0, 4, 8, 12]);
    expect(useSequencerStore.getState().resolution).toBe(16);
  });

  it('keeps a beat on the same beat when the resolution halves', () => {
    setLane(0, [0, 4, 8, 12], 16);
    useSequencerStore.setState({ resolution: 16 });

    useSequencerStore.getState().setResolution(8);

    expect(onSteps(0)).toEqual([0, 2, 4, 6]);
  });

  it('snaps offbeat steps to the nearest coarser step rather than dropping them', () => {
    setLane(0, [0, 1, 4], 8);

    useSequencerStore.getState().setResolution(4);

    // 1 * 0.5 rounds to 1, so the offbeat hit moves rather than disappearing.
    expect(onSteps(0)).toEqual([0, 1, 2]);
  });

  it('keeps one step when two of them snap to the same slot', () => {
    // 3 -> 1.5 -> 2 and 4 -> 2 collide.
    setLane(0, [0, 3, 4], 8);

    useSequencerStore.getState().setResolution(4);

    expect(onSteps(0)).toEqual([0, 2]);
  });

  it('resets the playhead so it cannot point past the new grid', () => {
    useSequencerStore.setState({ currentStep: 7 });
    useSequencerStore.getState().setResolution(4);
    expect(useSequencerStore.getState().currentStep).toBe(0);
  });
});

describe('checkResolutionLossImpl', () => {
  beforeEach(() => {
    useSequencerStore.setState({ bars: 1, resolution: 8 });
  });

  it('reports nothing to lose when the resolution increases', () => {
    setLane(0, [0, 1, 2], 8);
    expect(useSequencerStore.getState().checkResolutionLossImpl(16)).toBeNull();
  });

  it('counts a step that another step snaps on top of', () => {
    // 3 and 4 both round to slot 2, so one of them is overwritten. Counting
    // only out-of-range steps used to report "no loss" here.
    setLane(0, [0, 3, 4], 8);
    expect(useSequencerStore.getState().checkResolutionLossImpl(4)).toBe(1);
  });

  it('counts collisions and overflow together', () => {
    // 5 -> 3, 6 -> 3 (collides), 7 -> 4 (past the last slot, which is 3).
    setLane(0, [5, 6, 7], 8);
    expect(useSequencerStore.getState().checkResolutionLossImpl(4)).toBe(2);
  });

  it('reports nothing to lose when every active step survives', () => {
    setLane(0, [0, 4], 8);
    expect(useSequencerStore.getState().checkResolutionLossImpl(4)).toBeNull();
  });
});

describe('setBars', () => {
  beforeEach(() => {
    useSequencerStore.setState({ bars: 1, resolution: 8 });
  });

  it('repeats the existing bar when a second one is added', () => {
    setLane(0, [0, 4], 8);

    useSequencerStore.getState().setBars(2);

    expect(onSteps(0)).toEqual([0, 4, 8, 12]);
    expect(useSequencerStore.getState().grid[0]).toHaveLength(16);
  });

  it('keeps only the first bar when the count drops', () => {
    setLane(0, [0, 4, 8, 12], 16);
    useSequencerStore.setState({ bars: 2 });

    useSequencerStore.getState().setBars(1);

    expect(onSteps(0)).toEqual([0, 4]);
    expect(useSequencerStore.getState().grid[0]).toHaveLength(8);
  });
});

describe('loadPattern', () => {
  it('stretches a one-bar preset across every bar on screen', () => {
    useSequencerStore.setState({ bars: 2, resolution: 16 });

    // A 1/8 source: kick on steps 0 and 4.
    useSequencerStore.getState().loadPattern([[1, 0, 0, 0, 1, 0, 0, 0]], 8);

    // Doubled to 1/16 within each bar, then repeated in the second bar.
    expect(onSteps(0)).toEqual([0, 8, 16, 24]);
  });

  it('ignores lanes the grid does not have', () => {
    useSequencerStore.setState({ bars: 1, resolution: 8 });
    const laneCount = useSequencerStore.getState().grid.length;

    expect(() =>
      useSequencerStore
        .getState()
        .loadPattern(Array(laneCount + 3).fill([1, 0, 0, 0]), 4)
    ).not.toThrow();

    expect(useSequencerStore.getState().grid).toHaveLength(laneCount);
  });
});

describe('startAutosave', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves exactly once, 500ms after the last of several rapid changes', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const stop = startAutosave();

    try {
      useSequencerStore.getState().setBPM(100);
      useSequencerStore.getState().setBPM(110);
      useSequencerStore.getState().setBPM(120);

      // Each change resets the 500ms timer, so nothing has saved yet.
      vi.advanceTimersByTime(499);
      expect(setItemSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(setItemSpy).toHaveBeenCalledTimes(1);

      // No further changes: the timer does not re-fire on its own.
      vi.advanceTimersByTime(1000);
      expect(setItemSpy).toHaveBeenCalledTimes(1);
    } finally {
      stop();
      setItemSpy.mockRestore();
    }
  });

  it('stops saving once the returned cleanup is called', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const stop = startAutosave();
    stop();

    useSequencerStore.getState().setBPM(140);
    vi.advanceTimersByTime(1000);

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});

describe('cycleAccent (P2-16)', () => {
  beforeEach(() => {
    useSequencerStore.setState({ bars: 1, resolution: 8 });
    setLane(0, [], 8);
  });

  it('cycles off -> weak -> mid -> strong -> off, and only touches the one cell', () => {
    const { cycleAccent } = useSequencerStore.getState();

    expect(useSequencerStore.getState().grid[0][3]).toBe(false);

    cycleAccent(0, 3);
    expect(useSequencerStore.getState().grid[0][3]).toBe(true);
    expect(useSequencerStore.getState().accents[0][3]).toBe(0); // weak

    cycleAccent(0, 3);
    expect(useSequencerStore.getState().accents[0][3]).toBe(1); // mid

    cycleAccent(0, 3);
    expect(useSequencerStore.getState().accents[0][3]).toBe(2); // strong
    expect(useSequencerStore.getState().grid[0][3]).toBe(true);

    cycleAccent(0, 3);
    expect(useSequencerStore.getState().grid[0][3]).toBe(false);

    // The next off->weak transition starts the same way again.
    cycleAccent(0, 3);
    expect(useSequencerStore.getState().grid[0][3]).toBe(true);
    expect(useSequencerStore.getState().accents[0][3]).toBe(0);

    // No other cell moved.
    expect(onSteps(0)).toEqual([3]);
  });
});

describe('setSwing', () => {
  it('clamps to 0..MAX_SWING', () => {
    const { setSwing } = useSequencerStore.getState();

    setSwing(-10);
    expect(useSequencerStore.getState().swing).toBe(0);

    setSwing(1000);
    expect(useSequencerStore.getState().swing).toBeLessThanOrEqual(75);

    setSwing(40);
    expect(useSequencerStore.getState().swing).toBe(40);
  });
});

describe('accents carried through grid reshapes', () => {
  beforeEach(() => {
    useSequencerStore.setState({ bars: 1, resolution: 8 });
  });

  it('setResolution carries each surviving step\'s accent to its new slot', () => {
    setLane(0, [0, 4], 8);
    useSequencerStore.setState({
      accents: useSequencerStore.getState().accents.map((row, i) =>
        i === 0 ? row.map((_, s) => (s === 4 ? 2 : 1)) : row
      ),
    });

    useSequencerStore.getState().setResolution(16);

    expect(onSteps(0)).toEqual([0, 8]);
    expect(useSequencerStore.getState().accents[0][8]).toBe(2);
    expect(useSequencerStore.getState().accents[0][0]).toBe(1);
  });

  it('setBars repeats accents along with the steps they belong to', () => {
    setLane(0, [0, 4], 8);
    useSequencerStore.setState({
      accents: useSequencerStore.getState().accents.map((row, i) =>
        i === 0 ? row.map((_, s) => (s === 4 ? 0 : 1)) : row
      ),
    });

    useSequencerStore.getState().setBars(2);

    expect(useSequencerStore.getState().accents[0][4]).toBe(0);
    expect(useSequencerStore.getState().accents[0][12]).toBe(0);
  });

  it('loadPattern stamps every activated step at the default (mid) accent', () => {
    useSequencerStore.setState({ bars: 1, resolution: 8 });
    useSequencerStore.getState().loadPattern([[1, 0, 0, 0]], 4);

    expect(useSequencerStore.getState().accents[0][0]).toBe(1);
  });
});

describe('addLane / removeLane (P2-17)', () => {
  beforeEach(() => {
    useSequencerStore.setState({
      bars: 1,
      resolution: 8,
      lanes: DEFAULT_LANES,
      grid: createGridFor(DEFAULT_LANES.length, 8),
      accents: createAccentsFor(DEFAULT_LANES.length, 8),
    });
  });

  it('appends a new lane with its own empty row, at the default accent', () => {
    const id = useSequencerStore.getState().addLane('kick');

    expect(id).not.toBeNull();
    const state = useSequencerStore.getState();
    expect(state.lanes).toHaveLength(5);
    expect(state.lanes[4]).toMatchObject({ id, category: 'kick', label: 'Kick 2' });
    expect(state.grid).toHaveLength(5);
    expect(state.grid[4]).toEqual(Array(8).fill(false));
    expect(state.accents[4]).toEqual(Array(8).fill(1));
  });

  it('numbers same-category lanes in order added', () => {
    useSequencerStore.getState().addLane('kick');
    const secondId = useSequencerStore.getState().addLane('kick');
    const second = useSequencerStore.getState().lanes.find((l) => l.id === secondId);
    expect(second?.label).toBe('Kick 3');
  });

  it('refuses a 9th lane', () => {
    for (let i = 0; i < 4; i++) {
      expect(useSequencerStore.getState().addLane('kick')).not.toBeNull();
    }
    expect(useSequencerStore.getState().lanes).toHaveLength(8);
    expect(useSequencerStore.getState().addLane('kick')).toBeNull();
    expect(useSequencerStore.getState().lanes).toHaveLength(8);
  });

  it('removes an added lane and its row', () => {
    const id = useSequencerStore.getState().addLane('tom');
    expect(id).not.toBeNull();

    const ok = useSequencerStore.getState().removeLane(id as string);

    expect(ok).toBe(true);
    const state = useSequencerStore.getState();
    expect(state.lanes).toHaveLength(4);
    expect(state.lanes.some((l) => l.id === id)).toBe(false);
    expect(state.grid).toHaveLength(4);
    expect(state.accents).toHaveLength(4);
  });

  it('refuses to remove one of the original four lanes', () => {
    const ok = useSequencerStore.getState().removeLane('kick');

    expect(ok).toBe(false);
    expect(useSequencerStore.getState().lanes).toHaveLength(4);
  });

  it('removeLane on an id that does not exist is a no-op', () => {
    const ok = useSequencerStore.getState().removeLane('not-a-real-lane');
    expect(ok).toBe(false);
    expect(useSequencerStore.getState().lanes).toHaveLength(4);
  });
});

describe('isLaneAudible (ISSUE-BEATBOX-011)', () => {
  function lane(id: string, overrides: Partial<Lane> = {}): Lane {
    return { id, category: 'kick', label: id, muted: false, solo: false, ...overrides };
  }

  it('with no solo anywhere, every unmuted lane is audible and muted ones are not', () => {
    const lanes = [lane('a'), lane('b', { muted: true }), lane('c')];

    expect(isLaneAudible(lanes, 'a')).toBe(true);
    expect(isLaneAudible(lanes, 'b')).toBe(false);
    expect(isLaneAudible(lanes, 'c')).toBe(true);
  });

  it('with one lane soloed, only that lane is audible — even an unmuted one', () => {
    const lanes = [lane('a', { solo: true }), lane('b'), lane('c', { muted: true })];

    expect(isLaneAudible(lanes, 'a')).toBe(true);
    expect(isLaneAudible(lanes, 'b')).toBe(false);
    expect(isLaneAudible(lanes, 'c')).toBe(false);
  });

  it('a lane that is both soloed and muted is still audible — solo alone decides once any lane is soloed', () => {
    const lanes = [lane('a', { solo: true, muted: true }), lane('b')];

    expect(isLaneAudible(lanes, 'a')).toBe(true);
    expect(isLaneAudible(lanes, 'b')).toBe(false);
  });

  it('an unknown lane id is not audible', () => {
    expect(isLaneAudible([lane('a')], 'nope')).toBe(false);
  });
});

describe('loadSequencerState backward compatibility (ISSUE-BEATBOX-011)', () => {
  const STORAGE_KEY = 'BeatBayashi.sequencer';

  beforeEach(() => {
    localStorage.clear();
  });

  it('backfills muted/solo as false on lanes saved before this issue', () => {
    const bars = 1;
    const resolution = 8;
    const totalSteps = bars * resolution;
    // Old shape: lanes have no `muted`/`solo` field at all.
    const oldLanes = DEFAULT_LANES.map(({ id, category, label }) => ({ id, category, label }));

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        isPlaying: false,
        currentStep: 0,
        bpm: 120,
        bars,
        resolution,
        lanes: oldLanes,
        grid: createGridFor(oldLanes.length, totalSteps),
        accents: createAccentsFor(oldLanes.length, totalSteps),
        swing: 0,
        masterVolume: 0.8,
        selectedDrum: 'kick',
      })
    );

    loadSequencerState();

    const { lanes } = useSequencerStore.getState();
    expect(lanes).toHaveLength(oldLanes.length);
    lanes.forEach((lane) => {
      expect(lane.muted).toBe(false);
      expect(lane.solo).toBe(false);
    });
  });
});

describe('loadSequencerState grid validation (ISSUE-BEATBOX-027)', () => {
  const STORAGE_KEY = 'BeatBayashi.sequencer';
  const bars = 1;
  const resolution = 8;
  const totalSteps = bars * resolution;

  beforeEach(() => {
    localStorage.clear();
  });

  function baseSave(grid: unknown) {
    return {
      isPlaying: false,
      currentStep: 0,
      bpm: 120,
      bars,
      resolution,
      lanes: DEFAULT_LANES,
      grid,
      accents: createAccentsFor(DEFAULT_LANES.length, totalSteps),
      swing: 0,
      masterVolume: 0.8,
      selectedDrum: 'kick',
    };
  }

  it('falls back to default grid without throwing when grid is null', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(baseSave(null)));

    expect(() => loadSequencerState()).not.toThrow();

    const { grid } = useSequencerStore.getState();
    expect(grid).toHaveLength(DEFAULT_LANES.length);
    grid.forEach((row) => expect(row).toHaveLength(totalSteps));
  });

  it('falls back to default grid without throwing when grid is a string', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(baseSave('not-a-grid')));

    expect(() => loadSequencerState()).not.toThrow();

    const { grid } = useSequencerStore.getState();
    expect(grid).toHaveLength(DEFAULT_LANES.length);
    grid.forEach((row) => expect(row).toHaveLength(totalSteps));
  });

  it('falls back to default grid without throwing when a grid element is not an array', () => {
    const brokenGrid = createGridFor(DEFAULT_LANES.length, totalSteps);
    brokenGrid[1] = 'not-a-row' as unknown as boolean[];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(baseSave(brokenGrid)));

    expect(() => loadSequencerState()).not.toThrow();

    const { grid } = useSequencerStore.getState();
    expect(grid).toHaveLength(DEFAULT_LANES.length);
    grid.forEach((row) => expect(row).toHaveLength(totalSteps));
  });

  it('falls back to default grid without throwing when a row length mismatches steps', () => {
    const brokenGrid = createGridFor(DEFAULT_LANES.length, totalSteps);
    brokenGrid[0] = Array(totalSteps - 1).fill(false);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(baseSave(brokenGrid)));

    expect(() => loadSequencerState()).not.toThrow();

    const { grid } = useSequencerStore.getState();
    expect(grid).toHaveLength(DEFAULT_LANES.length);
    grid.forEach((row) => expect(row).toHaveLength(totalSteps));
  });
});

// 2026-09-26 owner decision: 32 steps per bar, with a version bump on the
// saved pattern shape so a future format change has somewhere to migrate
// from. These cover the three cases that decision requires: an unversioned
// (pre-existing) save still loads, the current version round-trips, and a
// save from a newer build than this one is refused rather than guessed at.
describe('loadSequencerState pattern format version', () => {
  const STORAGE_KEY = 'BeatBayashi.sequencer';
  const bars = 1;
  const resolution = 32; // the new max step count this decision allows
  const totalSteps = bars * resolution;

  beforeEach(() => {
    localStorage.clear();
  });

  function baseSave(extra: Record<string, unknown> = {}) {
    return {
      isPlaying: false,
      currentStep: 0,
      bpm: 120,
      bars,
      resolution,
      lanes: DEFAULT_LANES,
      grid: createGridFor(DEFAULT_LANES.length, totalSteps),
      accents: createAccentsFor(DEFAULT_LANES.length, totalSteps),
      swing: 0,
      masterVolume: 0.8,
      selectedDrum: 'kick',
      ...extra,
    };
  }

  it('loads a save with no version field (every save before this decision), step count preserved', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(baseSave()));

    loadSequencerState();

    const state = useSequencerStore.getState();
    expect(state.resolution).toBe(32);
    expect(state.bars).toBe(1);
    expect(state.grid).toHaveLength(DEFAULT_LANES.length);
    state.grid.forEach((row) => expect(row).toHaveLength(totalSteps));
  });

  it('loads a save at the current version', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(baseSave({ version: PATTERN_FORMAT_VERSION }))
    );

    loadSequencerState();

    expect(useSequencerStore.getState().resolution).toBe(32);
  });

  it('refuses a save from a newer version rather than loading it', () => {
    // Something recognisably different from the current defaults, so we can
    // tell whether it got loaded (it shouldn't).
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(baseSave({ version: PATTERN_FORMAT_VERSION + 1, bpm: 77 }))
    );

    expect(() => loadSequencerState()).not.toThrow();

    expect(useSequencerStore.getState().bpm).not.toBe(77);
  });

  it.each([[-1], [1.5], ['2'], [null], [true]])(
    'refuses a save whose version is not a non-negative integer (%s)',
    (version) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(baseSave({ version, bpm: 77 })));
      expect(() => loadSequencerState()).not.toThrow();
      expect(useSequencerStore.getState().bpm).not.toBe(77);
    }
  );

  it.each([[1], [2], [3]])('still loads a version %s save', (version) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(baseSave({ version, bpm: 77 })));
    loadSequencerState();
    expect(useSequencerStore.getState().bpm).toBe(77);
  });

  it('saveSequencerState writes the current version', () => {
    useSequencerStore.setState({ bpm: 140 });
    saveSequencerState();

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw as string);
    expect(saved.version).toBe(PATTERN_FORMAT_VERSION);
    expect(saved.bpm).toBe(140);
  });
});

// A save with missing or broken lanes must still load the four core lanes
// (the app can't remove them, so a load must not either), keep every valid
// extra lane and step, and size every row to bars x resolution.
describe('loadSequencerState field allow-list', () => {
  const STORAGE_KEY = 'BeatBayashi.sequencer';

  beforeEach(() => {
    localStorage.clear();
  });

  function loadSave(fields: Record<string, unknown>) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: PATTERN_FORMAT_VERSION, bars: 1, resolution: 16, ...fields })
    );
    loadSequencerState();
    return useSequencerStore.getState();
  }

  it('keeps store functions and clamps a tampered save', () => {
    const s = loadSave({ setBPM: 1, bpm: 9999, swing: 999, isPlaying: true, currentStep: 7 });
    expect(typeof s.setBPM).toBe('function');
    expect(s.bpm).toBe(300);
    expect(s.swing).toBe(MAX_SWING);
    expect(s.isPlaying).toBe(false);
    expect(s.currentStep).toBe(0);
  });

  it('clamps low values too', () => {
    const s = loadSave({ bpm: -5, swing: -10 });
    expect(s.bpm).toBe(20);
    expect(s.swing).toBe(0);
  });

  it('drops fields the store does not know', () => {
    useSequencerStore.setState({ loadRefused: false });
    const s = loadSave({ bpm: 120, injected: 'x', loadRefused: true });
    expect(s).not.toHaveProperty('injected');
    expect(s.loadRefused).toBe(false);
  });

  it('keeps the current bpm and selectedDrum when the save has no usable value', () => {
    useSequencerStore.setState({ bpm: 133, selectedDrum: 'snare' });
    const s = loadSave({ bpm: 'fast', selectedDrum: 5 });
    expect(s.bpm).toBe(133);
    expect(s.selectedDrum).toBe('snare');
  });
});

describe('loadSequencerState restores the core lanes', () => {
  const STORAGE_KEY = 'BeatBayashi.sequencer';
  const CORE = ['kick', 'tom', 'cymbal', 'clap'];
  const bars = 2;
  const resolution = 8;
  const totalSteps = bars * resolution;

  beforeEach(() => {
    localStorage.clear();
    useSequencerStore.setState(useSequencerStore.getInitialState());
  });

  function row(on: number[], length = totalSteps): boolean[] {
    return Array.from({ length }, (_, i) => on.includes(i));
  }

  function load(save: Record<string, unknown>) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: PATTERN_FORMAT_VERSION, bpm: 120, bars, resolution, ...save })
    );
    expect(() => loadSequencerState()).not.toThrow();
    return useSequencerStore.getState();
  }

  function expectShape(laneCount: number) {
    const s = useSequencerStore.getState();
    expect(s.lanes).toHaveLength(laneCount);
    expect(s.grid).toHaveLength(laneCount);
    expect(s.accents).toHaveLength(laneCount);
    s.grid.forEach((r) => expect(r).toHaveLength(totalSteps));
    s.accents.forEach((r) => expect(r).toHaveLength(totalSteps));
  }

  it('empty lanes and grid: loads the four core lanes with empty steps', () => {
    const s = load({ lanes: [], grid: [], accents: [] });
    expect(s.lanes.map((l) => l.id)).toEqual(CORE);
    expectShape(4);
    s.grid.forEach((r) => expect(r.some(Boolean)).toBe(false));
  });

  it('missing core lane: added back empty, the other lanes keep their steps', () => {
    const lanes = DEFAULT_LANES.filter((l) => l.id !== 'tom');
    const grid = [row([0]), row([1]), row([2])];
    const s = load({ lanes, grid });
    expect(s.lanes.map((l) => l.id)).toEqual(CORE);
    expectShape(4);
    expect(onSteps(0)).toEqual([0]);
    expect(onSteps(1)).toEqual([]);
    expect(onSteps(2)).toEqual([1]);
    expect(onSteps(3)).toEqual([2]);
  });

  it('extra lane: kept with its steps, accents and flags after the core lanes', () => {
    const extra: Lane = { id: 'kick-2', category: 'kick', label: 'Kick 2', muted: true, solo: false };
    const lanes = [...DEFAULT_LANES, extra];
    const grid = [row([0]), row([]), row([]), row([]), row([3, 15])];
    const accents = grid.map(() => Array<Accent>(totalSteps).fill(1));
    accents[4][3] = 2;
    const s = load({ lanes, grid, accents });
    expect(s.lanes.map((l) => l.id)).toEqual([...CORE, 'kick-2']);
    expectShape(5);
    expect(s.lanes[4]).toEqual(extra);
    expect(onSteps(4)).toEqual([3, 15]);
    expect(s.accents[4][3]).toBe(2);
  });

  it('extra lane only, no core lanes: core lanes restored and the extra keeps its row', () => {
    const extra: Lane = { id: 'clap-2', category: 'clap', label: 'Clap 2', muted: false, solo: false };
    const s = load({ lanes: [extra], grid: [row([5])] });
    expect(s.lanes.map((l) => l.id)).toEqual([...CORE, 'clap-2']);
    expectShape(5);
    expect(onSteps(4)).toEqual([5]);
    [0, 1, 2, 3].forEach((i) => expect(onSteps(i)).toEqual([]));
  });

  it('grid rows shorter than bars x resolution are padded, keeping their steps', () => {
    const grid = DEFAULT_LANES.map((_, i) => row([i], resolution)); // one bar of two
    const s = load({ lanes: DEFAULT_LANES, grid });
    expect(s.bars).toBe(bars);
    expectShape(4);
    [0, 1, 2, 3].forEach((i) => expect(onSteps(i)).toEqual([i]));
  });

  it('grid rows longer than bars x resolution are cut at the pattern end', () => {
    const grid = DEFAULT_LANES.map(() => row([1, totalSteps - 1, totalSteps + 2], totalSteps + 8));
    load({ lanes: DEFAULT_LANES, grid });
    expectShape(4);
    [0, 1, 2, 3].forEach((i) => expect(onSteps(i)).toEqual([1, totalSteps - 1]));
  });

  it('malformed entries: bad rows read as empty, bad cells as off, bad lanes keep their row', () => {
    const lanes: unknown[] = [
      ...DEFAULT_LANES,
      null, // unreadable lane entry
      { id: 'tom-2', category: 'not-a-drum', label: 'x' }, // unknown category
      { id: 'kick', category: 'kick', label: 'Kick again' }, // duplicate id
    ];
    const grid: unknown[] = [
      row([0]),
      'not-a-row',
      [true, 1, 'yes', null, true],
      row([4]),
      row([6]),
      row([7]),
      row([8]),
    ];
    const accents: unknown[] = grid.map(() => Array(totalSteps).fill(7)); // invalid accent values
    const s = load({ lanes, grid, accents });
    expectShape(7);
    expect(s.lanes.slice(0, 4).map((l) => l.id)).toEqual(CORE);
    expect(onSteps(0)).toEqual([0]);
    expect(onSteps(1)).toEqual([]);
    expect(onSteps(2)).toEqual([0, 4]);
    expect(onSteps(3)).toEqual([4]);
    // Rows 4..6 had unreadable lane entries; each keeps its steps under a
    // fresh, unique lane id.
    expect([4, 5, 6].map(onSteps)).toEqual([[6], [7], [8]]);
    const ids = s.lanes.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    s.lanes.slice(4).forEach((l) => expect(l.category).toBe('kick'));
    s.accents.forEach((r) => r.forEach((a) => expect(a).toBe(1)));
  });

  it('a non-numeric resolution falls back to the default instead of failing the load', () => {
    const s = load({ resolution: 'x', lanes: DEFAULT_LANES, grid: [], bpm: 99 });
    expect(s.bpm).toBe(99);
    expect(s.resolution).toBe(16);
    expect(s.lanes.map((l) => l.id)).toEqual(CORE);
    s.grid.forEach((r) => expect(r).toHaveLength(bars * 16));
  });
});

// Second-opinion review 2026-10-04: restoreLanesAndGrid does not apply
// MAX_LANES (only addLane does). This pins down the CURRENT behaviour for an
// oversized save so a later change (notice / cap / refuse) is a visible,
// deliberate diff. It is not an endorsement of the behaviour; the choice is
// with the owner. MAX_LANES = 8 is a scoping choice (DECISIONS.md P2-17), not
// a technical limit.
describe('loadSequencerState with more lanes than MAX_LANES (current behaviour)', () => {
  const STORAGE_KEY = 'BeatBayashi.sequencer';
  const bars = 1;
  const resolution = 8;
  const totalSteps = bars * resolution;

  beforeEach(() => {
    localStorage.clear();
    useSequencerStore.setState(useSequencerStore.getInitialState());
  });

  function oversizedSave(count: number) {
    const extra: Lane[] = Array.from({ length: count - DEFAULT_LANES.length }, (_, i) => ({
      id: `tom-${i + 2}`,
      category: 'tom',
      label: `Tom ${i + 2}`,
      muted: false,
      solo: false,
    }));
    const lanes = [...DEFAULT_LANES, ...extra];
    return {
      version: PATTERN_FORMAT_VERSION,
      bpm: 120,
      bars,
      resolution,
      lanes,
      grid: lanes.map((_, i) => Array.from({ length: totalSteps }, (_, s) => s === i % totalSteps)),
    };
  }

  it('loads every saved lane and its steps (10 > 8), no data dropped', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oversizedSave(10)));
    loadSequencerState();
    const s = useSequencerStore.getState();
    expect(s.lanes).toHaveLength(10);
    expect(s.grid).toHaveLength(10);
    expect(s.accents).toHaveLength(10);
    expect(s.lanes[9]).toMatchObject({ id: 'tom-7', category: 'tom', label: 'Tom 7' });
    expect(s.grid[9].flatMap((on, i) => (on ? [i] : []))).toEqual([9 % totalSteps]);
  });

  it('after such a load, addLane refuses (returns null) and removeLane still works', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oversizedSave(10)));
    loadSequencerState();
    expect(useSequencerStore.getState().addLane('kick')).toBeNull();
    expect(useSequencerStore.getState().lanes).toHaveLength(10);
    useSequencerStore.getState().removeLane('tom-7');
    expect(useSequencerStore.getState().lanes).toHaveLength(9);
  });

  it('the next save writes all of them back (round trip keeps the extra lanes)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oversizedSave(10)));
    loadSequencerState();
    saveSequencerState();
    const written = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(written.lanes).toHaveLength(10);
    expect(written.grid).toHaveLength(10);
  });

  // Owner decision 2026-10-04 (option B): keep loading everything, show a notice.
  it.each([9, 10])('lanesAboveLimit reports N after loading an N-lane save (N=%i)', (n) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oversizedSave(n)));
    loadSequencerState();
    expect(lanesAboveLimit(useSequencerStore.getState().lanes)).toBe(n);
  });

  it('lanesAboveLimit is null for an 8-lane save', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oversizedSave(8)));
    loadSequencerState();
    expect(useSequencerStore.getState().lanes).toHaveLength(8);
    expect(lanesAboveLimit(useSequencerStore.getState().lanes)).toBeNull();
  });

  it('lanesAboveLimit turns null once lanes are removed down to 8', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oversizedSave(10)));
    loadSequencerState();
    useSequencerStore.getState().removeLane('tom-7');
    expect(lanesAboveLimit(useSequencerStore.getState().lanes)).toBe(9);
    useSequencerStore.getState().removeLane('tom-6');
    expect(lanesAboveLimit(useSequencerStore.getState().lanes)).toBeNull();
  });
});
