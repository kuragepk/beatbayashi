// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// P2-15: the playhead highlight (SequencerGrid's `isCurrent` styling) had no
// test coverage — App.test.tsx stubs SequencerGrid out entirely to dodge
// jsdom's missing ResizeObserver. This file exercises the real component to
// confirm the currently playing step is actually the one that lights up, on
// every lane, and that it moves as `currentStep` advances rather than
// sticking to wherever it started.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSequencerStore } from '../store/sequencerStore';
import { useThemeStore } from '../theme/themeStore';
import {
  UNIT_HEIGHT_IN_PADS,
  padSizeForLabel,
  instrumentGap,
  labelLineFitPx,
  ADD_LANE_ROW_MIN_PX,
  SequencerGrid,
  addLabelIsTooWide,
  addLaneRowHeight,
  compactLabelLayout,
  gridPadX,
  COMPACT_ICON_ONLY_LABEL_PX,
  COMPACT_MIN_PAD_PX,
} from './SequencerGrid';
import { DEFAULT_LANES, DEFAULT_LAYERS } from '../audio/synthPresets';
import type { AudioEngine } from '../audio/AudioEngine';

// jsdom has no ResizeObserver; the component only uses it to size cells to
// the container width, which this test doesn't care about.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// The real AudioEngine imports Tone.js, whose ESM build omits file
// extensions on its internal imports; Node's strict ESM resolver (used for
// externalized deps under jsdom) rejects that, while Vite's own transform
// (used elsewhere) tolerates it. This test passes audioEngine={null} anyway,
// so the real module is never needed — only the MAX_LAYERS_PER_VOICE export.
vi.mock('../audio/AudioEngine', () => ({ MAX_LAYERS_PER_VOICE: 3 }));

// Owner decision #72 (2026-09-27): the playhead border now reads through the
// --app-* theme bridge (theme-bridge.css) with the original hex kept as its
// fallback, so a themed session actually restyles it. jsdom's CSSOM cannot
// resolve var() to rgb() (there is no live cascade in this test's plain
// render), so it reports the literal specified value back unchanged.
const CURRENT_BORDER = 'var(--app-selection, #00ff88)';

function cellFor(drumLabel: string, stepInBar: number) {
  return screen.getByLabelText(`${drumLabel}, bar 1, step ${stepInBar}`);
}

// Since 2026-10-19 the default text is 16 px (owner), and at that size the
// unmeasured container (clientWidth 0 in jsdom) gets the compact lane label,
// which keeps M/S, the selects and the remove button under the pads. Tests
// about the full label measure a 1920 px desktop width instead.
function withWidth<T>(px: number, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return px;
    },
  });
  try {
    return run();
  } finally {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
    } else {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  }
}

describe('SequencerGrid — playhead follows currentStep', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    useSequencerStore.setState({
      bars: 1,
      resolution: 16,
      grid: useSequencerStore.getState().grid.map(() => Array(16).fill(false)),
      isPlaying: true,
      currentStep: 5,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('highlights the current step on every drum lane', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);

    // currentStep is 0-indexed; the UI labels steps from 1.
    expect(cellFor('Kick', 6).style.borderColor).toBe(CURRENT_BORDER);
    expect(cellFor('Tom', 6).style.borderColor).toBe(CURRENT_BORDER);
    expect(cellFor('Cymbal', 6).style.borderColor).toBe(CURRENT_BORDER);
    expect(cellFor('Clap', 6).style.borderColor).toBe(CURRENT_BORDER);

    // No other step should carry the playhead color.
    expect(cellFor('Kick', 5).style.borderColor).not.toBe(CURRENT_BORDER);
    expect(cellFor('Kick', 7).style.borderColor).not.toBe(CURRENT_BORDER);
  });

  it('moves the highlight when currentStep advances', () => {
    const { rerender } = render(
      <SequencerGrid audioEngine={null} onSoundChange={() => {}} />,
    );

    expect(cellFor('Kick', 6).style.borderColor).toBe(CURRENT_BORDER);

    act(() => {
      useSequencerStore.setState({ currentStep: 6 });
    });
    rerender(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);

    expect(cellFor('Kick', 6).style.borderColor).not.toBe(CURRENT_BORDER);
    expect(cellFor('Kick', 7).style.borderColor).toBe(CURRENT_BORDER);
  });

  it('shows no playhead when playback is stopped', () => {
    useSequencerStore.setState({ isPlaying: false });
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);

    for (let step = 1; step <= 16; step++) {
      expect(cellFor('Kick', step).style.borderColor).not.toBe(CURRENT_BORDER);
    }
  });
});

