// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { create } from 'zustand';
import { migrateLayout, orderedIds, moveItem } from '../theme/kit/theme-kit.js';

/**
 * User-customisable panel layout (owner request, 2026-09-01):
 * every panel can be reordered and resized from its own header buttons,
 * and the arrangement can be saved to localStorage or reset to defaults.
 *
 * RightsBanner is deliberately NOT a panel: the rights disclosure must stay
 * visible at all times (promise #2), so it cannot be moved, shrunk or hidden.
 *
 * Owner decision #78 (2026-09-27): the ordering itself (both the panel board
 * below and the toolbar, further down) now goes through the shared UI kit's
 * `orderedIds`/`moveItem`/`migrateLayout` (`../theme/kit/theme-kit`, synced
 * from `templates/ui-system/web/`) instead of this file's own hand-rolled
 * filter-and-swap, so this app's rules match Melodia's and UIChime's. A
 * saved layout from before this change (`{ order, toolbarOrder }`, no
 * `sections`/`toolbars` keys) still loads in its old order --
 * `migrateLayout()` reads the legacy `order`/`toolbarOrder` keys as
 * `sections`/`toolbars.main` on every load, it is not a one-time rewrite.
 */

export type PanelId = 'sequencer' | 'controls' | 'presets';
export type PanelSize = 'S' | 'M' | 'L';

/** Owner decision #72 (2026-09-27): the panel board's "basic layout reorder"
 *  (movePanel, below) extended to the one natural button group outside the
 *  panels themselves -- the main toolbar row (Save / Reset / Auto-fit) above
 *  the panel board in App.tsx. Same mechanism (an ordered id array + a move
 *  function), a second concern (which of these three buttons is where), not
 *  a merge into `order` above, which is specifically panel identity.
 *
 *  'clear' added 2026-09-28 (owner request): the pattern-grid Clear action
 *  moved out of the Controls panel's transport row (where it sat next to
 *  Play/Stop) into this reorderable toolbar, so it is never pinned adjacent
 *  to Play and its position is under the player's own control like the
 *  other three items. */
export type ToolbarItemId = 'save' | 'reset' | 'autofit' | 'clear';

const STORAGE_KEY = 'bb-layout-v1';

const DEFAULT_ORDER: PanelId[] = ['sequencer', 'controls', 'presets'];
const DEFAULT_SIZES: Record<PanelId, PanelSize> = {
  sequencer: 'L',
  controls: 'M',
  presets: 'M',
};
const DEFAULT_TOOLBAR_ORDER: ToolbarItemId[] = ['save', 'reset', 'autofit', 'clear'];

/** Essential panel (owner decision #78: "pin essential buttons/sections").
 *  This app has no per-button toolbar to pin play/stop or undo into (the
 *  Play/Stop button lives inside the Controls panel, and there is no undo
 *  feature) -- the closest equivalent is pinning the Controls panel itself,
 *  since it holds transport (Play/Stop). `orderedIds()` already never drops
 *  a known id regardless of `pinned`; this list only documents the intent
 *  and is what a future "hide a panel" control would have to respect. */
const DEFAULT_PANEL_PINNED: PanelId[] = ['controls'];

export const SIZE_STEPS: PanelSize[] = ['S', 'M', 'L'];

interface LayoutState {
  order: PanelId[];
  sizes: Record<PanelId, PanelSize>;
  /** When on (default), Controls/Presets track the browser width automatically
   *  and manual resize buttons are disabled. */
  autoFit: boolean;
  /** Toolbar button order (save/reset/autofit) -- focus order follows this,
   *  since the toolbar renders the buttons in this same array order. */
  toolbarOrder: ToolbarItemId[];
  movePanel: (id: PanelId, dir: -1 | 1) => void;
  resizePanel: (id: PanelId, delta: -1 | 1) => void;
  setSize: (id: PanelId, size: PanelSize) => void;
  setAutoFit: (on: boolean) => void;
  moveToolbarItem: (id: ToolbarItemId, dir: -1 | 1) => void;
  saveLayout: () => void;
  resetLayout: () => void;
}

function loadSaved(): {
  order: PanelId[];
  sizes: Record<PanelId, PanelSize>;
  autoFit: boolean;
  toolbarOrder: ToolbarItemId[];
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      order?: unknown;
      sizes?: unknown;
      autoFit?: unknown;
      toolbarOrder?: unknown;
      layout?: unknown;
    };
    if (!Array.isArray(parsed.order)) return null;

    // Reads this file's own legacy top-level `order`/`toolbarOrder` (kept for
    // an already-saved entry) via the shared kit's migrateLayout(), which
    // recognises both those keys, so this app's save format does not need to
    // change shape just to route through the kit's ordering helpers.
    const migrated = migrateLayout({
      order: parsed.order,
      toolbarOrder: parsed.toolbarOrder,
      pinned: DEFAULT_PANEL_PINNED,
    }) as { sections?: string[]; toolbars?: Record<string, string[]>; pinned?: string[] };

    // Only accept known ids so a stale or hand-edited save cannot break the board.
    const order = orderedIds(migrated.sections, DEFAULT_ORDER, migrated.pinned) as PanelId[];

    const sizes = { ...DEFAULT_SIZES };
    if (parsed.sizes && typeof parsed.sizes === 'object') {
      for (const id of DEFAULT_ORDER) {
        const s = (parsed.sizes as Record<string, unknown>)[id];
        if (s === 'S' || s === 'M' || s === 'L') sizes[id] = s;
      }
    }

    const toolbarOrder = orderedIds(
      migrated.toolbars?.main,
      DEFAULT_TOOLBAR_ORDER,
      migrated.pinned
    ) as ToolbarItemId[];

    return { order, sizes, autoFit: parsed.autoFit !== false, toolbarOrder };
  } catch (err) {
    console.warn('Saved layout was unreadable; falling back to defaults.', err);
    return null;
  }
}

const saved = loadSaved();

export const useLayoutStore = create<LayoutState>((set, get) => ({
  order: saved?.order ?? [...DEFAULT_ORDER],
  sizes: saved?.sizes ?? { ...DEFAULT_SIZES },
  autoFit: saved?.autoFit ?? true,
  toolbarOrder: saved?.toolbarOrder ?? [...DEFAULT_TOOLBAR_ORDER],

  setAutoFit: (on) => set({ autoFit: on }),

  movePanel: (id, dir) =>
    set((state) => ({ order: moveItem(state.order, id, dir) as PanelId[] })),

  resizePanel: (id, delta) =>
    set((state) => {
      const i = SIZE_STEPS.indexOf(state.sizes[id]);
      const j = Math.min(SIZE_STEPS.length - 1, Math.max(0, i + delta));
      return { sizes: { ...state.sizes, [id]: SIZE_STEPS[j] } };
    }),

  setSize: (id, size) =>
    set((state) => ({ sizes: { ...state.sizes, [id]: size } })),

  moveToolbarItem: (id, dir) =>
    set((state) => ({
      toolbarOrder: moveItem(state.toolbarOrder, id, dir) as ToolbarItemId[],
    })),

  saveLayout: () => {
    const { order, sizes, autoFit, toolbarOrder } = get();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order, sizes, autoFit, toolbarOrder })
    );
  },

  resetLayout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({
      order: [...DEFAULT_ORDER],
      sizes: { ...DEFAULT_SIZES },
      autoFit: true,
      toolbarOrder: [...DEFAULT_TOOLBAR_ORDER],
    });
  },
}));
