// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import React from 'react';
import { PixelIcon, TIGHT_ICON } from '../pixel-icons';
import { fsPx } from '../theme/themeStore';
import {
  CHARACTER_DESCRIPTIONS,
  CHARACTER_LABELS,
  CHARACTER_ORDER,
  GENRE_FAMILIES,
  GENRE_FAMILY_ORDER,
  findPreset,
  type GenreFamily,
} from '../presets';

/**
 * The preset matrix: 12 genres x 6 rhythmic characters.
 *
 * Readability is the design goal, so the layout is a real <table>:
 * - the header row names the axis and explains what each mode means
 * - the first column is sticky, so the genre stays visible while scanning right
 * - genres are grouped into families with a labelled band between them
 * - the selected cell is legible by weight and border, not colour alone
 */

// ui-color-check-ignore: these three colours identify the genre family
// itself (a data category, not app chrome) and are the same across every
// theme so a family reads consistently wherever it shows up -- like
// FlagIcons.tsx's national flag colours, not something a theme should
// restyle.
const FAMILY_ACCENT: Record<GenreFamily, string> = { // ui-color-check-ignore
  'Four on the Floor': '#4aa3ff', // ui-color-check-ignore
  'Bass & Breaks': '#a78bfa', // ui-color-check-ignore
  Hardcore: '#ff6b4a', // ui-color-check-ignore
};

const HEADER_BG = 'var(--app-panel-alt, #161616)';
const BODY_BG = 'var(--app-panel, #1a1a1a)';
const ROW_ALT_BG = 'var(--app-panel-alt, #1f1f1f)';
const BORDER = 'var(--app-border, #333)';

export const PresetTable: React.FC<{
  activePresetId: string | null;
  onLoadPreset: (presetId: string) => void;
}> = ({ activePresetId, onLoadPreset }) => {
  return (
    <section aria-labelledby="preset-table-heading" style={{ marginBottom: '20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '8px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <h2
          id="preset-table-heading"
          style={{
            margin: 0,
            fontSize: fsPx(13),
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--app-text, #eee)',
          }}
        >
          Rhythm Presets
        </h2>
        <span style={{ fontSize: fsPx(11), color: 'var(--app-muted, #888)' }}>
          12 genres × 6 modes — click any cell to load it
        </span>
      </div>

      <div
        style={{
          overflowX: 'auto',
          border: `1px solid ${BORDER}`,
          borderRadius: '6px',
          background: BODY_BG,
        }}
      >
        <table
          style={{
            borderCollapse: 'separate',
            borderSpacing: 0,
            width: '100%',
            minWidth: '760px',
            fontSize: fsPx(11),
          }}
        >
          <caption style={{ position: 'absolute', left: '-9999px' }}>
            Rhythm presets by genre and rhythmic character
          </caption>

          <thead>
            <tr>
              <th
                scope="col"
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  background: HEADER_BG,
                  borderBottom: `2px solid ${BORDER}`,
                  borderRight: `1px solid ${BORDER}`,
                  padding: '8px 10px',
                  textAlign: 'left',
                  minWidth: '124px',
                  fontSize: fsPx(10),
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--app-muted, #777)',
                  fontWeight: 600,
                }}
              >
                Genre
              </th>

              {CHARACTER_ORDER.map((character) => (
                <th
                  key={character}
                  scope="col"
                  style={{
                    background: HEADER_BG,
                    borderBottom: `2px solid ${BORDER}`,
                    borderRight: `1px solid ${BORDER}`,
                    padding: '7px 8px',
                    textAlign: 'center',
                    minWidth: '104px',
                    verticalAlign: 'bottom',
                  }}
                >
                  <div
                    style={{
                      fontSize: fsPx(11),
                      fontWeight: 700,
                      color: 'var(--app-text, #eee)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {CHARACTER_LABELS[character]}
                  </div>
                  <div
                    style={{
                      fontSize: fsPx(9),
                      color: 'var(--app-muted, #777)',
                      marginTop: '2px',
                      fontWeight: 400,
                    }}
                  >
                    {CHARACTER_DESCRIPTIONS[character]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {GENRE_FAMILY_ORDER.map((family) => {
            const accent = FAMILY_ACCENT[family];

            return (
              <tbody key={family}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={CHARACTER_ORDER.length + 1}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      background: 'var(--app-panel-alt, #121212)',
                      borderTop: `1px solid ${BORDER}`,
                      borderBottom: `1px solid ${BORDER}`,
                      fontSize: fsPx(9),
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: accent,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        borderRadius: '2px',
                        background: accent,
                        marginRight: '8px',
                        verticalAlign: 'middle',
                      }}
                    />
                    {family}
                  </th>
                </tr>

                {GENRE_FAMILIES[family].map((genre, rowIndex) => {
                  const rowBg = rowIndex % 2 === 1 ? ROW_ALT_BG : BODY_BG;

                  return (
                    <tr key={genre}>
                      <th
                        scope="row"
                        style={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 2,
                          background: rowBg,
                          borderRight: `1px solid ${BORDER}`,
                          borderBottom: `1px solid var(--app-border-strong, #262626)`,
                          borderLeft: `3px solid ${accent}`,
                          padding: '6px 10px',
                          textAlign: 'left',
                          fontSize: fsPx(11),
                          fontWeight: 700,
                          color: 'var(--app-text, #f0f0f0)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {genre}
                      </th>

                      {CHARACTER_ORDER.map((character) => {
                        const preset = findPreset(genre, character);

                        if (!preset) {
                          return (
                            <td
                              key={character}
                              style={{
                                background: rowBg,
                                borderRight: `1px solid ${BORDER}`,
                                borderBottom: `1px solid var(--app-border-strong, #262626)`,
                                padding: '4px',
                                textAlign: 'center',
                                color: 'var(--app-border-strong, #444)',
                              }}
                            >
                              —
                            </td>
                          );
                        }

                        const selected = activePresetId === preset.id;

                        return (
                          <td
                            key={character}
                            style={{
                              background: rowBg,
                              borderRight: `1px solid ${BORDER}`,
                              borderBottom: `1px solid var(--app-border-strong, #262626)`,
                              padding: '3px',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => onLoadPreset(preset.id)}
                              aria-pressed={selected}
                              aria-label={`${preset.name}. ${genre}, ${CHARACTER_LABELS[character]} mode, ${preset.bpm} BPM. ${preset.description}`}
                              title={`${preset.description}\n${preset.bpm} BPM`}
                              style={{
                                display: 'block',
                                width: '100%',
                                padding: '5px 6px',
                                background: selected ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
                                color: selected ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
                                border: selected
                                  ? '2px solid var(--app-accent-bright, #3fc1b0)'
                                  : `1px solid var(--app-border-strong, #3d3d3d)`,
                                borderRadius: '3px',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontWeight: selected ? 700 : 500,
                                fontSize: fsPx(11),
                                lineHeight: 1.25,
                              }}
                            >
                              <span
                                style={{
                                  display: 'block',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {selected ? <PixelIcon name="knot" style={{ ...TIGHT_ICON, marginRight: '3px' }} /> : null}
                                {preset.name}
                              </span>
                              <span
                                style={{
                                  display: 'block',
                                  fontSize: fsPx(9),
                                  fontWeight: 400,
                                  color: selected ? 'var(--app-on-accent, #03312e)' : 'var(--app-muted, #888)',
                                  marginTop: '1px',
                                }}
                              >
                                {preset.bpm} BPM
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
};