describe('SequencerGrid — accent cycling (P2-16)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    useSequencerStore.setState({
      bars: 1,
      resolution: 16,
      isPlaying: false,
      grid: useSequencerStore.getState().grid.map(() => Array(16).fill(false)),
      accents: useSequencerStore.getState().accents.map(() => Array(16).fill(1)),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('cycles a step through off -> weak -> mid -> strong -> off on repeated clicks', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const cell = cellFor('Kick', 1);

    expect(cell.getAttribute('aria-pressed')).toBe('false');
    expect(cell.getAttribute('aria-label')).toBe('Kick, bar 1, step 1');

    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    expect(cell.getAttribute('aria-label')).toBe('Kick, bar 1, step 1, weak accent');

    fireEvent.click(cell);
    expect(cell.getAttribute('aria-label')).toBe('Kick, bar 1, step 1, mid accent');

    fireEvent.click(cell);
    expect(cell.getAttribute('aria-label')).toBe('Kick, bar 1, step 1, strong accent');

    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('false');
    expect(cell.getAttribute('aria-label')).toBe('Kick, bar 1, step 1');
  });

  it('only changes the one cell clicked', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);

    fireEvent.click(cellFor('Kick', 1));

    expect(cellFor('Kick', 2).getAttribute('aria-pressed')).toBe('false');
    expect(cellFor('Tom', 1).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('SequencerGrid — cell sizing (owner request 2026-09-24: square cells)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    useSequencerStore.setState({
      bars: 1,
      resolution: 16,
      isPlaying: false,
      lanes: DEFAULT_LANES,
      grid: DEFAULT_LANES.map(() => Array(16).fill(false)),
      accents: DEFAULT_LANES.map(() => Array(16).fill(1)),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('a main lane cell is square: height equals width', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const cell = cellFor('Kick', 1);

    const width = parseFloat(cell.style.width);
    const height = parseFloat(cell.style.height);
    expect(width).toBeGreaterThan(0);
    expect(height).toBe(Math.round(width));
  });

  it('an added lane (P2-17) cell is the same square as a main cell (owner 2026-10-06: equal pads)', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    fireEvent.click(screen.getByTitle('Add another Kick-family lane'));

    const mainCell = cellFor('Kick', 1);
    const addedCell = cellFor('Kick 2', 1);
    expect(addedCell.style.width).toBe(mainCell.style.width);
    expect(addedCell.style.height).toBe(mainCell.style.height);
  });

  it('pads are whole pixels, square, at most 40 px', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const cell = cellFor('Kick', 1);
    const width = parseFloat(cell.style.width);
    expect(Number.isInteger(width)).toBe(true);
    expect(width).toBeLessThanOrEqual(40);
    expect(parseFloat(cell.style.height)).toBe(width);
  });

  it('keeps a 12 px pad floor on a narrow container (half the old 24 px floor)', () => {
    const original = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientWidth',
    );
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 200;
      },
    });

    try {
      render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
      const cell = cellFor('Kick', 1);
      const width = parseFloat(cell.style.width);
      expect(width).toBeGreaterThanOrEqual(12);
      expect(parseFloat(cell.style.height)).toBe(width);
    } finally {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
      } else {
        delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
      }
    }
  });

  it('every lane has one sub row of half-height frames under the pads, same columns', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const rows = screen.getAllByTestId('lane-steps');
    const templates = rows.map((r) => r.style.gridTemplateColumns);
    expect(new Set(templates).size).toBe(1);
    const subs = rows[0].querySelectorAll('[data-testid="sub-step"]');
    expect(subs.length).toBe(16);
    const main = cellFor('Kick', 1);
    const sub = subs[0] as HTMLElement;
    expect(sub.style.width).toBe(main.style.width);
    expect(parseFloat(sub.style.height)).toBe(Math.round(parseFloat(main.style.width) / 2));
    expect(sub.style.gridColumn).toBe(main.style.gridColumn);
  });

  it('with no sub sound, a sub frame is inactive: clicking does nothing, tooltip says why', () => {
    // An engine whose lanes have only their main sound.
    const mainOnly = {
      getLayers: (laneId: string) => [
        DEFAULT_LAYERS[DEFAULT_LANES.find((l) => l.id === laneId)!.category][0],
      ],
    } as unknown as AudioEngine;
    render(<SequencerGrid audioEngine={mainOnly} onSoundChange={() => {}} />);
    const sub = screen.getAllByTestId('lane-steps')[0].querySelector(
      '[data-testid="sub-step"]'
    ) as HTMLElement;
    expect(sub.getAttribute('aria-disabled')).toBe('true');
    expect(sub.title).toMatch(/Add a sub sound first/);
    const before = JSON.stringify(useSequencerStore.getState().subGrid);
    fireEvent.click(sub);
    expect(JSON.stringify(useSequencerStore.getState().subGrid)).toBe(before);
  });

  it('with a sub sound (the shipped two-layer default), a sub cell toggles only the sub step', () => {
    useSequencerStore.setState({
      subGrid: DEFAULT_LANES.map(() => [Array(16).fill(false), Array(16).fill(false)]),
    });
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const sub = screen.getAllByTestId('lane-steps')[0].querySelector(
      '[data-testid="sub-step"]'
    ) as HTMLElement;
    expect(sub.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(sub);
    expect(useSequencerStore.getState().subGrid[0][0][0]).toBe(true);
    expect(useSequencerStore.getState().grid[0][0]).toBe(false);
  });

  it('numbers the main sound 1 next to its select', () =>
    withWidth(1920, () => {
      render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
      const numbers = screen.getAllByTestId('sound-number').map((n) => n.textContent);
      expect(numbers.filter((n) => n === '1').length).toBe(DEFAULT_LANES.length);
    }));
});

