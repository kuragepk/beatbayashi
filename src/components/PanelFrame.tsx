// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { LabelIconBox } from './LabelIcon';
import React, { useState } from 'react';
import { PixelIcon, type PixelIconName } from '../pixel-icons';
import { fsPx } from '../theme/themeStore';
import {
  useLayoutStore,
  type PanelId,
  type PanelSize,
} from '../layout/layoutStore';

/**
 * Shared window chrome for the customisable panel board (owner request, 2026-09-01):
 * a slim header with move (left / right), resize (minus / plus) and settings
 * (gear) buttons, each a pixel icon.
 * Buttons reuse the frozen control palette (var(--app-control, #2a2a2a) / var(--app-muted, #ddd) / var(--app-border-strong, #3d3d3d)).
 */

const SIZE_LABELS: Record<PanelSize, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Full width',
};

// Owner request 2026-09-28 (text size setting): min-width/min-height (not a
// fixed width/height) so a scaled-up glyph (fsPx(10) can reach 20px at
// xx-large) grows the button instead of clipping inside a box sized for the
// scale-1 glyph. Unchanged at scale 1 (22x20, same as before) since the
// glyph plus this padding still fits that minimum.
// The 16 px icon fills the header button's inner box (min 20 px tall).
const HEADER_ICON: React.CSSProperties = { display: 'block', margin: '0 auto' };

const headerButton: React.CSSProperties = {
  minWidth: '22px',
  minHeight: '20px',
  padding: 0,
  background: 'var(--app-control, #2a2a2a)',
  color: 'var(--app-muted, #ddd)',
  border: '1px solid var(--app-border-strong, #3d3d3d)',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: fsPx(10),
  lineHeight: 1,
};

export const PanelFrame: React.FC<{
  id: PanelId;
  title: string;
  /** Decorative mark before the title (owner 2026-10-06). */
  icon?: PixelIconName;
  /** Cap the content height and show a vertical scrollbar (used by the presets panel). */
  scrollY?: boolean;
  children: React.ReactNode;
}> = ({ id, title, icon, scrollY, children }) => {
  const { order, sizes, autoFit, movePanel, resizePanel, setSize } =
    useLayoutStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const size = sizes[id];
  const index = order.indexOf(id);
  const isFirst = index <= 0;
  const isLast = index >= order.length - 1;

  // Auto-fit: the sequencer spans the row; the other panels split the width
  // and track the browser size (two columns when wide, stacked when narrow).
  const fitted = autoFit && id !== 'sequencer';
  const resizeDisabledTitle = autoFit
    ? 'Turn off Auto-fit (layout toolbar) to resize manually'
    : undefined;

  return (
    <section
      aria-label={title}
      style={{
        flex: fitted
          ? '1 1 48%'
          : size === 'L'
            ? '1 1 100%'
            : size === 'M'
              ? '1 1 560px'
              : '1 1 320px',
        // 260px lets the board fall to a single column in a 600px-wide window
        // (the portrait default) while still pairing panels on wider screens.
        // The minimum grows with the text (fsPx; default text 1.7x since
        // 2026-10-05) but never past the row, so a phone still gets one column.
        minWidth: `min(100%, ${fsPx(fitted ? 260 : size === 'S' ? 300 : 340)})`,
        border: '1px solid var(--app-border, #333)',
        borderRadius: '6px',
        background: 'var(--app-panel, #1a1a1a)',
        position: 'relative',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          padding: '3px 8px',
          borderBottom: '1px solid var(--app-border-strong, #262626)',
          background: 'var(--app-panel-alt, #161616)',
          borderTopLeftRadius: '6px',
          borderTopRightRadius: '6px',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            flex: '1 1 auto',
            // Keeps whole words together where it can: the buttons move to
            // the next line before the title breaks letter by letter.
            minWidth: 'min(100%, 9em)',
            // At 48 px text on a phone the title is wider than its room: it
            // breaks inside the word rather than widening the page (audit
            // 2026-10-06, en 360 px).
            overflowWrap: 'anywhere',
            // Larger, brighter panel headings (owner 2026-10-06): 10 -> 13
            // px, the main text token instead of the muted grey (contrast
            // #fff on #161616: 18.1:1, see src/theme/contrast.test.ts).
            fontSize: fsPx(13),
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--app-text, #ffffff)',
            fontWeight: 700,
          }}
        >
          {icon && <LabelIconBox icon={icon} />}
          {title}
        </span>

        <button
          type="button"
          title="Move panel earlier"
          aria-label={`Move ${title} earlier`}
          disabled={isFirst}
          onClick={() => movePanel(id, -1)}
          style={{ ...headerButton, opacity: isFirst ? 0.35 : 1 }}
        >
          <PixelIcon name="arrow-left" style={HEADER_ICON} />
        </button>
        <button
          type="button"
          title="Move panel later"
          aria-label={`Move ${title} later`}
          disabled={isLast}
          onClick={() => movePanel(id, 1)}
          style={{ ...headerButton, opacity: isLast ? 0.35 : 1 }}
        >
          <PixelIcon name="arrow-right" style={HEADER_ICON} />
        </button>
        <button
          type="button"
          title={resizeDisabledTitle ?? 'Shrink panel'}
          aria-label={`Shrink ${title}`}
          disabled={autoFit || size === 'S'}
          onClick={() => resizePanel(id, -1)}
          style={{ ...headerButton, opacity: autoFit || size === 'S' ? 0.35 : 1 }}
        >
          <PixelIcon name="minus" style={HEADER_ICON} />
        </button>
        <button
          type="button"
          title={resizeDisabledTitle ?? 'Grow panel'}
          aria-label={`Grow ${title}`}
          disabled={autoFit || size === 'L'}
          onClick={() => resizePanel(id, 1)}
          style={{ ...headerButton, opacity: autoFit || size === 'L' ? 0.35 : 1 }}
        >
          <PixelIcon name="plus" style={HEADER_ICON} />
        </button>
        <button
          type="button"
          title="Panel settings"
          aria-label={`${title} settings`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          style={{
            ...headerButton,
            background: menuOpen ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
            color: menuOpen ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
          }}
        >
          <PixelIcon name="gear" style={HEADER_ICON} />
        </button>
      </div>

      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: '26px',
            right: '6px',
            zIndex: 10,
            background: 'var(--app-panel-alt, #242424)',
            border: '1px solid var(--app-border-strong, #4a4a4a)',
            borderRadius: '3px',
            padding: '4px',
          }}
        >
          <div style={{ fontSize: fsPx(9), color: 'var(--app-muted, #888)', margin: '0 2px 4px' }}>
            Panel size
          </div>
          {SIZE_LABELS &&
            (Object.keys(SIZE_LABELS) as PanelSize[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={size === s}
                onClick={() => {
                  setSize(id, s);
                  setMenuOpen(false);
                }}
                style={{
                  ...headerButton,
                  width: '100%',
                  padding: '2px 8px',
                  display: 'block',
                  marginBottom: '2px',
                  textAlign: 'left',
                  background: size === s ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
                  color: size === s ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
                  fontWeight: size === s ? 700 : 400,
                }}
              >
                {s} — {SIZE_LABELS[s]}
              </button>
            ))}
        </div>
      )}

      <div
        style={{
          // Narrows with the window (owner 2026-10-06): about 3 px at 360 px.
          padding: 'clamp(2px, 0.6vw, 8px) clamp(2px, 0.8vw, 12px)',
          minWidth: 0,
          overflowX: 'auto',
          ...(scrollY ? { maxHeight: fsPx(300), overflowY: 'auto' } : {}),
        }}
      >
        {children}
      </div>
    </section>
  );
};
