// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
import { create } from 'zustand';
import { type Accent, DEFAULT_ACCENT } from '../accent';
import { clampMasterDb, initMasterDb, persistMasterDb } from './masterVolume';
import {
  CORE_LANE_IDS,
  DEFAULT_LANES,
  DRUM_IDS,
  MAX_LANES,
  nextLaneLabel,
  type DrumId,
  type Lane,
} from '../audio/synthPresets';

/** Steps per bar. 2 = half notes, 32 = 32nd notes. */
export type Resolution = 2 | 4 | 8 | 16 | 32;

export const RESOLUTIONS: Resolution[] = [2, 4, 8, 16, 32];

/** Swing pushes every other step later by this much of a step's length, at
 *  most (a classic MPC-style swing range; 0 is straight time). */
export const MAX_SWING = 75;

/** Bar count limits. Owner decision 2026-09-29: a pattern starts at 1 bar and
 *  the user grows it one bar at a time with "+" up to 32 (the backend's
 *  Pattern.BARS_MAX mirrors this). */
export const MIN_BARS = 1;
export const MAX_BARS = 32;

/** Tempo limits, shared by setBPM and the saved-state loader. */
const MIN_BPM = 20;
const MAX_BPM = 300;

/** Clamps anything (including NaN/non-numbers from a corrupted save) into a
 *  whole bar count in MIN_BARS..MAX_BARS. */
export function clampBars(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : MIN_BARS;
  return Math.min(MAX_BARS, Math.max(MIN_BARS, n));
}

interface SequencerData {
  isPlaying: boolean;
  currentStep: number;
  bpm: number;
  bars: number;
  resolution: Resolution;
  /** One row per lane, in the same order as `grid`'s rows (P2-17). */
  lanes: Lane[];
  grid: boolean[][];
  /** Sub-sound steps (owner request 2026-10-06): `subGrid[lane][sub][step]`,
   *  always SUB_ROWS rows per lane so every resize keeps one shape. Layer 0
   *  (the main sound) plays on `grid`; layer k >= 1 plays on subGrid[lane][k-1]. */
  subGrid: boolean[][][];
  /** Per-cell accent, same shape as `grid`. Only meaningful where `grid` is
   *  true — an off step's accent is whatever it was last set to. */
  accents: Accent[][];
  /** 0..MAX_SWING, percent of a step's length that odd-indexed steps are
   *  delayed by. */
  swing: number;
  /** Shared master level, dB (owner decision 2026-09-27/28: replaces the old
   *  linear 0..1 `masterVolume`; see `./masterVolume.ts` for the shared
   *  `grammarouban.masterDb` storage key + one-time migration). */
  masterDb: number;
  selectedDrum: string;
}

export interface SequencerState extends SequencerData {
  togglePlayback: () => void;
  stop: () => void;
  setBPM: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setCurrentStep: (step: number) => void;
  setGridCell: (drumIndex: number, stepIndex: number, active: boolean) => void;
  toggleGridCell: (drumIndex: number, stepIndex: number) => void;
  /** Cycles a step through off -> weak -> mid -> strong -> off. This is what
   *  the grid's step buttons call; toggleGridCell/setGridCell stay plain
   *  on/off for callers (presets, tests) that don't care about accent. */
  cycleAccent: (drumIndex: number, stepIndex: number) => void;
  /** Sets and persists the shared master level (dB), clamped to the shared
   *  minimum .. 120% (clampMasterDb, ./masterVolume.ts). */
  setMasterDb: (db: number) => void;
  setSelectedDrum: (drumId: string) => void;
  /** Appends a new lane of this category (a copy of the category's own
   *  presets, an empty step row). Returns the new lane's id, or null if
   *  already at MAX_LANES. The caller still has to build the audio side
   *  (AudioEngine.addLane) — this only manages the grid/lane list. */
  addLane: (category: DrumId) => string | null;
  /** Removes an added lane (never one of the original four — see
   *  CORE_LANE_IDS). Returns whether it actually removed one. */
  removeLane: (laneId: string) => boolean;
  /** Toggles one lane's own muted flag (ISSUE-BEATBOX-011). Does not touch
   *  solo — a lane can be both muted and soloed at once; isLaneAudible
   *  resolves what that combination actually sounds like. */
  toggleMute: (laneId: string) => void;
  /** Toggles one lane's own solo flag (ISSUE-BEATBOX-011). */
  toggleSolo: (laneId: string) => void;
  /** Toggles one sub-sound step on/off. A sub hit uses the accent stored
   *  for that step in `accents`. */
  toggleSubCell: (laneIndex: number, subIndex: number, stepIndex: number) => void;
  /** Call after AudioEngine.addLayer created layer index subIndex + 1: that
   *  sub row starts as a copy of the main steps, so a new sub sounds with
   *  the main exactly as before sub steps existed. */
  subLayerAdded: (laneId: string, subIndex: number) => void;
  /** Call after AudioEngine.removeLayer removed layer index subIndex + 1:
   *  later sub rows shift up to follow their layers. */
  subLayerRemoved: (laneId: string, subIndex: number) => void;
  resetGrid: () => void;
  setGridConfig: (bars: number, resolution: Resolution) => void;
  setBars: (bars: number) => void;
  /** Appends one empty bar (all steps off); no-op at MAX_BARS. */
  addBar: () => void;
  /** Drops the last bar; no-op at MIN_BARS. The caller confirms first when
   *  lastBarHasNotes() is true. */
  removeLastBar: () => void;
  /** True if any lane has a step on in the last bar. */
  lastBarHasNotes: () => boolean;
  /** True after loadSequencerState refused a saved pattern (invalid or
   *  too-new version); the grid shows a dismissible notice. Not saved. */
  loadRefused: boolean;
  dismissLoadRefused: () => void;
  setResolution: (resolution: Resolution) => void;
  loadPattern: (pattern: number[][], patternResolution: number) => void;
  checkResolutionLoss: (newResolution: Resolution) => (number | null);
  checkBarLoss: (newBars: number) => (number | null);
  checkResolutionLossImpl: (newResolution: Resolution) => (number | null);
  checkBarLossImpl: (newBars: number) => (number | null);
}