describe('SequencerGrid — lane add/remove (P2-17)', () => {
  const addKickLane = () => screen.getByTitle('Add another Kick-family lane');

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    useSequencerStore.setState({
      bars: 1,
      resolution: 16,
      isPlaying: false,
      lanes: DEFAULT_LANES,
      grid: DEFAULT_LANES.map(() => Array(16).fill(false)),
      accents: DEFAULT_LANES.map(() => Array(16).fill(1)),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('adding a lane creates a new row, numbered after the category it draws from', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);

    expect(screen.queryByText('Kick 2')).toBeNull();

    fireEvent.click(addKickLane());

    expect(screen.getByText('Kick 2')).toBeTruthy();
    expect(useSequencerStore.getState().lanes).toHaveLength(5);
    // The new row's steps start clean, not carrying over the original
    // kick lane's pattern.
    expect(cellFor('Kick 2', 1).getAttribute('aria-pressed')).toBe('false');
  });

  it('the original four lanes have no remove button; an added lane does', () =>
    withWidth(1920, () => {
      render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);

      expect(screen.queryByLabelText('Remove lane Kick')).toBeNull();

      fireEvent.click(addKickLane());
      expect(screen.getByLabelText('Remove lane Kick 2')).toBeTruthy();

      fireEvent.click(screen.getByLabelText('Remove lane Kick 2'));

      expect(screen.queryByText('Kick 2')).toBeNull();
      expect(useSequencerStore.getState().lanes).toHaveLength(4);
    }));

  it('hides the add-lane row once MAX_LANES is reached', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);

    for (let i = 0; i < 4; i++) {
      fireEvent.click(addKickLane());
    }

    expect(useSequencerStore.getState().lanes).toHaveLength(8);
    expect(screen.queryByTitle('Add another Kick-family lane')).toBeNull();
    expect(screen.getByText(/Up to 8 lanes/)).toBeTruthy();
  });
});

