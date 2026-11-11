// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Hand-written type declarations for the synced ./text-size-control.js (kit
// 1.3.0, UI rule STRUCTURE.md C9). Only the members this app uses are typed --
// do not hand-edit text-size-control.js itself, only re-sync it.

import type { TextPreviewFont, UiSettingsDoc } from './theme-kit.js';

export const TEXT_SIZE_CONTROL_ATTRS: Readonly<Record<string, string>>;
export const DEFAULT_TEXT_SIZE_QUICK_PRESETS: string[];
export function textSizeReadout(px: number, basePx?: number): string;

export interface TextSizeApplyInfo {
  px: number;
  preset: string | null;
  via: 'slider' | 'number' | 'preset';
}

export interface TextSizeControlOptions {
  settings: UiSettingsDoc;
  basePx?: number;
  onApply?: (next: UiSettingsDoc, info: TextSizeApplyInfo) => void;
  onPreview?: (px: number) => void;
  applyMode?: 'release' | 'live';
  previewSide?: 'right' | 'left';
  fonts?: TextPreviewFont[];
  /** kit 1.2.0: derives the preview fonts from a settings document; used at
   *  mount when `fonts` is not given, and by update({ settings }). */
  fontsFor?: (settings: UiSettingsDoc) => TextPreviewFont[];
  samples?: string[];
  presets?: string[];
  idPrefix?: string;
  announceDelayMs?: number;
  previewMaxHeight?: string;
}

export interface TextSizeControlHandle {
  element: HTMLElement;
  elements: {
    root: HTMLElement;
    slider: HTMLInputElement;
    number: HTMLInputElement;
    preview: HTMLElement;
    [key: string]: unknown;
  };
  getPreviewPx(): number;
  getCommittedPx(): number;
  getSettings(): UiSettingsDoc;
  setSettings(next: UiSettingsDoc): void;
  /** kit 1.2.0: refresh in place (no rebuild, no onApply, no announcement).
   *  kit 1.3.0: `basePx` sets a new normal body px (presets and readout follow). */
  update(next?: { settings?: UiSettingsDoc; fonts?: TextPreviewFont[]; samples?: string[]; basePx?: number }): {
    fontsChanged: boolean;
    samplesChanged: boolean;
    /** kit 1.3.0 */
    basePxChanged: boolean;
  };
  /** kit 1.3.0: the normal body px the control currently uses. */
  getBasePx(): number;
  getFonts(): TextPreviewFont[];
  getSamples(): string[];
  destroy(): void;
}

export function mountTextSizeControl(
  container: HTMLElement,
  opts: TextSizeControlOptions
): TextSizeControlHandle;

export function checkTextSizeControlLayout(scope?: Document | HTMLElement): {
  ok: boolean;
  controls: Array<{ side: string; ok: boolean; reasons: string[] }>;
  pageOverflow: boolean;
};