/** Sub rows kept per lane: MAX_LAYERS_PER_VOICE (3) minus the main layer. */
export const SUB_ROWS = 2;

const DEFAULT_BARS = 1;
const DEFAULT_RESOLUTION = 16;

const createGrid = (laneCount: number, bars: number, resolution: Resolution): boolean[][] => {
  const totalSteps = bars * resolution;
  return Array.from({ length: laneCount }, () => Array(totalSteps).fill(false));
};

const createSubGrid = (laneCount: number, bars: number, resolution: Resolution): boolean[][][] =>
  Array.from({ length: laneCount }, () =>
    Array.from({ length: SUB_ROWS }, () => Array(bars * resolution).fill(false))
  );

/** Applies the same per-row transform to every sub row of every lane. */
function mapSubRows(subGrid: boolean[][][], fn: (row: boolean[]) => boolean[]): boolean[][][] {
  return subGrid.map((rows) => rows.map((row) => fn(row)));
}

/** Sub rows that follow the main row exactly (migration and presets). */
export function subRowsFromMain(row: boolean[]): boolean[][] {
  return Array.from({ length: SUB_ROWS }, () => [...row]);
}

const createAccents = (laneCount: number, bars: number, resolution: Resolution): Accent[][] => {
  const totalSteps = bars * resolution;
  return Array.from({ length: laneCount }, () => Array(totalSteps).fill(DEFAULT_ACCENT));
};

/** `${category}-2`, `${category}-3`, ... — the first id past that category's
 *  own name (already taken by the original lane, if this category has one). */
function nextLaneId(category: DrumId, existingLanes: Lane[]): string {
  let n = 2;
  while (existingLanes.some((lane) => lane.id === `${category}-${n}`)) n++;
  return `${category}-${n}`;
}

/**
 * ISSUE-BEATBOX-011: whether `laneId` should actually be heard, given every
 * lane's own muted/solo flags. Pure so both the AudioEngine-driving effect
 * (App.tsx) and tests can call it without a store or an engine.
 *
 * Rule: if any lane is soloed, only soloed lanes play — a muted+soloed lane
 * is still audible, because solo narrows the set down to itself regardless
 * of mute (this is the literal rule from ISSUE-BEATBOX-011 §2: "solo が1本
 * でもあれば solo のレーンだけ"). With no solo anywhere, mute is what
 * decides: every lane plays except the muted ones.
 */
export function isLaneAudible(lanes: Lane[], laneId: string): boolean {
  const lane = lanes.find((l) => l.id === laneId);
  if (!lane) return false;
  const anySolo = lanes.some((l) => l.solo);
  return anySolo ? lane.solo : !lane.muted;
}

/**
 * Lane count when it is above MAX_LANES, otherwise null. Only a loaded save
 * can get here (addLane caps at MAX_LANES); such a save is kept whole and the
 * grid shows a notice instead (owner decision 2026-10-04, option B).
 */
export function lanesAboveLimit(lanes: readonly Lane[]): number | null {
  return lanes.length > MAX_LANES ? lanes.length : null;
}

