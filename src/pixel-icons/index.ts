// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Public entry of the pixel icon part. The app imports from here only; nothing
// in this folder imports from the rest of the app (see isolation.test.ts), so
// the folder can move to Portus as its own package after 2026-10-16.
export {
  PixelIcon,
  IconLabel,
  TIGHT_ICON,
  PixelIconTextScale,
  iconMultipleForTextScale,
  type PixelIconProps,
} from './PixelIcon';
export { PIXEL_ICONS, type PixelIconName, type PixelIconData, type PixelRun, type PixelRampRun } from './pixelIconData';
export { ASAGI_RAMP, WARM_HUES, rampFill, type RampLevel, type RampHue } from './pixelIconPalette';
export { LABEL_ICONS, type LabelIconKey } from './labelIcons';
