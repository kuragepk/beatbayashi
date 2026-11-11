// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Owner decision 2026-09-29: the Length control is a "- N bars +" counter.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ControlPanel } from './ControlPanel';
import { useSequencerStore, MAX_BARS } from '../store/sequencerStore';

const ADD = 'Add a bar';
const REMOVE = 'Remove a bar';

function renderPanel() {
  render(<ControlPanel audioEngine={null} onSoundChange={() => {}} />);
}

beforeEach(() => {
  useSequencerStore.setState({ bars: 1, resolution: 16, currentStep: 0 });
  useSequencerStore.getState().resetGrid();
});
afterEach(() => cleanup());

describe('bar counter', () => {
  it('starts at 1 with minus disabled', () => {
    renderPanel();
    expect(screen.getByTestId('bar-count').textContent).toContain('1 bar(s)');
    expect((screen.getByRole('button', { name: REMOVE }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: ADD }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('plus adds a bar, minus removes an empty bar without asking', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: ADD }));
    expect(useSequencerStore.getState().bars).toBe(2);
    expect(screen.getByTestId('bar-count').textContent).toContain('2 bar(s)');
    fireEvent.click(screen.getByRole('button', { name: REMOVE }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useSequencerStore.getState().bars).toBe(1);
  });

  it('plus is disabled at 32', () => {
    useSequencerStore.setState({ bars: MAX_BARS });
    useSequencerStore.getState().resetGrid();
    renderPanel();
    const add = screen.getByRole('button', { name: ADD }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.click(add);
    expect(useSequencerStore.getState().bars).toBe(MAX_BARS);
  });

  it('removing a bar with notes asks first; Cancel keeps it, Remove drops it', () => {
    useSequencerStore.getState().addBar();
    const grid = useSequencerStore.getState().grid.map((r: boolean[]) => [...r]);
    grid[0][20] = true;
    useSequencerStore.setState({ grid });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: REMOVE }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Remove bar 2?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useSequencerStore.getState().bars).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: REMOVE }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(useSequencerStore.getState().bars).toBe(1);
  });

  it('the framed groups wrap as whole units (600px / 2x text)', () => {
    renderPanel();
    const group = screen.getByRole('group', { name: 'Number of bars' });
    // One frame stays on one line; the row of frames wraps.
    expect(group.style.flexWrap).toBe('nowrap');
    expect(screen.getByTestId('pattern-settings').style.flexWrap).toBe('wrap');
  });
});
