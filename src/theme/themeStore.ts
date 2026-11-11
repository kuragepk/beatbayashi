// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { create } from 'zustand';
import catalogueDoc from './kit/themes-catalogue.json';
import {
  DEFAULT_SETTINGS,
  applyTheme,
  applyReducedMotion,
  loadUiSettings,
  saveUiSettings,
  resetUiSettings,
  currentThemeColor,
  listThemes,
  resolveThemeId,
  applyFont,
  applyTextSize,
  FONT_SLOTS,
  TEXT_SIZES,
  TEXT_SCALE_VAR,
  BASE_FONT_SIZES_PX,
  resolveTextSize,
  type ThemeListEntry,
  type UiSettingsDoc,
  type SaveSettingsResult,
} from './kit/theme-kit.js';

export { FONT_SLOTS, TEXT_SIZES };

/** The px the inline `fsPx(n)` literals and tokens.css were written for
 *  (the original 標準, measured 2026-10-04: most main-view text was 11 px). */
export const DESIGN_TEXT_PX = 11;

/** This app's normal body text size in px (標準, the kit's `basePx`; UI rule
 *  C9). Owner request 2026-10-05: the default interface text 1.7x, then (same day,
 *  "too large") 1.4x the old 11 px (11 x 1.4 = 15.4 -> 15). Presets follow:
 *  小さめ round(15 x 0.875) = 13, 標準 15, 大きめ round(15 x 1.25) = 19.
 *  2026-10-05 (later the same day, owner): the default went back down 4 px, 15 -> 11.
 *  2026-10-19 (owner, after seeing the deployed preview): the whole UI 4 px larger
 *  again, 11 -> 16 (16, not 15: owner wants a multiple of the 16 px icon grid)
 *  (see migrateTextBase for saved values). A stored text_px is kept
 *  as is; preset-only settings map onto this base. */
export const BASE_TEXT_PX = 16;

/** How much larger 標準 is than the design px the literals were written for
 *  (16 / 11, about 1.45). fsPx() and APP_FONT_SIZES_PX carry it, so the kit's
 *  --ui-text-scale keeps meaning text_px / BASE_TEXT_PX (1 at 標準). */
export const DEFAULT_TEXT_STEP = BASE_TEXT_PX / DESIGN_TEXT_PX;

/** Text sizes snap to this grid (owner 2026-10-19): the whole-number part is
 *  even and the fraction is .0 or .5, e.g. 16, 16.5, 18, 18.5. snapTextPx()
 *  takes the nearest such size (a tie goes up); snapTextPxDown() the largest
 *  one not above px, for sizes that are a cap. */
export function snapTextPx(px: number): number {
  const base = 2 * Math.floor(px / 2);
  let best = base;
  for (const c of [base + 0.5, base + 2]) {
    if (Math.abs(c - px) <= Math.abs(best - px)) best = c;
  }
  return best;
}
export function snapTextPxDown(px: number): number {
  const base = 2 * Math.floor(px / 2);
  return px >= base + 0.5 ? base + 0.5 : base;
}

/** Smallest design px any text may use: the Tempo label's 12 (owner
 *  2026-10-19, "the smallest text the same size as テンポ"). fsPx() raises
 *  smaller literals to it; the sequencer's lane label (sized in px, not via
 *  fsPx) uses minTextPx(). At the default 16 px this is 12 x 16/11 = 17.45,
 *  snapped to 18 px. */
export const MIN_DESIGN_TEXT_PX = 12;

/** The smallest text in rendered px at a given textScaleOf() value, snapped. */
export function minTextPx(textScale: number): number {
  return snapTextPx(MIN_DESIGN_TEXT_PX * textScale);
}

/** tokens.css's --ui-fs-* sizes taken up by DEFAULT_TEXT_STEP, raised to the
 *  smallest text and snapped (body 11 -> 18 at the default); passed to
 *  applyTextSize as this app's own base map (kit contract). */