// Second-opinion review 2026-10-04: what the grid shows for a pattern with
// more lanes than MAX_LANES (reachable only through a loaded save, since
// addLane caps at 8). Documents CURRENT behaviour; no change intended.
// The notice added on 2026-10-04 (option B) is tested in its own block below.
describe('SequencerGrid — more lanes than MAX_LANES (current behaviour)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    const extra = Array.from({ length: 6 }, (_, i) => ({
      id: `kick-${i + 2}`,
      category: 'kick' as const,
      label: `Kick ${i + 2}`,
      muted: false,
      solo: false,
    }));
    const lanes = [...DEFAULT_LANES, ...extra];
    useSequencerStore.setState({
      bars: 1,
      resolution: 16,
      isPlaying: false,
      lanes,
      grid: lanes.map(() => Array(16).fill(false)),
      accents: lanes.map(() => Array(16).fill(1)),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders all 10 rows, hides add-lane, shows the cap text; extra rows are removable', () =>
    withWidth(1920, () => {
      render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
      expect(screen.getByText('Kick 7')).toBeTruthy();
      expect(cellFor('Kick 7', 1)).toBeTruthy();
      expect(screen.queryByTitle('Add another Kick-family lane')).toBeNull();
      expect(screen.getByText(/Up to 8 lanes/)).toBeTruthy();
      fireEvent.click(screen.getByLabelText('Remove lane Kick 7'));
      expect(useSequencerStore.getState().lanes).toHaveLength(9);
      // Still above the cap, so add-lane stays hidden until the count is below 8.
      expect(screen.queryByTitle('Add another Kick-family lane')).toBeNull();
    }));
});

// Owner decision 2026-10-04 (option B): an oversized save stays whole and the
// grid shows a gentle notice (en + ja) until the count is back to MAX_LANES.
describe('SequencerGrid — lane-limit notice', () => {
  function setLaneCount(count: number) {
    const extra = Array.from({ length: count - DEFAULT_LANES.length }, (_, i) => ({
      id: `kick-${i + 2}`,
      category: 'kick' as const,
      label: `Kick ${i + 2}`,
      muted: false,
      solo: false,
    }));
    const lanes = [...DEFAULT_LANES, ...extra];
    useSequencerStore.setState({
      bars: 1,
      resolution: 16,
      isPlaying: false,
      lanes,
      grid: lanes.map(() => Array(16).fill(false)),
      accents: lanes.map(() => Array(16).fill(1)),
    });
  }

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([9, 10])('shows the notice with the lane count (N=%i)', (n) => {
    setLaneCount(n);
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain(`This pattern has ${n} lanes, more than the usual 8.`);
    expect(notice.textContent).not.toContain("このパターン");
    expect(notice.textContent).toContain('please remove some first');
  });

  it('shows no notice at exactly 8 lanes', () => {
    setLaneCount(8);
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    expect(screen.queryByTestId('lane-limit-notice')).toBeNull();
    expect(screen.getByText(/Up to 8 lanes/)).toBeTruthy();
  });

  it('hides the notice once lanes are removed down to 8', () =>
    withWidth(1920, () => {
      setLaneCount(10);
      render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
      fireEvent.click(screen.getByLabelText('Remove lane Kick 7'));
      expect(screen.getByTestId('lane-limit-notice').textContent).toContain('has 9 lanes');
      fireEvent.click(screen.getByLabelText('Remove lane Kick 6'));
      expect(useSequencerStore.getState().lanes).toHaveLength(8);
      expect(screen.queryByTestId('lane-limit-notice')).toBeNull();
    }));
});

// Owner 2026-10-06: the add-lane row has no frame and is one small row.
describe('SequencerGrid — add-lane row', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    useSequencerStore.setState({ bars: 1, resolution: 16, lanes: DEFAULT_LANES.map((l) => ({ ...l })) });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('is an unframed row: a small label and one button per instrument', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const add = screen.getByTestId('add-lane-row');
    expect(add.className).not.toBe(screen.getAllByTestId('lane-row')[0].className);
    expect(add.getAttribute('style') ?? '').not.toContain('border');
    expect(screen.getByTestId('add-lane-label').getAttribute('style') ?? '').not.toContain('border');
    expect(screen.getByTestId('add-lane-label').textContent).toBe('Add lane');
    for (const name of ['Kick', 'Tom', 'Cymbal', 'Clap']) {
      expect(screen.getByRole('button', { name: `Add another ${name}-family lane` })).toBeTruthy();
    }
  });

  it('the helpers kept for other callers still work', () => {
    expect(addLaneRowHeight(0)).toBe(ADD_LANE_ROW_MIN_PX);
    expect(addLabelIsTooWide(160, 48)).toBe(true);
  });
});

