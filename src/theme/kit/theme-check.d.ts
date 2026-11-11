// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Hand-written type declarations for the synced ./theme-check.js (a plain ES
// module; the project does not enable allowJs). Only the members this app
// actually imports are typed -- do not hand-edit theme-check.js itself, only
// re-sync it (see ../README.md).

export const THEME_SCHEMA_ID: string;
export const UI_SETTINGS_SCHEMA_ID: string;
export const RATIO_TEXT: number;
export const RATIO_LARGE: number;
export const PAIR_RULES: ReadonlyArray<[string, string, number, string]>;
export const KNOWN_LIMITS: Record<string, number>;
export const THEME_ID_ALIASES: Record<string, string>;

export function resolveThemeId(themeId: string): string;
export function isHex(value: unknown): value is string;
export function relativeLuminance(hex: string): number;
export function contrastRatio(hexA: string, hexB: string): number;
