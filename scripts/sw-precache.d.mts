// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
export const BUILD_ID_LINE: string;
export const BUILD_ASSETS_LINE: string;
export function listAssets(root: string, dir?: string): string[];
export function isPrecached(assetPath: string): boolean;
export function buildIdFor(assets: string[]): string;
export function injectPrecache(
  source: string,
  assets: string[],
  shellFiles?: string[],
  shellDigest?: string
): string;
export function digestFiles(root: string, files: string[]): string;
export function swPrecache(): {
  name: string;
  apply: 'build';
  configResolved(config: { root: string; build: { outDir: string } }): void;
  writeBundle(): void;
};