describe('SequencerGrid — ON style (owner 2026-10-05)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useThemeStore.getState().setOnStyle('brightness');
  });

  function turnOn() {
    act(() => {
      useSequencerStore.setState({
        bars: 1,
        resolution: 16,
        grid: useSequencerStore.getState().grid.map((_, i) => {
          const row = Array(16).fill(false);
          if (i === 0) row[0] = true;
          return row;
        }),
        accents: useSequencerStore.getState().grid.map((_, i) => {
          const row = Array(16).fill(1);
          if (i === 0) row[0] = 2;
          return row;
        }),
      });
    });
  }

  it('default: no centre square; the lit pad glows (outer shadow)', () => {
    turnOn();
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    expect(screen.queryByTestId('step-on-mark')).toBeNull();
    const on = document.querySelector('button[aria-pressed="true"]') as HTMLElement;
    expect(on.style.boxShadow).toContain('color-mix');
  });

  it('centre-mark mode: the dark asagi token square appears, sized by strength', () => {
    useThemeStore.getState().setOnStyle('mark');
    turnOn();
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const mark = screen.getByTestId('step-on-mark');
    expect(mark.getAttribute('style')).toContain('--app-step-mark');
    expect(mark.style.width).toBe('60%');
  });
});

describe('SequencerGrid — keyboard (owner 2026-10-06)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    useSequencerStore.setState({
      bars: 1,
      resolution: 16,
      isPlaying: false,
      lanes: DEFAULT_LANES,
      grid: DEFAULT_LANES.map(() => Array(16).fill(false)),
      subGrid: DEFAULT_LANES.map(() => [Array(16).fill(false), Array(16).fill(false)]),
      accents: DEFAULT_LANES.map(() => Array(16).fill(1)),
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps exactly one pad in the tab order and moves it with the arrow keys', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const tabbable = () =>
      screen.getAllByTestId('main-step').filter((b) => b.getAttribute('tabindex') === '0');
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(cellFor('Kick', 1));
    cellFor('Kick', 1).focus();
    fireEvent.keyDown(cellFor('Kick', 1), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cellFor('Kick', 2));
    fireEvent.keyDown(cellFor('Kick', 2), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cellFor('Tom', 2));
    expect(tabbable()).toEqual([cellFor('Tom', 2)]);
    fireEvent.keyDown(cellFor('Tom', 2), { key: 'End' });
    expect(document.activeElement).toBe(cellFor('Tom', 16));
    fireEvent.keyDown(cellFor('Tom', 16), { key: 'ArrowRight' }); // stays at the edge
    expect(document.activeElement).toBe(cellFor('Tom', 16));
  });

  it('Shift+Space switches the first sub step only; sub cells are not tab stops', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    fireEvent.keyDown(cellFor('Kick', 3), { key: ' ', shiftKey: true });
    expect(useSequencerStore.getState().subGrid[0][0][2]).toBe(true);
    expect(useSequencerStore.getState().grid[0][2]).toBe(false);
    screen.getAllByTestId('sub-step').forEach((b) => expect(b.getAttribute('tabindex')).toBe('-1'));
  });
});

