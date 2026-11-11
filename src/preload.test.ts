// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

// Runs preload.js the way a sandboxed preload sees it: only 'electron' can be
// required, so any file require (e.g. ./package.json) throws.
function runPreload(argv: string[]) {
  const code = readFileSync(resolve(__dirname, '..', 'preload.js'), 'utf-8');
  const exposed: Record<string, unknown> = {};
  const sandboxRequire = (id: string) => {
    if (id === 'electron') {
      return { contextBridge: { exposeInMainWorld: (k: string, v: unknown) => { exposed[k] = v; } } };
    }
    throw new Error(`module not found: ${id}`);
  };
  vm.runInNewContext(code, { require: sandboxRequire, process: { platform: 'win32', arch: 'x64', argv } });
  return exposed.electron as { appVersion: string; platform: string };
}

describe('preload (sandboxed)', () => {
  it('exposes appVersion from the main-process argument without requiring files', () => {
    const api = runPreload(['electron', '--beatbayashi-version=1.2.3']);
    expect(api.appVersion).toBe('1.2.3');
    expect(api.platform).toBe('win32');
  });
  it('still exposes the API when the argument is missing', () => {
    expect(runPreload(['electron']).appVersion).toBe('');
  });
});