export const APP_FONT_SIZES_PX: Record<string, number> = Object.fromEntries(
  Object.entries(BASE_FONT_SIZES_PX).map(([k, v]) => [k, snapTextPx(Math.max(v, MIN_DESIGN_TEXT_PX) * DEFAULT_TEXT_STEP)])
);

/** Active render scale (effective body px / DESIGN_TEXT_PX): about 1.45 at
 *  the default, i.e. how large text is against the old 11 px design. The pixel icons snap this to whole multiples of
 *  16 px (src/pixel-icons, iconMultipleForTextScale). */
export function textScaleOf(settings: Partial<UiSettingsDoc>): number {
  return resolveTextSize(settings, BASE_TEXT_PX).px / DESIGN_TEXT_PX;
}

/** Scales a literal px font size by the active text-size setting (owner
 *  request 2026-09-28). Components in this app write inline
 *  `fontSize: '13px'` rather than reading `--ui-fs-*` tokens (there is no
 *  shared tokens.ts here); wrapping each literal in this helper routes it
 *  through applyTextSize()'s TEXT_SCALE_VAR without requiring every value to
 *  match one of the kit's 8 named sizes. Trade-off: no pixel-font grid
 *  snapping for these (snapping only applies to the kit's own
 *  BASE_FONT_SIZES_PX keys) -- acceptable since this app's settings screen
 *  does not render in a bitmap font today. */
export function fsPx(px: number): string {
  // Snapped at the default text size; another text size multiplies the
  // snapped value by --ui-text-scale, which is not snapped again.
  const design = Math.max(px, MIN_DESIGN_TEXT_PX);
  return `calc(${snapTextPx(design * DEFAULT_TEXT_STEP)}px * var(${TEXT_SCALE_VAR}, 1))`;
}

/**
 * Owner decisions #70-71 (2026-09-27): every screen gets the 15 preset UI
 * themes, chosen from a settings screen, with colour overrides gated by
 * contrast and a basic button-layout reorder. This store owns that state;
 * it is a sibling of ../layout/layoutStore.ts (panel order/size) rather than
 * a merge into it -- the two are independent concerns (visual theme vs.
 * which panel sits where) with independent storage keys, matching the
 * project's existing one-concern-per-store pattern.
 */

export const STORAGE_KEY = 'bb-ui-settings-v1';

const CATALOGUE = (catalogueDoc as { themes: unknown[] }).themes as Parameters<
  typeof listThemes
>[0];

export const THEME_LIST: ThemeListEntry[] = listThemes(CATALOGUE);
export const THEME_IDS: string[] = THEME_LIST.map((t) => t.id);

/** Button order for the appearance panel's own controls (theme picker, colour
 *  overrides, layout, motion, sound) -- reorderable so its own focus order
 *  can be customised like the sequencer panels. */
export type AppearanceControlId = 'theme' | 'colours' | 'layout' | 'motion' | 'sound';
export const DEFAULT_CONTROL_ORDER: AppearanceControlId[] = [
  'theme',
  'colours',
  'layout',
  'motion',
  'sound',
];

/** How an ON step shows its strength. 'single' = one lit level whatever
 *  the strength (the default again since owner 2026-10-06, as in the older
 *  version); 'brightness' = three levels of fill and glow (owner
 *  2026-10-05); 'mark' = a centred dark square sized by strength.
 *  Migration: the default was never stored, so a visitor with no key gets
 *  'single'; 'v1:brightness' and 'v1:mark' were written only by a click in
 *  Appearance, so those explicit choices are kept. */
export type OnStyle = 'single' | 'brightness' | 'mark';
export const ON_STYLE_KEY = `${STORAGE_KEY}.on-style`;
export function loadOnStyle(): OnStyle {
  try {
    const v = localStorage.getItem(ON_STYLE_KEY);
    return v === 'v1:mark' ? 'mark' : v === 'v1:brightness' ? 'brightness' : 'single';
  } catch {
    return 'single';
  }
}

