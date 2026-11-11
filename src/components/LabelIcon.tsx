// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0

import React from 'react';
import {
  PixelIcon,
  PixelIconTextScale,
  iconMultipleForTextScale,
  type PixelIconName,
} from '../pixel-icons';

/** Every label icon's box has one width (owner 2026-10-06; audit the same
 *  day found the earlier em-based width varied with each label's font
 *  size): the icon's own pixel size for the current text scale (16, 32 or
 *  48 px, as PixelIcon picks it), identical in every usage. A fixed gap
 *  follows, so the first character of stacked labels lines up. */
export const LABEL_ICON_GAP = 4;

export function labelIconBoxPx(textScale: number, fixedScale?: 1 | 2 | 3): number {
  return 16 * (fixedScale ?? iconMultipleForTextScale(textScale));
}

/** A fixed-width, centred box for a label icon; with no icon it is an
 *  empty box of the same width, so text in a stack still lines up. */
export const LabelIconBox: React.FC<{ icon?: PixelIconName | null; fixedScale?: 1 | 2 | 3 }> = ({
  icon,
  fixedScale,
}) => {
  const textScale = React.useContext(PixelIconTextScale);
  const px = labelIconBoxPx(textScale, fixedScale);
  return (
    <span
      aria-hidden="true"
      data-testid="label-icon-box"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        width: px,
        minWidth: px,
        marginInlineEnd: LABEL_ICON_GAP,
        verticalAlign: 'middle',
        lineHeight: 0,
      }}
    >
      {icon ? <PixelIcon name={icon} scale={fixedScale} style={{ display: 'block' }} /> : null}
    </span>
  );
};

/** Icon box followed by its text; the text stays the accessible name. */
export const AlignedIconLabel: React.FC<{
  icon?: PixelIconName | null;
  children: React.ReactNode;
}> = ({ icon, children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0, verticalAlign: 'middle' }}>
    <LabelIconBox icon={icon} />
    <span data-testid="label-text" style={{ minWidth: 0 }}>
      {children}
    </span>
  </span>
);