export const useSequencerStore = create<SequencerState>((set) => ({
  loadRefused: false,
  dismissLoadRefused: () => set({ loadRefused: false }),
  isPlaying: false,
  currentStep: 0,
  bpm: 120,
  bars: DEFAULT_BARS,
  resolution: DEFAULT_RESOLUTION,
  lanes: DEFAULT_LANES,
  grid: createGrid(DEFAULT_LANES.length, DEFAULT_BARS, DEFAULT_RESOLUTION),
  subGrid: createSubGrid(DEFAULT_LANES.length, DEFAULT_BARS, DEFAULT_RESOLUTION),
  accents: createAccents(DEFAULT_LANES.length, DEFAULT_BARS, DEFAULT_RESOLUTION),
  swing: 0,
  masterDb: initMasterDb(),
  selectedDrum: 'kick',

  // currentStep is the step that is sounding (and lit) while playing. Pausing
  // leaves the cursor on the step that plays when Play is pressed again, which
  // is the next one; starting from a stop (Reset sets 0) is unchanged.
  togglePlayback: () =>
    set((state) =>
      state.isPlaying
        ? {
            isPlaying: false,
            currentStep: (state.currentStep + 1) % Math.max(1, state.bars * state.resolution),
          }
        : { isPlaying: true }
    ),
  stop: () => set({ isPlaying: false, currentStep: 0 }),
  setBPM: (bpm) => set({ bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, bpm)) }),
  setSwing: (swing) => set({ swing: Math.max(0, Math.min(MAX_SWING, swing)) }),
  setCurrentStep: (step) => set({ currentStep: step }),

  setGridCell: (drumIndex, stepIndex, active) =>
    set((state) => {
      const newGrid = state.grid.map((row) => [...row]);
      newGrid[drumIndex][stepIndex] = active;
      return { grid: newGrid };
    }),

  toggleGridCell: (drumIndex, stepIndex) =>
    set((state) => {
      const newGrid = state.grid.map((row) => [...row]);
      newGrid[drumIndex][stepIndex] = !newGrid[drumIndex][stepIndex];
      return { grid: newGrid };
    }),

  cycleAccent: (drumIndex, stepIndex) =>
    set((state) => {
      const newGrid = state.grid.map((row) => [...row]);
      const newAccents = state.accents.map((row) => [...row]);
      const isOn = newGrid[drumIndex][stepIndex];
      const accent = newAccents[drumIndex][stepIndex] ?? DEFAULT_ACCENT;

      if (!isOn) {
        // Off -> weak.
        newGrid[drumIndex][stepIndex] = true;
        newAccents[drumIndex][stepIndex] = 0;
      } else if (accent < 2) {
        newAccents[drumIndex][stepIndex] = (accent + 1) as Accent;
      } else {
        // Strong -> off. The accent value itself is left at 2 so the next
        // off->weak transition above always starts the cycle the same way.
        newGrid[drumIndex][stepIndex] = false;
      }

      return { grid: newGrid, accents: newAccents };
    }),

  toggleSubCell: (laneIndex, subIndex, stepIndex) =>
    set((state) => {
      const row = state.subGrid[laneIndex]?.[subIndex];
      if (!row || stepIndex < 0 || stepIndex >= row.length) return {};
      const subGrid = state.subGrid.map((rows) => rows.map((r) => [...r]));
      subGrid[laneIndex][subIndex][stepIndex] = !row[stepIndex];
      return { subGrid };
    }),

  subLayerAdded: (laneId, subIndex) =>
    set((state) => {
      const laneIdx = state.lanes.findIndex((l) => l.id === laneId);
      if (laneIdx === -1 || subIndex < 0 || subIndex >= SUB_ROWS) return {};
      const subGrid = state.subGrid.map((rows) => rows.map((r) => [...r]));
      subGrid[laneIdx][subIndex] = [...state.grid[laneIdx]];
      return { subGrid };
    }),

  subLayerRemoved: (laneId, subIndex) =>
    set((state) => {
      const laneIdx = state.lanes.findIndex((l) => l.id === laneId);
      if (laneIdx === -1 || subIndex < 0 || subIndex >= SUB_ROWS) return {};
      const subGrid = state.subGrid.map((rows) => rows.map((r) => [...r]));
      const rows = subGrid[laneIdx];
      rows.splice(subIndex, 1);
      rows.push(Array(state.bars * state.resolution).fill(false));
      return { subGrid };
    }),

  setMasterDb: (db) => {
    // Clamped to the shared minimum .. 120% (./masterVolume.ts).
    const bounded = clampMasterDb(db);
    persistMasterDb(bounded);
    set({ masterDb: bounded });
  },

  setSelectedDrum: (drumId) => set({ selectedDrum: drumId }),

  addLane: (category) => {
    const state = useSequencerStore.getState();
    if (state.lanes.length >= MAX_LANES) return null;

    const id = nextLaneId(category, state.lanes);
    const existingOfCategory = state.lanes.filter((lane) => lane.category === category).length;
    const lane: Lane = {
      id,
      category,
      label: nextLaneLabel(category, existingOfCategory),
      muted: false,
      solo: false,
    };
    const totalSteps = state.bars * state.resolution;

    set({
      lanes: [...state.lanes, lane],
      grid: [...state.grid, Array(totalSteps).fill(false)],
      subGrid: [...state.subGrid, subRowsFromMain(Array(totalSteps).fill(false))],
      accents: [...state.accents, Array(totalSteps).fill(DEFAULT_ACCENT)],
    });
    return id;
  },

  removeLane: (laneId) => {
    const state = useSequencerStore.getState();
    if (CORE_LANE_IDS.has(laneId)) return false;
    const index = state.lanes.findIndex((lane) => lane.id === laneId);
    if (index === -1) return false;

    set({
      lanes: state.lanes.filter((_, i) => i !== index),
      grid: state.grid.filter((_, i) => i !== index),
      subGrid: state.subGrid.filter((_, i) => i !== index),
      accents: state.accents.filter((_, i) => i !== index),
    });
    return true;
  },

  toggleMute: (laneId) =>
    set((state) => ({
      lanes: state.lanes.map((lane) =>
        lane.id === laneId ? { ...lane, muted: !lane.muted } : lane
      ),
    })),

  toggleSolo: (laneId) =>
    set((state) => ({
      lanes: state.lanes.map((lane) =>
        lane.id === laneId ? { ...lane, solo: !lane.solo } : lane
      ),
    })),

  resetGrid: () =>
    set((state) => ({
      grid: createGrid(state.lanes.length, state.bars, state.resolution),
      subGrid: createSubGrid(state.lanes.length, state.bars, state.resolution),
      accents: createAccents(state.lanes.length, state.bars, state.resolution),
      currentStep: 0,
      isPlaying: false,
    })),

  setGridConfig: (bars, resolution) =>
    set((state) => ({
      bars,
      resolution,
      grid: createGrid(state.lanes.length, bars, resolution),
      subGrid: createSubGrid(state.lanes.length, bars, resolution),
      accents: createAccents(state.lanes.length, bars, resolution),
      currentStep: 0,
      isPlaying: false,
    })),

  // Changing bars keeps whatever is already programmed. Growing repeats the
  // existing bars rather than adding silence: a second bar that starts as a
  // copy of the first is a usable starting point, an empty one is not.
  setBars: (rawBars) =>
    set((state) => {
      const bars = clampBars(rawBars);
      const totalSteps = bars * state.resolution;
      const sourceLength = state.bars * state.resolution;
      const repeat = (row: boolean[]) => {
        const next = Array(totalSteps).fill(false);
        for (let i = 0; i < totalSteps; i++) {
          next[i] = row[i % sourceLength] ?? false;
        }
        return next;
      };
      const grid = state.grid.map(repeat);
      const subGrid = mapSubRows(state.subGrid, repeat);
      const accents = state.accents.map((row) => {
        const next: Accent[] = Array(totalSteps).fill(DEFAULT_ACCENT);
        for (let i = 0; i < totalSteps; i++) {
          next[i] = row[i % sourceLength] ?? DEFAULT_ACCENT;
        }
        return next;
      });
      return { bars, grid, subGrid, accents, currentStep: 0 };
    }),

  // Owner decision 2026-09-29: "+" adds an *empty* bar (existing bars keep
  // their pattern untouched), unlike setBars' repeat-on-grow.
  addBar: () =>
    set((state) => {
      if (state.bars >= MAX_BARS) return {};
      const extra = state.resolution;
      return {
        bars: state.bars + 1,
        grid: state.grid.map((row) => [...row, ...Array(extra).fill(false)]),
        subGrid: mapSubRows(state.subGrid, (row) => [...row, ...Array(extra).fill(false)]),
        accents: state.accents.map((row) => [
          ...row,
          ...Array<Accent>(extra).fill(DEFAULT_ACCENT),
        ]),
      };
    }),

  removeLastBar: () =>
    set((state) => {
      if (state.bars <= MIN_BARS) return {};
      const bars = state.bars - 1;
      const total = bars * state.resolution;
      return {
        bars,
        grid: state.grid.map((row) => row.slice(0, total)),
        subGrid: mapSubRows(state.subGrid, (row) => row.slice(0, total)),
        accents: state.accents.map((row) => row.slice(0, total)),
        currentStep: state.currentStep >= total ? 0 : state.currentStep,
      };
    }),

  lastBarHasNotes: (): boolean => {
    const state = useSequencerStore.getState();
    const start = (state.bars - 1) * state.resolution;
    const mainHas = state.grid.some((row) => row.slice(start).some(Boolean));
    if (mainHas) return true;
    // Sub-sound rows count too: removing the bar would drop them silently.
    return state.subGrid.some((rows) => rows.some((row) => row.slice(start).some(Boolean)));
  },

  // Re-times the existing pattern so a beat stays on the same beat: doubling
  // the resolution spreads each step twice as far apart.
  setResolution: (resolution) =>
    set((state) => {
      const ratio = resolution / state.resolution;
      const totalSteps = state.bars * resolution;
      const grid = state.lanes.map(() => Array(totalSteps).fill(false));
      const accents = state.lanes.map(() => Array<Accent>(totalSteps).fill(DEFAULT_ACCENT));

      state.grid.forEach((row, laneIdx) => {
        row.forEach((on, i) => {
          if (!on) return;
          const target = Math.round(i * ratio);
          if (target < totalSteps) {
            grid[laneIdx][target] = true;
            accents[laneIdx][target] = state.accents[laneIdx]?.[i] ?? DEFAULT_ACCENT;
          }
        });
      });

      const subGrid = mapSubRows(state.subGrid, (row) => {
        const next = Array(totalSteps).fill(false);
        row.forEach((on, i) => {
          const target = Math.round(i * ratio);
          if (on && target < totalSteps) next[target] = true;
        });
        return next;
      });

      return { resolution, grid, subGrid, accents, currentStep: 0 };
    }),

  // Stamps an authored pattern onto the current grid, stretching or squeezing
  // it to whatever resolution and bar count the user is on. Presets carry no
  // accent data, so every activated step lands at the default (mid) accent.
  loadPattern: (pattern, patternResolution) =>
    set((state) => {
      const totalSteps = state.bars * state.resolution;
      const ratio = state.resolution / patternResolution;
      const grid = state.lanes.map(() => Array(totalSteps).fill(false));
      const accents = state.lanes.map(() => Array<Accent>(totalSteps).fill(DEFAULT_ACCENT));

      pattern.forEach((row, laneIdx) => {
        if (laneIdx >= grid.length) return;
        row.forEach((on, stepIdx) => {
          if (!on) return;
          // Repeat the one-bar source across however many bars are showing.
          for (let bar = 0; bar < state.bars; bar++) {
            const target =
              bar * state.resolution + Math.round(stepIdx * ratio);
            if (target < totalSteps) grid[laneIdx][target] = true;
          }
        });
      });

      // Presets are authored for the main sound; subs follow them, as they
      // did before sub steps existed.
      const subGrid = grid.map((row) => subRowsFromMain(row));
      return { grid, subGrid, accents, currentStep: 0 };
    }),

  checkResolutionLoss: (newResolution: Resolution): (number | null) => {
    // Returns the number of steps lost if downsampling, or null if no loss
    return useSequencerStore.getState().checkResolutionLossImpl(newResolution);
  },

  checkBarLoss: (newBars: number): (number | null) => {
    // Returns the number of steps lost if reducing bar count, or null if no loss
    return useSequencerStore.getState().checkBarLossImpl(newBars);
  },

  checkResolutionLossImpl: (newResolution: Resolution) => {
    const state = useSequencerStore.getState();
    if (newResolution >= state.resolution) return null; // Upsampling is lossless

    const ratio = newResolution / state.resolution;
    const totalSteps = state.bars * newResolution;
    let lost = 0;

    state.grid.forEach((row: boolean[]) => {
      // setResolution writes each step to Math.round(i * ratio), so two steps
      // can land on the same slot and only one survives. Counting overflow
      // alone reported "nothing will be lost" right before a step vanished.
      const claimed = new Set<number>();

      row.forEach((on: boolean, i: number) => {
        if (!on) return;
        const target = Math.round(i * ratio);
        if (target >= totalSteps || claimed.has(target)) {
          lost += 1;
          return;
        }
        claimed.add(target);
      });
    });

    return lost > 0 ? lost : null;
  },

  checkBarLossImpl: (newBars: number) => {
    const state = useSequencerStore.getState();
    if (newBars >= state.bars) return null; // Growing is lossless

    const oldTotalSteps = state.bars * state.resolution;
    const newTotalSteps = newBars * state.resolution;
    let lost = 0;

    state.grid.forEach((row: boolean[]) => {
      for (let i = newTotalSteps; i < oldTotalSteps; i++) {
        if (row[i]) lost += 1;
      }
    });

    return lost > 0 ? lost : null;
  },
}));

