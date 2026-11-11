// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// The store reads whatever is in localStorage at import time, so these cover
// the cases where that value is not what we wrote: an old build's panel names,
// a hand-edited entry, or a browser that refuses storage entirely. Getting this
// wrong means a blank or broken board on load, with no way for the user to tell
// why.
//
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'bb-layout-v1';

/** Re-imports the store so its load-time localStorage read runs again. */
async function freshStore() {
  vi.resetModules();
  return (await import('./layoutStore')).useLayoutStore;
}

describe('layout persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with the sequencer first and auto-fit on', async () => {
    const store = await freshStore();
    expect(store.getState().order).toEqual(['sequencer', 'controls', 'presets']);
    expect(store.getState().autoFit).toBe(true);
  });

  it('restores a saved arrangement on the next load', async () => {
    const store = await freshStore();
    store.getState().movePanel('presets', -1);
    store.getState().resizePanel('controls', -1);
    store.getState().setAutoFit(false);
    store.getState().saveLayout();

    const reloaded = await freshStore();
    expect(reloaded.getState().order).toEqual(['sequencer', 'presets', 'controls']);
    expect(reloaded.getState().sizes.controls).toBe('S');
    expect(reloaded.getState().autoFit).toBe(false);
  });

  it('does not persist changes until save is called', async () => {
    const store = await freshStore();
    store.getState().movePanel('presets', -1);

    const reloaded = await freshStore();
    expect(reloaded.getState().order).toEqual(['sequencer', 'controls', 'presets']);
  });

  it('reset clears the saved layout and returns to defaults', async () => {
    const store = await freshStore();
    store.getState().movePanel('presets', -1);
    store.getState().saveLayout();

    store.getState().resetLayout();

    expect(store.getState().order).toEqual(['sequencer', 'controls', 'presets']);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('surviving a bad saved layout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('falls back to defaults when the entry is not valid JSON', async () => {
    localStorage.setItem(STORAGE_KEY, 'not json at all');
    const store = await freshStore();
    expect(store.getState().order).toEqual(['sequencer', 'controls', 'presets']);
  });

  it('drops panel names it does not recognise', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['mixer', 'presets', 'sequencer'], sizes: {} })
    );
    const store = await freshStore();
    expect(store.getState().order).not.toContain('mixer');
    expect([...store.getState().order].sort()).toEqual([
      'controls',
      'presets',
      'sequencer',
    ]);
  });

  it('re-adds a panel that is missing from the saved order', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['presets'], sizes: {} })
    );
    const store = await freshStore();
    expect(store.getState().order).toContain('sequencer');
    expect(store.getState().order).toContain('controls');
    // The saved entry still leads.
    expect(store.getState().order[0]).toBe('presets');
  });

  it('ignores a size value that is not one of the steps', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['sequencer'], sizes: { sequencer: 'XXL' } })
    );
    const store = await freshStore();
    expect(store.getState().sizes.sequencer).toBe('L');
  });
});

describe('move and resize bounds', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('will not move the first panel any earlier', async () => {
    const store = await freshStore();
    store.getState().movePanel('sequencer', -1);
    expect(store.getState().order[0]).toBe('sequencer');
  });

  it('will not grow a panel past the largest step', async () => {
    const store = await freshStore();
    store.getState().resizePanel('sequencer', 1);
    expect(store.getState().sizes.sequencer).toBe('L');
  });

  it('will not shrink a panel past the smallest step', async () => {
    const store = await freshStore();
    store.getState().resizePanel('presets', -1); // M -> S
    store.getState().resizePanel('presets', -1); // stays S
    expect(store.getState().sizes.presets).toBe('S');
  });
});

// Owner decision #72 (2026-09-27): the main toolbar (Save / Reset / Auto-fit)
// gets the same reorder mechanism as the panels above.
describe('toolbar reorder', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts save, reset, autofit, clear', async () => {
    const store = await freshStore();
    expect(store.getState().toolbarOrder).toEqual(['save', 'reset', 'autofit', 'clear']);
  });

  it('moves an item and persists the order across reload', async () => {
    const store = await freshStore();
    store.getState().moveToolbarItem('autofit', -1);
    store.getState().moveToolbarItem('autofit', -1);
    expect(store.getState().toolbarOrder).toEqual(['autofit', 'save', 'reset', 'clear']);
    store.getState().saveLayout();

    const reloaded = await freshStore();
    expect(reloaded.getState().toolbarOrder).toEqual(['autofit', 'save', 'reset', 'clear']);
  });

  it('will not move the first item any earlier, or the last any later', async () => {
    const store = await freshStore();
    store.getState().moveToolbarItem('save', -1);
    expect(store.getState().toolbarOrder[0]).toBe('save');
    store.getState().moveToolbarItem('clear', 1);
    expect(store.getState().toolbarOrder[3]).toBe('clear');
  });

  it('falls back to the default order when a saved entry is missing an id', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        order: ['sequencer', 'controls', 'presets'],
        toolbarOrder: ['reset'],
      })
    );
    const store = await freshStore();
    expect(store.getState().toolbarOrder).toEqual(['reset', 'save', 'autofit', 'clear']);
  });

  // 2026-09-28 owner request: Clear moved here from the Controls panel's
  // transport row so it is never adjacent to Play, and its position (like
  // save/reset/autofit) is under the player's own control.
  it('can move clear away from the end', async () => {
    const store = await freshStore();
    store.getState().moveToolbarItem('clear', -1);
    store.getState().moveToolbarItem('clear', -1);
    store.getState().moveToolbarItem('clear', -1);
    expect(store.getState().toolbarOrder).toEqual(['clear', 'save', 'reset', 'autofit']);
  });
});

// Owner decision #78 (2026-09-27): ordering now goes through the shared UI
// kit's migrateLayout()/orderedIds()/moveItem() (../theme/kit/theme-kit.js,
// synced from templates/ui-system/web/). These cover that the switch did not
// change what a saved layout from before it (this file's own `{ order,
// toolbarOrder }` shape) means -- migrateLayout() reads those as legacy keys.
describe('shared kit ordering (decision #78)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads a pre-#78 saved order through migrateLayout unchanged', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        order: ['presets', 'sequencer', 'controls'],
        sizes: {},
        toolbarOrder: ['autofit', 'reset', 'save'],
      })
    );
    const store = await freshStore();
    expect(store.getState().order).toEqual(['presets', 'sequencer', 'controls']);
    // 'clear' is a newer id than this saved entry; orderedIds() appends it
    // rather than dropping it, same as any other id missing from a save.
    expect(store.getState().toolbarOrder).toEqual(['autofit', 'reset', 'save', 'clear']);
  });

  it('never drops the essential Controls panel even from a saved order missing it', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['sequencer', 'presets'], sizes: {} })
    );
    const store = await freshStore();
    expect(store.getState().order).toContain('controls');
  });
});