describe('SequencerGrid — pad units (owner 2026-10-06: rhythm-kit strips)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    useSequencerStore.setState({
      bars: 1,
      resolution: 16,
      isPlaying: false,
      lanes: DEFAULT_LANES,
      grid: DEFAULT_LANES.map(() => Array(16).fill(false)),
      accents: DEFAULT_LANES.map(() => Array(16).fill(1)),
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('a unit is 1.5 pads: the pad size follows the label content height', () => {
    expect(UNIT_HEIGHT_IN_PADS).toBe(1.5);
    expect(padSizeForLabel(30)).toBe(20);
    expect(padSizeForLabel(0)).toBe(17);
    expect(padSizeForLabel(9)).toBe(14);
    expect(padSizeForLabel(200)).toBe(46); // PAD_MAX_PX since 2026-10-19
  });

  it('no gap inside an instrument, a small gap between instruments', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const steps = screen.getAllByTestId('lane-steps')[0];
    expect(steps.style.rowGap).toBe('0px');
    expect(steps.style.columnGap).toBe('0px');
    const rows = screen.getAllByTestId('lane-row');
    rows.slice(0, -1).forEach((r) => expect(parseFloat(r.style.marginBottom)).toBeGreaterThanOrEqual(2));
    expect(parseFloat(rows[rows.length - 1].style.marginBottom)).toBe(0);
    expect(rows[0].style.alignItems).toBe('stretch');
    expect(instrumentGap(360)).toBe(2);
    expect(instrumentGap(1920)).toBe(4);
  });
});

describe('SequencerGrid — narrow screens (owner 2026-10-06)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    useSequencerStore.setState({
      bars: 1,
      resolution: 16,
      isPlaying: false,
      lanes: DEFAULT_LANES,
      grid: DEFAULT_LANES.map(() => Array(16).fill(false)),
      accents: DEFAULT_LANES.map(() => Array(16).fill(1)),
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('at 360 px: label is one unit tall, M/S and selects open in their own row, label column <= 30%, pads >= 16 px', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 360;
      },
    });
    try {
      render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
      // Closed by default (instruments stay 2-4 px apart); the arrow opens
      // one lane's M/S and selects under its pads.
      expect(screen.queryByTestId('lane-sounds-row')).toBeNull();
      fireEvent.click(screen.getAllByTestId('lane-more')[0]);
      expect(screen.getAllByTestId('lane-sounds-row')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Mute lane Kick' })).toBeTruthy();
      const lbl = screen.getAllByTestId('lane-label')[0];
      expect(parseFloat(lbl.style.height)).toBe(
        parseFloat(cellFor('Kick', 1).style.height) * 1.5
      );
      const label = screen.getAllByTestId('lane-row')[0].firstElementChild as HTMLElement;
      expect(parseFloat(label.style.width)).toBeLessThanOrEqual(Math.floor(360 * 0.3));
      const pad = cellFor('Kick', 1);
      expect(parseFloat(pad.style.width)).toBeGreaterThanOrEqual(16);
      expect(parseFloat(pad.style.height)).toBe(parseFloat(pad.style.width));
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
      else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  });

  it('wide: no separate sounds row', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    expect(screen.queryByTestId('lane-sounds-row')).toBeNull();
  });
});

describe('SequencerGrid — matte pads (owner 2026-10-06)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    useSequencerStore.setState({
      bars: 1,
      resolution: 16,
      lanes: DEFAULT_LANES,
      grid: DEFAULT_LANES.map(() => [true, ...Array(15).fill(false)]),
      subGrid: DEFAULT_LANES.map(() => [[true, ...Array(15).fill(false)], Array(16).fill(false)]),
      accents: DEFAULT_LANES.map(() => Array(16).fill(1)),
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('no glow on main or sub pads, ON or OFF: only 1 px inset edges', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const pads = [...screen.getAllByTestId('main-step'), ...screen.getAllByTestId('sub-step')];
    for (const p of pads) {
      const shadow = p.style.boxShadow;
      if (!shadow || shadow === 'none') continue;
      expect(shadow).not.toMatch(/(^|,\s*)0 0 /); // no outer glow
      expect(shadow).not.toMatch(/inset 0 0 /); // no inner glow
    }
    // Main and sub pads share the same edge treatment.
    const main = screen.getAllByTestId('main-step')[0].style.boxShadow;
    const sub = screen.getAllByTestId('sub-step')[0].style.boxShadow;
    expect(sub).toBe(main);
  });
});