// Manual save/load for localStorage
const STORAGE_KEY = 'BeatBayashi.sequencer';

/**
 * Pattern format version for the saved localStorage shape (`SequencerData`
 * below — not the Spring/mock-backend API pattern in docs/API-CONTRACT.md,
 * which has no version field and is out of scope here).
 *
 * Bumped for the owner's 2026-09-26 decision to allow up to 32 steps per bar.
 * Nothing about the saved shape actually changed to support that — `grid`
 * and `accents` were always sized to `bars * resolution` and `resolution`
 * already accepted 32 (RESOLUTIONS has included it since the 2026-08-20
 * 32nd-note-grid commit) — but from here on a *future* step-count or grid
 * shape change has somewhere to hang a migration. Every save before this
 * one has no `version` field at all; that absence is what "version 1"
 * means below, not a field that was ever actually written as `1`.
 */
export const PATTERN_FORMAT_VERSION = 3;
/* Version 3 (2026-10-06): adds `subGrid` (sub-sound steps). A version 1/2
 * save has none; it loads with every sub row a copy of its lane's main row,
 * which is exactly how it sounded before (every layer played on the main
 * steps). */

export function saveSequencerState(): void {
  const state = useSequencerStore.getState();
  const data: SequencerData & { version: number } = {
    version: PATTERN_FORMAT_VERSION,
    isPlaying: false, // never persist playback state
    currentStep: 0,
    bpm: state.bpm,
    bars: state.bars,
    resolution: state.resolution,
    lanes: state.lanes,
    grid: state.grid,
    subGrid: state.subGrid,
    accents: state.accents,
    swing: state.swing,
    // Also written under the shared `grammarouban.masterDb` key (setMasterDb ->
    // persistMasterDb, ./masterVolume.ts) — that key, not this field, is what
    // every family service actually reads on load (initMasterDb ignores
    // this copy). Kept here only so this blob's own shape stays self-
    // contained/inspectable; a stale value here is harmless.
    masterDb: state.masterDb,
    selectedDrum: state.selectedDrum,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save sequencer state:', e);
  }
}

