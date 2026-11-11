// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { LabelIconBox } from './LabelIcon';
import React, { useState } from 'react';
import { PixelIcon, LABEL_ICONS } from '../pixel-icons';
import { RIGHTS_NOTICE } from '../rights/rightsNotice.generated';
import { fsPx } from '../theme/themeStore';
import {
  type Language,
  langTag,
  needsMachineTranslationNote,
  textDir,
  useLanguageStore,
  useT,
} from '../i18n/i18n';

/**
 * The rights surface.
 *
 * This is deliberately NOT a thin "Licence: MIT" line at the bottom of the page.
 * The project exists because beginners cannot tell whether what they make is
 * safe to publish, so the answer has to be the loudest thing on the screen after
 * the sequencer itself — stated as permissions the user already holds, not as
 * legal terms they have to interpret.
 *
 * Wording comes from docs/rights-notice.json via a generated module, so the web
 * and mobile apps cannot drift apart on what a user is allowed to do.
 *
 * Palette is the frozen project theme: var(--app-panel, #1a1a1a) panels, var(--app-accent, #0f8a80) accent,
 * var(--app-control, #2a2a2a) controls, var(--app-border, #333) borders -- now read through the --app-* bridge
 * (src/theme/theme-bridge.css) so a chosen preset theme restyles this
 * always-visible banner too; the fallback values are those same frozen
 * hex constants, unchanged (owner decisions #70-71, 2026-09-27).
 */

const ACCENT = 'var(--app-accent, #0f8a80)';
const PANEL = 'var(--app-panel, #1a1a1a)';
const BORDER = 'var(--app-border, #333)';
const CONTROL = 'var(--app-control, #2a2a2a)';

export const RightsBanner: React.FC = () => {
  const [open, setOpen] = useState(false);
  // Owner 2026-10-06: a pulldown, closed by default, at the very bottom of
  // the page — one header line with "Project philosophy and policy"; the message
  // and the summary open below it. The language is the one picked in the
  // header (one language at a time, no side-by-side English).
  const [expanded, setExpanded] = useState(false);
  const language = useLanguageStore((s) => s.language);
  const t = useT();
  const dir = textDir(language);
  const lang = langTag(language);
  const mtNote = needsMachineTranslationNote(language)
    ? RIGHTS_NOTICE.machineTranslationNote[language]
    : undefined;

  return (
    <>
      <section
        aria-labelledby="rights-headline"
        dir={dir}
        lang={lang}
        style={{
          background: PANEL,
          border: `2px solid ${ACCENT}`,
          borderRadius: '6px',
          padding: '6px 10px',
          margin: '12px 0',
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap',
            marginBottom: expanded ? '10px' : 0,
          }}
        >
          <h2
            id="rights-headline"
            style={{
              margin: 0,
              fontSize: fsPx(15),
              color: ACCENT,
              letterSpacing: '0.02em',
              minWidth: 0,
              overflowWrap: 'anywhere',
            }}
          >
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls="rights-body"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? t('hideDetails') : t('showDetails')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                padding: 0,
                margin: 0,
                color: 'inherit',
                font: 'inherit',
                textAlign: 'start',
                cursor: 'pointer',
                maxWidth: '100%',
                overflowWrap: 'anywhere',
              }}
            >
              <PixelIcon
                name={expanded ? 'arrow-down' : dir === 'rtl' ? 'arrow-left' : 'arrow-right'}
              />
              <LabelIconBox icon={LABEL_ICONS.rights} />
              <span>{RIGHTS_NOTICE.headline[language]}</span>
            </button>
          </h2>

          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              background: CONTROL,
              color: 'var(--app-muted, #ddd)',
              border: `1px solid var(--app-border-strong, #3d3d3d)`,
              borderRadius: '3px',
              padding: '5px 12px',
              fontSize: fsPx(11),
              cursor: 'pointer',
              fontWeight: 600,
              // At 48 px text (UI rule C9) the label is wider than a phone
              // screen, so it may wrap inside the button.
              maxWidth: '100%',
              overflowWrap: 'break-word',
            }}
          >
            {RIGHTS_NOTICE.ui.trustButton[language] ?? RIGHTS_NOTICE.ui.trustButton.en}
          </button>
        </div>

        {expanded && (
          <div id="rights-body">
            {mtNote && (
              <p
                data-testid="machine-translation-note"
                style={{
                  margin: '0 0 8px',
                  fontSize: fsPx(10),
                  color: 'var(--app-muted, #9a9a9a)',
                  lineHeight: 1.5,
                }}
              >
                {mtNote}
              </p>
            )}

            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              {RIGHTS_NOTICE.permissions.map((permission) => (
                <li
                  key={permission.en}
                  title={language === 'en' ? permission.detail : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                    background: CONTROL,
                    border: `1px solid var(--app-border-strong, #3d3d3d)`,
                    borderRadius: '3px',
                    padding: '5px 10px',
                    fontSize: fsPx(11),
                    color: 'var(--app-text, #eee)',
                    fontWeight: 600,
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ color: 'var(--app-ok, #2ba695)', fontWeight: 700, display: 'inline-flex' }}
                  >
                    <PixelIcon name="check" />
                  </span>
                  <span>{permission[language]}</span>
                </li>
              ))}
            </ul>

            <p
              style={{
                margin: '10px 0 0',
                fontSize: fsPx(11),
                color: 'var(--app-muted, #999)',
                lineHeight: 1.5,
              }}
            >
              {RIGHTS_NOTICE.synthesis[language]}
            </p>

            <p
              style={{
                margin: '6px 0 0',
                fontSize: fsPx(11),
                color: 'var(--app-muted, #999)',
                lineHeight: 1.5,
              }}
            >
              {RIGHTS_NOTICE.licenceTerms[language]}
            </p>
          </div>
        )}
      </section>

      {open && <RightsDetail language={language} onClose={() => setOpen(false)} />}
    </>
  );
};