// Owner 2026-10-07: at 360 px all 16 columns are visible (the label drops to
// icon + lane-more); lane names follow the text size (rule C9).
describe('compactLabelLayout — pure sizing (owner 2026-10-07)', () => {
  const rightEdge = (available: number, l: { labelWidth: number; cellWidth: number }, steps: number) =>
    gridPadX(available) + l.labelWidth + 4 + l.cellWidth * steps;

  it('345 px (a 360 px phone): icon only, 52 px label, pads >= 17 px, the last column ends inside the grid', () => {
    for (const scale of [1, 11 / 11, 48 / 11]) {
      const l = compactLabelLayout(345, scale, 16);
      expect(l.showName).toBe(false);
      expect(l.labelWidth).toBe(COMPACT_ICON_ONLY_LABEL_PX);
      expect(l.cellWidth).toBeGreaterThanOrEqual(17);
      expect(rightEdge(345, l, 16)).toBeLessThanOrEqual(345 - gridPadX(345));
    }
  });

  it('420, 480 and 600 px at text scale 1: the name is shown whenever 16 px pads still fit', () => {
    for (const w of [420, 480, 600]) {
      const l = compactLabelLayout(w, 1, 16);
      expect(l.showName).toBe(true);
      expect(l.cellWidth).toBeGreaterThanOrEqual(COMPACT_MIN_PAD_PX);
      expect(l.nameFontPx).toBeGreaterThanOrEqual(8);
      expect(rightEdge(w, l, 16)).toBeLessThanOrEqual(w - gridPadX(w));
    }
  });

  it('the name is shown from 379 px (30 % label leaves 16 px pads) and not below', () => {
    expect(compactLabelLayout(378, 1, 16).showName).toBe(false);
    expect(compactLabelLayout(379, 1, 16).showName).toBe(true);
    expect(compactLabelLayout(420, 1, 16).showName).toBe(true);
  });

  it('largest text (48/11): the name font is above 13 px or the name is hidden', () => {
    const big = 48 / 11;
    for (const w of [345, 420, 600, 1280, 1920]) {
      const l = compactLabelLayout(w, big, 16);
      expect(!l.showName || l.nameFontPx > 13).toBe(true);
    }
  });

  it('mid text: the compact name font grows with the text scale (beyond the old 13 px cap) while it fits', () => {
    const l = compactLabelLayout(1920, 1.8, 16);
    expect(l.showName).toBe(true);
    expect(l.nameFontPx).toBeGreaterThan(13);
    expect(compactLabelLayout(1920, 1.8, 16).nameFontPx).toBeGreaterThan(compactLabelLayout(1920, 1, 16).nameFontPx);
  });

  it('above 128 steps the pads shrink to a 6 px floor and the grid scrolls (unchanged)', () => {
    const l = compactLabelLayout(345, 1, 256);
    expect(l.cellWidth).toBe(6);
  });
});

describe('SequencerGrid — icon-only lane labels at 360 px (owner 2026-10-07)', () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const setWidth = (w: number) =>
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => w });
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    useSequencerStore.setState({
      bars: 1,
      resolution: 16,
      isPlaying: false,
      lanes: DEFAULT_LANES,
      grid: DEFAULT_LANES.map(() => Array(16).fill(false)),
      accents: DEFAULT_LANES.map(() => Array(16).fill(1)),
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (original) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
    else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    useThemeStore.setState({ settings: { ...useThemeStore.getState().settings, text_px: undefined } as never });
  });

  it('345 px: no visible lane name, but the name is the accessible name; 16 pads of >= 17 px fit', () => {
    setWidth(345);
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    expect(screen.queryByTestId('lane-name')).toBeNull();
    const labels = screen.getAllByTestId('lane-label');
    expect(labels[0].getAttribute('aria-label')).toBe('Kick');
    expect(labels[0].getAttribute('title')).toBe('Kick');
    expect(screen.getAllByRole('img', { name: 'Kick' }).length).toBe(1);
    const more = screen.getAllByTestId('lane-more')[0];
    expect(more.getAttribute('aria-label')).toContain('Kick');
    expect(more.getAttribute('title')).toContain('Kick');
    const labelPx = parseFloat(labels[0].style.width);
    const pad = parseFloat(cellFor('Kick', 1).style.width);
    expect(pad).toBeGreaterThanOrEqual(17);
    // padX 3 each side, 4 px slack: the 16th column ends inside the client width.
    expect(3 + labelPx + 4 + pad * 16).toBeLessThanOrEqual(345 - 3);
    expect(cellFor('Kick', 16)).toBeTruthy();
  });

  // Since 2026-10-19 the name is never smaller than the Tempo label (18 px
  // at the default 16 px text), so at 480 px (20 px pads, 15 px room) the
  // label is icon-only; from about 572 px the name fits again.
  it('480 px at the default text size: icon only, the name would be under the smallest text size', () => {
    setWidth(480);
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    expect(screen.queryAllByTestId('lane-name')).toHaveLength(0);
    expect(screen.getAllByTestId('lane-label')[0].getAttribute('aria-label')).toBe('Kick');
  });

  it('600 px at the default text size: the name is shown, at least the Tempo size', () => {
    setWidth(600);
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const name = screen.getAllByTestId('lane-name')[0];
    expect(name.textContent).toBe('Kick');
    expect(parseFloat(name.style.fontSize)).toBeGreaterThanOrEqual(18);
  });

  it('text 48 px: the lane name is hidden (icon only, name still accessible) or larger than 13 px', () => {
    setWidth(600);
    useThemeStore.setState({ settings: { ...useThemeStore.getState().settings, text_px: 48 } });
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    const names = screen.queryAllByTestId('lane-name');
    if (names.length > 0) {
      expect(parseFloat(names[0].style.fontSize)).toBeGreaterThan(13);
    } else {
      expect(screen.getAllByRole('img', { name: 'Kick' }).length).toBe(1);
      expect(screen.getAllByTestId('lane-label')[0].getAttribute('aria-label')).toBe('Kick');
    }
  });
});