/**
 * Debounced autosave: persists 500ms after the last store change, so a burst
 * of edits (rapid taps, dragging across the grid) writes to localStorage once
 * instead of on every step. Complements `beforeunload`, which only catches a
 * clean exit — a crash or killed tab loses anything not already autosaved.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = useSequencerStore.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      saveSequencerState();
    }, 500);
  });

  return () => {
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** Saves from before P2-17 (lanes) have no `lanes` field at all. A saved one
 *  whose length no longer matches `grid` (corrupted, or truncated by a
 *  failed write) can't be trusted either — there's no way to know which
 *  lane a surviving row belonged to. Either way, this reconstructs a lanes
 *  array of the right length: the original four where possible, 'kick' for
 *  anything past that. It won't recover an added lane's real category, but
 *  it keeps the step data instead of discarding rows to fit. */
function fallbackLanesForGridLength(length: number): Lane[] {
  const lanes: Lane[] = DEFAULT_LANES.slice(0, length);
  while (lanes.length < length) {
    const n = lanes.length + 1;
    lanes.push({ id: `kick-${n}`, category: 'kick', label: `Kick ${n}`, muted: false, solo: false });
  }
  return lanes;
}

/** ISSUE-BEATBOX-011: saves from before mute/solo have `lanes` entries with
 *  no `muted`/`solo` fields at all (or, from a corrupted write, a non-boolean
 *  value). Either way this backfills `false` rather than trusting whatever
 *  was there, so a broken save never starts a lane muted with no visible way
 *  to tell — matching the field-by-field validation isValidSavedLayer already
 *  does for layers (AudioEngine.ts). */