/** retro-ux (owner 2026-10-29): the retro-game UX (frame, spacing, cursor,
 *  selection) with no colour of its own. OFF by default. Stored as its own
 *  companion key so an older saved settings document (which has no such item)
 *  reads as off; shown as <html data-ux="retro"> (retro-ux.css). */
export const UX_KEY = `${STORAGE_KEY}.ux`;
export function loadRetroUx(): boolean {
  try {
    return localStorage.getItem(UX_KEY) === 'v1:retro';
  } catch {
    return false;
  }
}
export function applyRetroUx(on: boolean) {
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.setAttribute('data-ux', 'retro');
  else document.documentElement.removeAttribute('data-ux');
}

interface ThemeState {
  retroUx: boolean;
  setRetroUx: (on: boolean) => void;
  onStyle: OnStyle;
  setOnStyle: (style: OnStyle) => void;
  settings: UiSettingsDoc;
  controlOrder: AppearanceControlId[];
  lastSaveError: string | null;
  lastReport: SaveSettingsResult['report'] | null;
  setTheme: (themeId: string) => void;
  setSubPalette: (subPalette: string | null) => void;
  setHemisphere: (hemisphere: 'north' | 'south') => void;
  setPaletteOverride: (role: string, hex: string) => boolean;
  clearPaletteOverride: (role: string) => void;
  setReducedMotion: (on: boolean) => void;
  setUiSound: (on: boolean) => void;
  setFontSlot: (fontSlot: string) => void;
  setTextSize: (textSize: string) => void;
  /** Commits a whole settings document from the text-size control (text_px +
   *  nearest text_size, as built by the kit's setTextPx/setTextSizePreset). */
  setTextSettings: (next: UiSettingsDoc) => boolean;
  moveControl: (id: AppearanceControlId, dir: -1 | 1) => void;
  resetAppearance: () => void;
}

