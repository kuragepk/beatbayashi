// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Security review finding: preset import used to read the whole file with
// file.text() before checking the 5 MiB cap, so an oversized file was
// buffered into memory before being rejected. This checks file.size first.
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { MAX_IMPORT_BYTES } from '../audio/userPresets';

afterEach(cleanup);

function oversizedFile(): File {
  const file = new File(['{}'], 'huge.json', { type: 'application/json' });
  Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES + 1 });
  return file;
}

describe('SettingsPanel preset import', () => {
  it('rejects an oversized file by size without reading its bytes', async () => {
    const textSpy = vi.spyOn(File.prototype, 'text');
    render(
      <SettingsPanel audioEngine={null} onPresetChange={() => {}} onClose={() => {}} />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [oversizedFile()] } });

    expect((await screen.findByText(/too large/i)).textContent).toMatch(/too large/i);
    expect(textSpy).not.toHaveBeenCalled();
    textSpy.mockRestore();
  });
});