function withLaneMuteSoloDefaults(lanes: Lane[]): Lane[] {
  return lanes.map((lane) => ({
    ...lane,
    muted: typeof lane.muted === 'boolean' ? lane.muted : false,
    solo: typeof lane.solo === 'boolean' ? lane.solo : false,
  }));
}

function isAccent(value: unknown): value is Accent {
  return value === 0 || value === 1 || value === 2;
}

/** A saved row fitted to `steps`: kept where it overlaps, padded with off
 *  steps if short, cut at the pattern's end if long. Anything that isn't a
 *  row, or a cell that isn't `true`, reads as off. */
function fitStepRow(row: unknown, steps: number): boolean[] {
  const cells: unknown[] = Array.isArray(row) ? row : [];
  return Array.from({ length: steps }, (_, i) => cells[i] === true);
}

function fitAccentRow(row: unknown, steps: number): Accent[] {
  const cells: unknown[] = Array.isArray(row) ? row : [];
  return Array.from({ length: steps }, (_, i) => {
    const cell = cells[i];
    return isAccent(cell) ? cell : DEFAULT_ACCENT;
  });
}

/** One saved lane entry, or null if it can't be read as a lane. A core id
 *  ('kick', 'tom', ...) always means that core lane, whatever category the
 *  entry claims, because core ids are fixed to their category. */
