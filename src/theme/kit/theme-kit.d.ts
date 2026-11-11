// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Hand-written type declarations for the synced ./theme-kit.js (a plain ES
// module; the project does not enable allowJs). Kept minimal and matching
// templates/ui-system/web/theme-kit.js's actual exports -- do not hand-edit
// theme-kit.js itself, only re-sync it (see ../README.md).

export interface ThemeCatalogueEntry {
  id: string;
  app?: string;
  label?: { ja?: string; en?: string };
  category?: string;
  subPalettes?: string[];
  hasColor?: boolean;
  [key: string]: unknown;
}

export interface ThemeListEntry {
  id: string;
  ja: string;
  en: string;
  category: string;
  subPalettes: string[];
  fontFamily: string[];
}

export interface UiSettingsDoc {
  schema: string;
  theme: string;
  palette_overrides: Record<string, string>;
  layout: Record<string, unknown>;
  reduced_motion: boolean;
  ui_sound: boolean;
  sub_palette?: string | null;
  hemisphere?: string;
  font_slot?: string;
  text_size?: string;
  /** ui-settings/1 minor 1 (kit 1.1.0): body text size in px, integer 8-48. */
  text_px?: number;
  schema_minor?: number;
  [key: string]: unknown;
}

export interface ContrastCheckReport {
  ok: boolean;
  [key: string]: unknown;
}

export interface SaveSettingsResult {
  ok: boolean;
  errors: string[];
  report: ContrastCheckReport | null;
}

export const DEFAULT_SETTINGS: UiSettingsDoc;
export const THEME_ID_ALIASES: Record<string, string>;
export const SEASONS: readonly string[];
export const HEMISPHERES: readonly string[];
export const CATALOGUE_SCHEMA_ID: string;
export const FONT_FAMILY_VAR: string;
export const FONT_SIZE_STEP_VAR: string;
export const FONT_SLOTS: string[];
export const PIXEL_FONT_STEP: Record<string, number>;
export function isPixelFont(name: string): boolean;
export function resolveFontChoice(entry: ThemeListEntry, fontSlot?: string): string | null;
export function applyFont(
  root: HTMLElement,
  catalogue: ThemeCatalogueEntry[],
  themeId: string,
  settings?: { font_slot?: string }
): { family: string; chosen: string; pixel: boolean } | null;

export function validateSettings(doc: unknown): string[];
export function migrateSettings(doc: unknown): UiSettingsDoc;
export function checkSettingsOverrides(
  doc: UiSettingsDoc,
  baseColor: Record<string, string>
): ContrastCheckReport;
export function resolveThemeId(themeId: string): string;
export function seasonForDate(date: Date, hemisphere?: string): string;
export function chooseSubPalette(
  date: Date,
  hemisphere?: string,
  override?: string | null
): string;

export function fetchCatalogue(
  baseUrl: string,
  fileName?: string
): Promise<ThemeCatalogueEntry[]>;
export function listThemes(catalogue: ThemeCatalogueEntry[]): ThemeListEntry[];
export function applyTheme(
  root: HTMLElement,
  catalogue: ThemeCatalogueEntry[],
  themeId: string,
  opts?: { date?: Date; hemisphere?: string; subPalette?: string | null }
): string;
export function prefersReducedMotion(): boolean;
export function effectiveReducedMotion(settings: Partial<UiSettingsDoc>): boolean;
export function applyReducedMotion(root: HTMLElement, settings: Partial<UiSettingsDoc>): void;
export function loadUiSettings(storageKey: string): UiSettingsDoc;
export function saveUiSettings(
  storageKey: string,
  doc: UiSettingsDoc,
  baseColor?: Record<string, string>
): SaveSettingsResult;
export function resetUiSettings(storageKey: string): UiSettingsDoc;
export function currentThemeColor(
  root: HTMLElement,
  roles?: string[]
): Record<string, string>;
export function migrateLayout(rawLayout: unknown): Record<string, unknown>;
export function orderedIds(order: string[] | undefined, defaultIds: string[], pinned?: string[]): string[];
export function orderedSections(settings: UiSettingsDoc, defaultSections: string[]): string[];
export function orderedToolbar(settings: UiSettingsDoc, toolbarId: string, defaultToolbarIds: string[]): string[];
export function moveItem(list: string[], id: string, dir: -1 | 1): string[];

// --- text size / accessibility zoom (owner request 2026-09-28) ------------
export const TEXT_SIZES: readonly string[];
export const TEXT_SIZE_SCALE: Record<string, number>;
export const TEXT_SCALE_VAR: string;
export const BASE_FONT_SIZES_PX: Record<string, number>;
export const PIXEL_FONT_GRID: Record<string, number>;
export function computeScaledFontSizes(
  baseSizes: Record<string, number>,
  scale: number,
  grid?: number | null
): Record<string, number>;
export function applyTextSize(
  root: HTMLElement,
  settings: Partial<UiSettingsDoc>,
  catalogue: ThemeCatalogueEntry[],
  baseSizes?: Record<string, number>,
  opts?: { basePx?: number }
): {
  size: string;
  scale: number;
  grid: number | null;
  sizes: Record<string, number>;
  px: number;
  basePx: number;
  source: 'px' | 'preset';
};
export interface TextSizeOption {
  id: string;
  label_en: string;
  label_ja: string;
  px: number;
}
export interface TextSizeSettingsModel {
  id: 'text_size';
  label_en: string;
  label_ja: string;
  value: string;
  options: TextSizeOption[];
  px: number;
  min: number;
  max: number;
  step: number;
  unit: 'px';
  scale: number;
  basePx: number;
  source: 'px' | 'preset';
  preset: string | null;
}
export function textSizeSettingsModel(
  settings: Partial<UiSettingsDoc>,
  opts?: { basePx?: number }
): TextSizeSettingsModel;

// --- text size in px (ui-settings/1 minor 1, kit 1.1.0, 2026-10-04) --------
export const UI_SETTINGS_SCHEMA_MINOR: number;
export const TEXT_PX_MIN: number;
export const TEXT_PX_MAX: number;
export const TEXT_PX_STEP: number;
export const DEFAULT_BASE_TEXT_PX: number;
export const DEFAULT_TEXT_PREVIEW_SAMPLES: string[];
export function isValidTextPx(value: unknown): boolean;
export function presetTextPx(preset: string, basePx?: number): number;
export function nearestTextSizePreset(px: number, basePx?: number): string;
export function resolveTextSize(
  settings: Partial<UiSettingsDoc> | null | undefined,
  basePx?: number
): { px: number; scale: number; preset: string; source: 'px' | 'preset' };
export interface TextSettingsResult {
  ok: boolean;
  settings: UiSettingsDoc;
  errors: string[];
}
export function setTextPx(settings: UiSettingsDoc, px: number, opts?: { basePx?: number }): TextSettingsResult;
export function setTextSizePreset(settings: UiSettingsDoc, preset: string, opts?: { basePx?: number }): TextSettingsResult;
export interface TextPreviewFont {
  name: string;
  family: string;
}
export function textPreviewFonts(
  catalogue: ThemeCatalogueEntry[],
  themeId: string,
  settings?: Partial<UiSettingsDoc>,
  extra?: Array<{ name: string; family?: string }>
): TextPreviewFont[];
