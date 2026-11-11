// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0

import React from 'react';
import { RIGHTS_NOTICE } from '../rights/rightsNotice.generated';
import { fsPx } from '../theme/themeStore';
import { isLanguage, useLanguageStore, useT } from '../i18n/i18n';

/** Marks a machine-written language in the list, kept short and quiet. */
export const MT_MARK = '· MT';

/**
 * The one language control (owner 2026-10-06): top right of the header. It
 * sets the language of the whole UI and of the rights notice. Each option is
 * the language's own name; a machine-written one carries MT_MARK.
 */
import { HEADER_CONTROL_HEIGHT } from './ThemeToggle';

export const LanguagePicker: React.FC = () => {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  return (
    <select
      value={language}
      onChange={(e) => {
        if (isLanguage(e.target.value)) setLanguage(e.target.value);
      }}
      aria-label={t('languageLabel')}
      title={t('languageLabel')}
      data-testid="language-picker"
      style={{
        flex: '0 1 auto',
        minWidth: 0,
        maxWidth: '12em',
        minHeight: HEADER_CONTROL_HEIGHT,
        boxSizing: 'border-box',
        padding: '3px 6px',
        background: 'var(--app-control, #2a2a2a)',
        color: 'var(--app-muted, #ddd)',
        border: '1px solid var(--app-border-strong, #3d3d3d)',
        borderRadius: '3px',
        fontSize: fsPx(11),
        fontWeight: 600,
        cursor: 'pointer',
        textOverflow: 'ellipsis',
      }}
    >
      {RIGHTS_NOTICE.languages.map((l) => (
        <option key={l.code} value={l.code} style={{ background: 'var(--app-control, #2a2a2a)' }}>
          {l.reviewedByOwner ? l.label : `${l.label} ${MT_MARK}`}
        </option>
      ))}
    </select>
  );
};