function readSavedLane(raw: unknown): Lane | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, category, label, muted, solo } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || id === '') return null;
  const core = DEFAULT_LANES.find((lane) => lane.id === id);
  const cat = core ? core.category : (category as DrumId);
  if (!DRUM_IDS.includes(cat)) return null;
  const defaultLabel = DEFAULT_LANES.find((lane) => lane.category === cat)?.label ?? id;
  return {
    id,
    category: cat,
    label: typeof label === 'string' && label !== '' ? label : defaultLabel,
    muted: muted === true,
    solo: solo === true,
  };
}

/**
 * Rebuilds lanes/grid/accents from a saved pattern so the result always has
 * the four core lanes (CORE_LANE_IDS — the app can't remove them, so a load
 * must not either) and every row is exactly `steps` long.
 *
 * - Lane/row pairing follows the P2-17 rule in docs/DECISIONS.md: when the
 *   saved `lanes` is missing or its length disagrees with `grid`, lanes are
 *   rebuilt from the grid's row count (fallbackLanesForGridLength), so the
 *   step data is kept. A `grid` that isn't an array at all is read as one
 *   empty row per saved lane.
 * - A lane entry that can't be read, or repeats an earlier id, keeps its row
 *   under a fresh 'kick' lane id rather than losing the steps.
 * - Any core lane still missing is added back with empty steps. Core lanes
 *   come first in their usual order, then the other lanes in saved order —
 *   the same order the app itself produces, since lanes are only appended.
 * - Accents follow their row when `accents` has one entry per grid row;
 *   otherwise every step gets the default accent (P2-16 fallback).
 */
function restoreLanesAndGrid(
  rawLanes: unknown,
  rawGrid: unknown,
  rawAccents: unknown,
  steps: number
): { lanes: Lane[]; grid: boolean[][]; accents: Accent[][] } {
  const rows: unknown[] = Array.isArray(rawGrid)
    ? rawGrid
    : Array.isArray(rawLanes)
      ? rawLanes.map(() => null)
      : [];
  const accentRows: unknown[] | null =
    Array.isArray(rawAccents) && rawAccents.length === rows.length ? rawAccents : null;
  const laneEntries: unknown[] =
    Array.isArray(rawLanes) && rawLanes.length === rows.length
      ? rawLanes
      : fallbackLanesForGridLength(rows.length);

  const read: (Lane | null)[] = [];
  const taken: Lane[] = [];
  for (const entry of laneEntries) {
    const lane = readSavedLane(entry);
    const unique = lane && !taken.some((t) => t.id === lane.id) ? lane : null;
    if (unique) taken.push(unique);
    read.push(unique);
  }

  const pairs = read.map((lane, i) => {
    let resolved = lane;
    if (!resolved) {
      const existing = taken.filter((t) => t.category === 'kick').length;
      resolved = {
        id: nextLaneId('kick', taken),
        category: 'kick',
        label: nextLaneLabel('kick', existing),
        muted: false,
        solo: false,
      };
      taken.push(resolved);
    }
    return { lane: resolved, row: rows[i], accents: accentRows ? accentRows[i] : null };
  });

  const core = DEFAULT_LANES.map(
    (def) =>
      pairs.find((p) => p.lane.id === def.id) ?? { lane: { ...def }, row: null, accents: null }
  );
  const extra = pairs.filter((p) => !CORE_LANE_IDS.has(p.lane.id));
  const ordered = [...core, ...extra];

  return {
    lanes: ordered.map((p) => p.lane),
    grid: ordered.map((p) => fitStepRow(p.row, steps)),
    accents: ordered.map((p) => fitAccentRow(p.accents, steps)),
  };
}

/**
 * Sub rows for the restored lanes. A save without `subGrid` (version 1/2)
 * gets every sub row copied from the main row, so playback is unchanged.
 * With one, each restored lane takes the saved rows of the saved lane with
 * the same id (restoreLanesAndGrid can reorder lanes); a lane with no saved
 * match also follows its main row.
 */
