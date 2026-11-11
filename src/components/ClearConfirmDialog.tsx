// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Owner request (2026-09-28): clearing the pattern grid needs an in-app
// confirmation, not window.confirm(). role="alertdialog" (not "dialog") is
// deliberate -- this interrupts to ask about a destructive action rather
// than presenting a neutral panel. Reuses useModalA11y (ISSUE-BEATBOX-024)
// for the same Esc-to-cancel + focus-trap behaviour as SettingsPanel and
// ExportPanel, so this is a third instance of the same pattern, not a new
// one. Cancel is the first focusable element in the DOM so the shared hook's
// "focus the first focusable on mount" already puts focus on Cancel.

import React from 'react';
import { useModalA11y } from '../hooks/useModalA11y';
import { fsPx } from '../theme/themeStore';
import { useT } from '../i18n/i18n';

const TITLE_ID = 'clear-confirm-title';

export const ClearConfirmDialog: React.FC<{
  onCancel: () => void;
  onConfirm: () => void;
  /** Defaults keep the original Clear wording; the bar counter (owner
   *  decision 2026-09-29) reuses this dialog for "Remove bar N?". */
  title?: string;
  confirmLabel?: string;
}> = ({
  onCancel,
  onConfirm,
  title,
  confirmLabel,
}) => {
  const t = useT();
  const dialogRef = useModalA11y<HTMLDivElement>(onCancel);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.82)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1100,
        padding: '20px',
      }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        style={{
          backgroundColor: 'var(--app-panel-alt, #161616)',
          color: 'var(--app-text, #fff)',
          padding: '24px',
          borderRadius: '10px',
          width: 'min(420px, 100%)',
          border: '2px solid var(--app-danger, #ff3333)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={TITLE_ID} style={{ margin: '0 0 20px 0', fontSize: fsPx(17) }}>
          {title ?? t('clearAllQuestion')}
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: 'var(--app-panel-alt, #222)',
              color: 'var(--app-muted, #ddd)',
              border: '1px solid var(--app-border-strong, #444)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: 'var(--app-danger, #ff3333)',
              color: 'var(--app-on-accent, #000)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {confirmLabel ?? t('clear')}
          </button>
        </div>
      </div>
    </div>
  );
};