function loadControlOrder(): AppearanceControlId[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.control-order`);
    if (!raw) return [...DEFAULT_CONTROL_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_CONTROL_ORDER];
    const known = new Set(DEFAULT_CONTROL_ORDER as string[]);
    const kept = parsed.filter(
      (id): id is AppearanceControlId => typeof id === 'string' && known.has(id)
    );
    for (const id of DEFAULT_CONTROL_ORDER) if (!kept.includes(id)) kept.push(id);
    return kept;
  } catch {
    return [...DEFAULT_CONTROL_ORDER];
  }
}

function saveControlOrder(order: AppearanceControlId[]) {
  try {
    localStorage.setItem(`${STORAGE_KEY}.control-order`, JSON.stringify(order));
  } catch {
    // best-effort only; a failed write leaves the in-memory order as-is
  }
}

/** Applies the current theme/sub-palette/reduced-motion to the document.
 *  Safe to call before the DOM exists (tests, SSR-less builds still guard
 *  via typeof document checks inside the kit). */
export function applySettingsToDocument(settings: UiSettingsDoc) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const themeId = THEME_IDS.includes(settings.theme) ? settings.theme : 'modern';
  const resolved = applyTheme(root, CATALOGUE, themeId, {
    subPalette: settings.sub_palette ?? null,
    hemisphere: settings.hemisphere ?? 'north',
  });
  applyReducedMotion(root, settings);
  applyFont(root, CATALOGUE, resolved, settings);
  // --ui-text-scale stays the kit's text_px / BASE_TEXT_PX (1 at 標準); this app's own
  // base map carries the 16/11 step so --ui-fs-body is 16 px at the default.
  applyTextSize(root, settings, CATALOGUE, APP_FONT_SIZES_PX, { basePx: BASE_TEXT_PX });
  const overrides = settings.palette_overrides ?? {};
  for (const [role, hex] of Object.entries(overrides)) {
    root.style.setProperty(`--theme-color-${role}`, hex);
  }
}

/** One-time migration (2026-10-19, owner: the whole UI larger, 11 -> 16).
 *  A stored text_px equal to the previous default (11, used 2026-10-05..10-19)
 *  was almost certainly the default written back by the text-size control, so it
 *  is dropped and the user follows the new base. Any other stored px is kept.
 *  (The earlier 15 -> 11 migration, marker '11px-1', dropped a stored 15; a
 *  stored 15 is kept like any other non-default px.) Runs once per
 *  browser (marker key); safe to call more than once. */
export const TEXT_BASE_MIGRATION_KEY = `${STORAGE_KEY}.text-base`;
export const TEXT_BASE_MIGRATION_VERSION = '16px-1';
export function migrateTextBase(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem(TEXT_BASE_MIGRATION_KEY) === TEXT_BASE_MIGRATION_VERSION) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const doc = JSON.parse(raw) as Record<string, unknown>;
      if (doc && typeof doc === 'object' && doc.text_px === 11) {
        delete doc.text_px;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
      }
    }
    localStorage.setItem(TEXT_BASE_MIGRATION_KEY, TEXT_BASE_MIGRATION_VERSION);
  } catch {
    /* malformed or blocked storage: leave it as is */
  }
}
migrateTextBase();

const initialSettings = loadUiSettings(STORAGE_KEY);
applySettingsToDocument(initialSettings);
const initialRetroUx = loadRetroUx();
applyRetroUx(initialRetroUx);

export const useThemeStore = create<ThemeState>((set, get) => ({
  settings: initialSettings,
  controlOrder: loadControlOrder(),
  onStyle: loadOnStyle(),
  retroUx: initialRetroUx,
  setRetroUx: (on) => {
    try {
      if (on) localStorage.setItem(UX_KEY, 'v1:retro');
      else localStorage.removeItem(UX_KEY);
    } catch {
      /* best-effort; the choice still applies for this session */
    }
    applyRetroUx(on);
    set({ retroUx: on });
  },
  setOnStyle: (style) => {
    try {
      localStorage.setItem(ON_STYLE_KEY, `v1:${style}`);
    } catch {
      /* best-effort; the choice still applies for this session */
    }
    set({ onStyle: style });
  },
  lastSaveError: null,
  lastReport: null,

  setTheme: (themeId) => {
    const resolved = resolveThemeId(themeId);
    const next: UiSettingsDoc = {
      ...get().settings,
      theme: resolved,
      // A new theme starts from its own palette; overrides made under a
      // different theme are not guaranteed to still pass contrast.
      palette_overrides: {},
    };
    applySettingsToDocument(next);
    const result = saveUiSettings(STORAGE_KEY, next, currentThemeColor(document.documentElement));
    set({
      settings: result.ok ? next : get().settings,
      lastSaveError: result.ok ? null : 'Could not save the new theme.',
      lastReport: result.report,
    });
    if (!result.ok) applySettingsToDocument(get().settings);
  },

  setSubPalette: (subPalette) => {
    const next = { ...get().settings, sub_palette: subPalette };
    applySettingsToDocument(next);
    const result = saveUiSettings(STORAGE_KEY, next, currentThemeColor(document.documentElement));
    set({ settings: result.ok ? next : get().settings, lastSaveError: null, lastReport: result.report });
  },

  setHemisphere: (hemisphere) => {
    const next = { ...get().settings, hemisphere };
    applySettingsToDocument(next);
    const result = saveUiSettings(STORAGE_KEY, next, currentThemeColor(document.documentElement));
    set({ settings: result.ok ? next : get().settings, lastSaveError: null, lastReport: result.report });
  },

  /** Returns true when the override was accepted (passed the contrast gate
   *  and was persisted); false when rejected. Nothing is written on a
   *  rejection -- the caller should keep showing the previous value. */
  setPaletteOverride: (role, hex) => {
    const current = get().settings;
    const next: UiSettingsDoc = {
      ...current,
      palette_overrides: { ...current.palette_overrides, [role]: hex },
    };
    const baseColor = currentThemeColor(document.documentElement);
    const result = saveUiSettings(STORAGE_KEY, next, baseColor);
    if (!result.ok) {
      set({
        lastSaveError: 'That colour does not meet the contrast requirement.',
        lastReport: result.report,
      });
      return false;
    }
    applySettingsToDocument(next);
    set({ settings: next, lastSaveError: null, lastReport: result.report });
    return true;
  },

  clearPaletteOverride: (role) => {
    const current = get().settings;
    const overrides = { ...current.palette_overrides };
    delete overrides[role];
    const next = { ...current, palette_overrides: overrides };
    applySettingsToDocument(next);
    const result = saveUiSettings(STORAGE_KEY, next, currentThemeColor(document.documentElement));
    set({ settings: result.ok ? next : get().settings, lastSaveError: null, lastReport: result.report });
  },

  setReducedMotion: (on) => {
    const next = { ...get().settings, reduced_motion: on };
    applySettingsToDocument(next);
    const result = saveUiSettings(STORAGE_KEY, next, currentThemeColor(document.documentElement));
    set({ settings: result.ok ? next : get().settings, lastSaveError: null, lastReport: result.report });
  },

  setUiSound: (on) => {
    const next = { ...get().settings, ui_sound: on };
    const result = saveUiSettings(STORAGE_KEY, next, currentThemeColor(document.documentElement));
    set({ settings: result.ok ? next : get().settings, lastSaveError: null, lastReport: result.report });
  },

  setFontSlot: (fontSlot) => {
    const next = { ...get().settings, font_slot: fontSlot };
    applySettingsToDocument(next);
    const result = saveUiSettings(STORAGE_KEY, next, currentThemeColor(document.documentElement));
    set({ settings: result.ok ? next : get().settings, lastSaveError: null, lastReport: result.report });
  },

  setTextSize: (textSize) => {
    // A preset by id drops any stored px, so the preset's own scale applies.
    const { text_px: _dropped, ...rest } = get().settings;
    void _dropped;
    const next = { ...rest, text_size: textSize } as UiSettingsDoc;
    applySettingsToDocument(next);
    const result = saveUiSettings(STORAGE_KEY, next, currentThemeColor(document.documentElement));
    set({ settings: result.ok ? next : get().settings, lastSaveError: null, lastReport: result.report });
  },

  setTextSettings: (next) => {
    const result = saveUiSettings(STORAGE_KEY, next, currentThemeColor(document.documentElement));
    if (!result.ok) {
      // Invalid px (outside 8-48 or not a whole number) is refused; the previous
      // value stays applied and stored (kit rule: never clamp).
      set({ lastSaveError: 'Could not save the text size.', lastReport: result.report });
      return false;
    }
    applySettingsToDocument(next);
    set({ settings: next, lastSaveError: null, lastReport: result.report });
    return true;
  },

  moveControl: (id, dir) => {
    set((state) => {
      const i = state.controlOrder.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= state.controlOrder.length) return state;
      const order = [...state.controlOrder];
      [order[i], order[j]] = [order[j], order[i]];
      saveControlOrder(order);
      return { controlOrder: order };
    });
  },

  resetAppearance: () => {
    const next = resetUiSettings(STORAGE_KEY);
    applySettingsToDocument(next);
    localStorage.removeItem(`${STORAGE_KEY}.control-order`);
    localStorage.removeItem(ON_STYLE_KEY);
    localStorage.removeItem(UX_KEY);
    applyRetroUx(false);
    set({
      retroUx: false,
      onStyle: 'single',
      settings: next,
      controlOrder: [...DEFAULT_CONTROL_ORDER],
      lastSaveError: null,
      lastReport: null,
    });
  },
}));

export { DEFAULT_SETTINGS };