describe('SequencerGrid load-refused notice (owner 2026-10-08)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
  });
  afterEach(() => {
    cleanup();
    act(() => useSequencerStore.setState({ loadRefused: false }));
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it.each([[-1], [1.5], ['x'], [999]])(
    'shows a dismissible role=status notice when a save with version %s is refused',
    async (version) => {
      const { loadSequencerState } = await import('../store/sequencerStore');
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      window.localStorage.setItem(
        'BeatBayashi.sequencer',
        JSON.stringify({ version, bpm: 77 })
      );
      act(() => loadSequencerState());
      expect(console.warn).toHaveBeenCalled();
      render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
      const notice = screen.getByTestId('load-refused-notice');
      expect(notice.getAttribute('role')).toBe('status');
      expect(notice.textContent).toContain("Couldn't read the saved pattern.");
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByTestId('load-refused-notice')).toBeNull();
    }
  );

  it('shows no notice when nothing was refused', () => {
    render(<SequencerGrid audioEngine={null} onSoundChange={() => {}} />);
    expect(screen.queryByTestId('load-refused-notice')).toBeNull();
  });
});

describe('wideTwoBarRows (owner 2026-10-09)', () => {
  it('only on wide screens with more than 2 bars', async () => {
    const { wideTwoBarRows } = await import('./SequencerGrid');
    expect(wideTwoBarRows(1900, 4, 16)).toBe(true);
    expect(wideTwoBarRows(1900, 2, 16)).toBe(false);
    expect(wideTwoBarRows(1240, 4, 16)).toBe(false);
    expect(wideTwoBarRows(360, 4, 16)).toBe(false);
    expect(wideTwoBarRows(0, 4, 16)).toBe(false);
  });
});

describe('SequencerGrid — label lines fit the label frame (select bottom was cut)', () => {
  // Frame inside height = main + subs * sub - 2 (1 px border each side);
  // the label stacks 1 name line + (subs + 1) sound lines.
  it.each([36, 40, 45, 46, 47, 48, 60, 90])('lines never exceed the frame for pad %i', (pad) => {
    const main = Math.round(pad);
    const sub = Math.max(6, Math.round(pad / 2));
    for (const maxSubs of [1, 2, 3, 5]) {
      const line = labelLineFitPx(main, sub, maxSubs, sub);
      expect(line).toBeLessThanOrEqual(sub);
      for (let k = 1; k <= maxSubs; k++) {
        expect((k + 2) * line).toBeLessThanOrEqual(main + k * sub - 2);
      }
    }
  });
  it('the old line (half a pad) did not fit at 45 px', () => {
    expect(3 * 23).toBeGreaterThan(45 + 23 - 2);
    expect(labelLineFitPx(45, 23, 1, 23)).toBe(22);
  });
});
