// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import React from 'react';

/**
 * Inline SVG flags for the language selector.
 *
 * Drawn here rather than pulled from an icon pack: the project ships no
 * third-party assets, and a flag image with unclear licensing would undercut
 * the very claim the rights banner makes. These are simplified geometric
 * renderings, sized for a 16x12 slot.
 *
 * English defaults to a combined US/UK mark, since the reference wording is
 * shared between them rather than belonging to one country.
 */

export type LanguageCode = 'en' | 'ja' | 'zh' | 'hi' | 'ko';

const SIZE = { width: 16, height: 12 };

/** US stars-and-stripes, simplified to the stripe count that reads at 16px. */
const UsFlag: React.FC = () => (
  <svg {...SIZE} viewBox="0 0 16 12" aria-hidden="true">
    <rect width="16" height="12" fill="#b22234" />
    {[1, 3, 5, 7, 9].map((y) => (
      <rect key={y} y={y} width="16" height="1" fill="#fff" />
    ))}
    <rect width="7" height="7" fill="#3c3b6e" />
    {[1, 3, 5].map((y) =>
      [1, 3, 5].map((x) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#fff" />
      ))
    )}
  </svg>
);

/** Union Jack, simplified: diagonals, cross, and the white fimbriation. */
const UkFlag: React.FC = () => (
  <svg {...SIZE} viewBox="0 0 16 12" aria-hidden="true">
    <rect width="16" height="12" fill="#012169" />
    <path d="M0 0 L16 12 M16 0 L0 12" stroke="#fff" strokeWidth="3" />
    <path d="M0 0 L16 12 M16 0 L0 12" stroke="#c8102e" strokeWidth="1.5" />
    <path d="M8 0 V12 M0 6 H16" stroke="#fff" strokeWidth="4" />
    <path d="M8 0 V12 M0 6 H16" stroke="#c8102e" strokeWidth="2" />
  </svg>
);

/** Japan: white field, centred red disc. */
const JpFlag: React.FC = () => (
  <svg {...SIZE} viewBox="0 0 16 12" aria-hidden="true">
    <rect width="16" height="12" fill="#fff" />
    <circle cx="8" cy="6" r="3.4" fill="#bc002d" />
  </svg>
);

/** China: red field with the large star and four smaller ones. */
const CnFlag: React.FC = () => (
  <svg {...SIZE} viewBox="0 0 16 12" aria-hidden="true">
    <rect width="16" height="12" fill="#de2910" />
    <circle cx="3.2" cy="3.2" r="1.6" fill="#ffde00" />
    <circle cx="6.4" cy="1.4" r="0.6" fill="#ffde00" />
    <circle cx="7.6" cy="3" r="0.6" fill="#ffde00" />
    <circle cx="7.6" cy="5" r="0.6" fill="#ffde00" />
    <circle cx="6.4" cy="6.4" r="0.6" fill="#ffde00" />
  </svg>
);

/** India: saffron, white, green, with the Ashoka Chakra. */
const InFlag: React.FC = () => (
  <svg {...SIZE} viewBox="0 0 16 12" aria-hidden="true">
    <rect width="16" height="4" fill="#ff9933" />
    <rect y="4" width="16" height="4" fill="#fff" />
    <rect y="8" width="16" height="4" fill="#138808" />
    <circle cx="8" cy="6" r="1.7" fill="none" stroke="#000080" strokeWidth="0.5" />
    <circle cx="8" cy="6" r="0.4" fill="#000080" />
  </svg>
);

/** South Korea: taegeuk and two of the four trigrams. */
const KrFlag: React.FC = () => (
  <svg {...SIZE} viewBox="0 0 16 12" aria-hidden="true">
    <rect width="16" height="12" fill="#fff" />
    <path d="M8 3 a3 3 0 0 1 0 6 a1.5 1.5 0 0 0 0 -3 a1.5 1.5 0 0 1 0 -3 z" fill="#cd2e3a" />
    <path d="M8 3 a3 3 0 0 0 0 6 a1.5 1.5 0 0 1 0 -3 a1.5 1.5 0 0 0 0 -3 z" fill="#0047a0" />
    {[2.2, 3, 3.8].map((y) => (
      <rect key={`tl-${y}`} x="1.4" y={y} width="2.4" height="0.5" fill="#000" />
    ))}
    {[8.2, 9, 9.8].map((y) => (
      <rect key={`br-${y}`} x="12.2" y={y} width="2.4" height="0.5" fill="#000" />
    ))}
  </svg>
);

/** English shows both marks, since the reference wording belongs to neither alone. */
const EnFlag: React.FC = () => (
  <span style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
    <UsFlag />
    <UkFlag />
  </span>
);

export const LANGUAGES: {
  code: LanguageCode;
  label: string;
  Flag: React.FC;
}[] = [
  { code: 'en', label: 'English', Flag: EnFlag },
  { code: 'ja', label: '日本語', Flag: JpFlag },
  { code: 'zh', label: '中文', Flag: CnFlag },
  { code: 'hi', label: 'हिन्दी', Flag: InFlag },
  { code: 'ko', label: '한국어', Flag: KrFlag },
];