const CloseLabel: React.FC = () => {
  const language = useLanguageStore((s) => s.language);
  return <>{RIGHTS_NOTICE.ui.close[language] ?? RIGHTS_NOTICE.ui.close.en}</>;
};

const RightsDetail: React.FC<{ language: Language; onClose: () => void }> = ({
  language,
  onClose,
}) => (
  <div
    role="dialog"
    dir={textDir(language)}
    lang={langTag(language)}
    aria-modal="true"
    aria-labelledby="rights-detail-title"
    onClick={onClose}
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: PANEL,
        color: 'var(--app-text, #fff)',
        border: `2px solid ${ACCENT}`,
        borderRadius: '6px',
        padding: '24px',
        maxWidth: '560px',
        width: '100%',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}
    >
      <h2
        id="rights-detail-title"
        style={{ marginTop: 0, marginBottom: '14px', color: ACCENT, fontSize: fsPx(16) }}
      >
        {RIGHTS_NOTICE.detail.title[language]}
      </h2>

      {/* Owner 2026-10-20: the web dialog shows only the machine-translation note (it already says
          the English text is the reference). translationDisclaimer is not shown here because it
          speaks of "the English text above", which this dialog does not have. */}
      {needsMachineTranslationNote(language) && RIGHTS_NOTICE.machineTranslationNote[language] && (
        <p
          data-testid="detail-machine-translation-note"
          style={{ margin: '0 0 14px', fontSize: fsPx(11), color: 'var(--app-muted, #aaa)', lineHeight: 1.6 }}
        >
          {RIGHTS_NOTICE.machineTranslationNote[language]}
        </p>
      )}

      {RIGHTS_NOTICE.detail.sections.map((section) => (
        <Section key={section.title.en} title={section.title[language]}>
          {section.body[language]}
        </Section>
      ))}

      <Section title={RIGHTS_NOTICE.detail.dataFlow.web.title[language]}>
        {RIGHTS_NOTICE.detail.dataFlow.web.body[language]}
      </Section>

      <p
        style={{
          fontSize: fsPx(11),
          color: 'var(--app-muted, #777)',
          borderTop: `1px solid ${BORDER}`,
          paddingTop: '12px',
          marginBottom: '16px',
          lineHeight: 1.6,
        }}
      >
        {RIGHTS_NOTICE.detail.footer[language]}
      </p>

      <button
        type="button"
        onClick={onClose}
        style={{
          width: '100%',
          padding: '10px',
          background: CONTROL,
          color: 'var(--app-muted, #ddd)',
          border: `1px solid var(--app-border-strong, #3d3d3d)`,
          borderRadius: '3px',
          cursor: 'pointer',
          fontSize: fsPx(12),
          fontWeight: 600,
        }}
      >
        <CloseLabel />
      </button>
    </div>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div style={{ marginBottom: '14px' }}>
    <h3
      style={{
        margin: '0 0 4px',
        fontSize: fsPx(12),
        color: 'var(--app-text, #eee)',
        fontWeight: 700,
      }}
    >
      {title}
    </h3>
    <p style={{ margin: 0, fontSize: fsPx(11), color: 'var(--app-muted, #aaa)', lineHeight: 1.6 }}>
      {children}
    </p>
  </div>
);