export function restoreSubGrid(
  lanes: Lane[],
  grid: boolean[][],
  rawSubGrid: unknown,
  rawLanes: unknown,
  steps: number
): boolean[][][] {
  const savedIds: (string | null)[] = Array.isArray(rawLanes)
    ? rawLanes.map((l) =>
        typeof l === 'object' && l !== null && typeof (l as { id?: unknown }).id === 'string'
          ? (l as { id: string }).id
          : null
      )
    : [];
  const savedRows: unknown[] | null =
    Array.isArray(rawSubGrid) && rawSubGrid.length === savedIds.length ? rawSubGrid : null;
  return lanes.map((lane, i) => {
    const at = savedRows ? savedIds.indexOf(lane.id) : -1;
    const rows: unknown = at >= 0 && savedRows ? savedRows[at] : null;
    if (!Array.isArray(rows)) return subRowsFromMain(grid[i]);
    return Array.from({ length: SUB_ROWS }, (_, k) =>
      Array.isArray(rows[k]) ? fitStepRow(rows[k], steps) : [...grid[i]]
    );
  });
}

export function loadSequencerState(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const data: SequencerData & { version?: unknown } = JSON.parse(saved);
    // A save written by a newer build than this one is refused outright
    // rather than partially trusted: we don't know what a future version
    // field might mean (a grid shape this code can't interpret, for
    // instance), and guessing is how BEATBOX-027-style corruption happens.
    // A missing `version` is every save from before this field existed
    // (implicitly "version 1") and loads as it always has — the shape
    // hasn't changed, so there is nothing to migrate yet beyond stamping
    // the version on next save.
    // A version that is present but not a non-negative integer (negative,
    // fractional, a string, null) was never written by any build, so it is
    // refused the same way rather than loaded as an old save.
    if (
      data.version !== undefined &&
      !(typeof data.version === 'number' && Number.isInteger(data.version) && data.version >= 0)
    ) {
      console.warn(
        `Saved sequencer state has an invalid version (${JSON.stringify(data.version)}); ` +
          'ignoring it rather than risk misreading it.'
      );
      useSequencerStore.setState({ loadRefused: true });
      return;
    }
    if (typeof data.version === 'number' && data.version > PATTERN_FORMAT_VERSION) {
      console.warn(
        `Saved sequencer state is version ${data.version}, newer than this build supports ` +
          `(${PATTERN_FORMAT_VERSION}); ignoring it rather than risk misreading it.`
      );
      useSequencerStore.setState({ loadRefused: true });
      return;
    }
    // A save outside 1..MAX_BARS (hand-edited, corrupted) is clamped, and a
    // resolution this build doesn't offer falls back to the default, so
    // `steps` is always a usable row length below.
    data.bars = clampBars(data.bars);
    if (!RESOLUTIONS.includes(data.resolution)) data.resolution = DEFAULT_RESOLUTION;
    const steps = data.bars * data.resolution;
    const rawLanes: unknown = data.lanes;
    const restored = restoreLanesAndGrid(data.lanes, data.grid, data.accents, steps);
    data.lanes = withLaneMuteSoloDefaults(restored.lanes);
    data.grid = restored.grid;
    data.subGrid = restoreSubGrid(data.lanes, restored.grid, data.subGrid, rawLanes, steps);
    data.accents = restored.accents;
    if (typeof data.swing !== 'number' || !Number.isFinite(data.swing)) {
      data.swing = 0;
    }
    // Only these fields reach the store, each within the app's ranges: a
    // saved or hand-edited blob can't replace an action such as setBPM or
    // start playback. A missing or unreadable bpm or selectedDrum leaves the
    // store's value alone. The shared `grammarouban.masterDb` key
    // (./masterVolume.ts), not this blob's own `masterDb` copy, is
    // authoritative.
    const current = useSequencerStore.getState();
    useSequencerStore.setState({
      isPlaying: false,
      currentStep: 0,
      bpm:
        typeof data.bpm === 'number' && Number.isFinite(data.bpm)
          ? Math.max(MIN_BPM, Math.min(MAX_BPM, data.bpm))
          : current.bpm,
      bars: data.bars,
      resolution: data.resolution,
      lanes: data.lanes,
      grid: data.grid,
      subGrid: data.subGrid,
      accents: data.accents,
      swing: Math.max(0, Math.min(MAX_SWING, data.swing)),
      masterDb: initMasterDb(),
      selectedDrum:
        typeof data.selectedDrum === 'string' && data.selectedDrum !== ''
          ? data.selectedDrum
          : current.selectedDrum,
    });
  } catch (e) {
    console.warn('Failed to load sequencer state:', e);
  }
}
