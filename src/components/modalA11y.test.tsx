// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// ISSUE-BEATBOX-024: Settings and Export are the only two full-screen
// overlays. Both must expose a dialog role, close on Esc, and trap Tab
// focus while open. Covered here for both panels rather than duplicated
// per-panel, since the behaviour comes from the same shared hook.
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { ExportPanel } from './ExportPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe.each([
  { name: 'SettingsPanel', render: (onClose: () => void) => <SettingsPanel audioEngine={null} onPresetChange={() => {}} onClose={onClose} /> },
  { name: 'ExportPanel', render: (onClose: () => void) => <ExportPanel audioEngine={null} onClose={onClose} /> },
])('$name accessibility (ISSUE-BEATBOX-024)', ({ render: renderPanel }) => {
  it('exposes role=dialog, aria-modal=true and an aria-labelledby that resolves to a real element', () => {
    render(renderPanel(() => {}));

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).not.toBeNull();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(renderPanel(onClose));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab focus within the dialog: Tab from the last focusable wraps to the first', () => {
    render(renderPanel(() => {}));

    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    expect(focusables.length).toBeGreaterThan(1);

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('traps Shift+Tab focus within the dialog: Shift+Tab from the first focusable wraps to the last', () => {
    render(renderPanel(() => {}));

    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    first.focus();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
