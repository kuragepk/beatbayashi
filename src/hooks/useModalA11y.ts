// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * ISSUE-BEATBOX-024: Settings and Export are the only two full-screen
 * overlays in this app. Both need the same three things — a dialog role for
 * screen readers, Esc to close, and a focus trap so Tab can't leak to the
 * page underneath — so this hook holds that behaviour once instead of
 * duplicating it per panel.
 *
 * Returns a ref to attach to the dialog's outer container element.
 */
export function useModalA11y<T extends HTMLElement>(onClose: () => void) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getFocusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    // Move focus into the dialog so Tab starts from something inside it,
    // rather than wherever the page's focus happened to be.
    const focusables = getFocusable();
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      container.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = getFocusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus?.();
    };
    // Re-running this on every render would refocus the first element on
    // every keystroke inside the panel; the effect only needs to run once
    // per mount, keyed on the container existing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return containerRef;
}
