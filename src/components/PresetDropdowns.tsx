// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { AlignedIconLabel, LabelIconBox } from './LabelIcon';
import React from 'react';
import { LABEL_ICONS } from '../pixel-icons';
import { fsPx } from '../theme/themeStore';
import { useLanguageStore, useT } from '../i18n/i18n';
import {
  CHARACTER_LABELS,
  CHARACTER_ORDER,
  GENRE_FAMILIES,
  GENRE_FAMILY_ORDER,
  findPreset,
  type GenreFamily,
  type PatternCharacter,
} from '../presets';
import {
  DEFAULT_SOUND_BASIS,
  SOUND_BASIS_INFO,
  basisDescription,
  SOUND_BASIS_ORDER,
  isSoundBasis,
  type SoundBasis,
} from '../audio/soundBasis';

/**
 * Compact preset picker: one dropdown per genre (12 rows), so the whole tool
 * fits on one screen next to the control panel (owner request, 2026-09-01).
 *
 * Readability rules carried over from the previous table layout:
 * - genres stay grouped into families with a labelled colour band
 * - the loaded genre is legible by border and weight, not colour alone
 */

// Genre-family accents (owner 2026-10-06): blue, purple and red stay, but
// at step 4 of their ramps in theme-bridge.css, which has the same luminance
// as the asagi step 4 (7.1:1 on the panel), so no family shouts louder.
const FAMILY_ACCENT: Record<GenreFamily, string> = {
  'Four on the Floor': 'var(--app-blue-4, #88a8ce)',
  'Bass & Breaks': 'var(--app-purple-4, #ae9dd7)',
  Hardcore: 'var(--app-red-4, #d0988d)',
};

const BORDER = 'var(--app-border, #333)';

export const PresetDropdowns: React.FC<{
  activePresetId: string | null;
  onLoadPreset: (presetId: string) => void;
  /** Which of the four sound bases the genre's drums are built from. */
  soundBasis?: SoundBasis;
  onSoundBasisChange?: (basis: SoundBasis) => void;
}> = ({ activePresetId, onLoadPreset, soundBasis = DEFAULT_SOUND_BASIS, onSoundBasisChange }) => {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  return (
    <section aria-label={t('rhythmPresets')}>
      {/* Sound basis: same select look as the genre rows below (UI theme is frozen). */}
      <div style={{ marginBottom: '8px' }}>
        {/* Owner 2026-10-06: one line; the label may take two lines and the
            select narrows (its full text is in the title). */}
        <div
          data-testid="preset-row"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', minWidth: 0 }}
        >
          <label
            htmlFor="sound-basis-pick"
            style={{
              flex: '0 1 auto',
              minWidth: 0,
              overflowWrap: 'anywhere',
              fontSize: fsPx(11),
              fontWeight: 700,
              color: 'var(--app-text, #f0f0f0)',
            }}
          >
            <AlignedIconLabel icon={LABEL_ICONS.soundBasis}>{t('soundBasis')}</AlignedIconLabel>
          </label>
          <select
            id="sound-basis-pick"
            value={soundBasis}
            onChange={(e) => {
              const next = e.target.value;
              if (isSoundBasis(next)) onSoundBasisChange?.(next);
            }}
            title={`What the genre's drum sounds are built from: ${SOUND_BASIS_INFO[soundBasis].label}`}
            style={{
              flex: '1 1 0',
              minWidth: 0,
              maxWidth: '220px',
              textOverflow: 'ellipsis',
              padding: '3px 4px',
              fontSize: fsPx(11),
              backgroundColor: 'var(--app-panel-alt, #242424)',
              color: 'var(--app-muted, #ddd)',
              border: '1px solid var(--app-border-strong, #4a4a4a)',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            {SOUND_BASIS_ORDER.map((basis) => (
              <option key={basis} value={basis}>
                {SOUND_BASIS_INFO[basis].label}
              </option>
            ))}
          </select>
        </div>
        <span
          data-testid="sound-basis-description"
          style={{ display: 'block', marginTop: '4px', fontSize: fsPx(11), color: 'var(--app-muted, #888)' }}
        >
          {basisDescription(soundBasis, language)}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'flex-end',
          marginBottom: '6px',
          flexWrap: 'nowrap',
          minWidth: 0,
          gap: '8px',
        }}
      >
        <span style={{ fontSize: fsPx(11), color: 'var(--app-muted, #888)', minWidth: 0, textAlign: 'right' }}>
          {t('presetsHint')}
        </span>
      </div>

      {/* Multi-column flow: families rearrange into 1-2 columns to keep the panel rectangular */}
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: '6px',
          background: 'var(--app-panel, #1a1a1a)',
          padding: '8px 12px',
          columnWidth: '280px',
          columnCount: 2,
          columnGap: '14px',
        }}
      >
        {GENRE_FAMILY_ORDER.map((family) => {
          const accent = FAMILY_ACCENT[family];

          return (
            <div key={family} style={{ marginBottom: '8px', breakInside: 'avoid' }}>
              <div
                style={{
                  fontSize: fsPx(9),
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: accent,
                  margin: '4px 0',
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
              </div>

              {GENRE_FAMILIES[family].map((genre) => {
                const activeCharacter = CHARACTER_ORDER.find(
                  (character) => findPreset(genre, character)?.id === activePresetId
                );
                const selected = activeCharacter !== undefined;

                return (
                  <div
                    key={genre}
                    data-testid="preset-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'nowrap',
                      minWidth: 0,
                      gap: '6px',
                      marginBottom: '3px',
                      paddingLeft: '6px',
                      borderLeft: `3px solid ${accent}`,
                    }}
                  >
                    <label
                      htmlFor={`preset-pick-${genre}`}
                      style={{
                        // Grows with the text (2026-10-19: at 18 px, 88 px broke
                        // "Eurodance" mid-word); never under the old 88 px.
                        flex: '0 1 max(88px, 7.5em)',
                        minWidth: 0,
                        // The icon keeps its own column, so a wrapped name
                        // starts at the same x on every line and in every row.
                        display: 'flex',
                        alignItems: 'center',
                        overflowWrap: 'anywhere',
                        fontSize: fsPx(11),
                        fontWeight: 700,
                        color: 'var(--app-text, #f0f0f0)',
                      }}
                    >
                      <LabelIconBox icon={selected ? 'knot' : null} />
                      <span style={{ minWidth: 0 }}>{genre}</span>
                    </label>
                    <select
                      id={`preset-pick-${genre}`}
                      value={activeCharacter ?? ''}
                      onChange={(e) => {
                        const preset = findPreset(
                          genre,
                          e.target.value as PatternCharacter
                        );
                        if (preset) onLoadPreset(preset.id);
                      }}
                      title={`Load a ${genre} preset`}
                      style={{
                        flex: '1 1 0',
                        minWidth: 0,
                        maxWidth: '220px',
                        textOverflow: 'ellipsis',
                        padding: '3px 4px',
                        fontSize: fsPx(11),
                        backgroundColor: 'var(--app-panel-alt, #242424)',
                        color: 'var(--app-muted, #ddd)',
                        border: selected ? '2px solid var(--app-accent-bright, #3fc1b0)' : '1px solid var(--app-border-strong, #4a4a4a)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontWeight: selected ? 700 : 400,
                      }}
                    >
                      <option value="">{t('selectMode')}</option>
                      {CHARACTER_ORDER.map((character) => {
                        const preset = findPreset(genre, character);
                        if (!preset) return null;

                        return (
                          <option key={character} value={character}>
                            {CHARACTER_LABELS[character]} — {preset.name} ({preset.bpm} BPM)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
};
