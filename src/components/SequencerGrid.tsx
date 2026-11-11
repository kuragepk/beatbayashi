// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { LabelIconBox, labelIconBoxPx } from './LabelIcon';
import React, { useEffect, useRef, useState } from 'react';
import { PixelIcon, IconLabel, LABEL_ICONS } from '../pixel-icons';
import { lanesAboveLimit, useSequencerStore } from '../store/sequencerStore';
import { fsPx, minTextPx, snapTextPx, snapTextPxDown, textScaleOf, useThemeStore } from '../theme/themeStore';
import {
  CORE_LANE_IDS,
  DEFAULT_LAYERS,
  DRUM_IDS,
  MAX_LANES,
  getPresetDisplayName,
  getPresetIds,
  type DrumId,
} from '../audio/synthPresets';
import { AudioEngine, MAX_LAYERS_PER_VOICE } from '../audio/AudioEngine';
import { ACCENT_LABELS, type Accent } from '../accent';
import { useT } from '../i18n/i18n';

const CATEGORY_LABEL: Record<DrumId, string> = {
  kick: 'Kick',
  tom: 'Tom',
  cymbal: 'Cymbal',
  clap: 'Clap',
};

/** Active-cell fill by accent (P2-16) — same teal family, rising brightness
 *  from weak to strong so the grid reads at a glance without a legend. */
const ACCENT_COLOR: Record<Accent, string> = {
  0: 'var(--app-accent-dim, #0a5951)',
  1: 'var(--app-accent, #0f8a80)',
  2: 'var(--app-accent-bright, #17c7b5)',
};

// templates/ui-system/tokens.json color.surface/border/text — the "+ Add
// layer" button reuses PanelFrame's header-button style (DESIGN_20260907
// §3): 22x20px-ish, header-button radius 3px, control surface/border.
const layerButtonBase: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: fsPx(10),
  backgroundColor: 'var(--app-control, #2a2a2a)',
  color: 'var(--app-muted, #ddd)',
  border: '1px solid var(--app-border-strong, #3d3d3d)',
  borderRadius: '6px',
  cursor: 'pointer',
};

const removeLayerButton: React.CSSProperties = {
  // min, not fixed: the pixel icon inside follows the text scale (16 px at
  // the 15 px default), so the button grows with it instead of overlapping.
  minWidth: 18,
  minHeight: 18,
  flexShrink: 0,
  padding: 0,
  fontSize: fsPx(10),
  lineHeight: 1,
  // Very dark enji (owner 2026-10-05): present, not loud. The icon keeps the
  // text colour (14.8:1 against this fill).
  backgroundColor: 'var(--app-remove, #3a0d14)',
  color: 'var(--app-text, #f0f0f0)',
  border: '1px solid var(--app-border-strong, #3d3d3d)',
  borderRadius: '6px',
  cursor: 'pointer',
};

/** M/S lane buttons (ISSUE-BEATBOX-011). Same shape/border as
 *  removeLayerButton; only the fill changes with state, and — per UI
 *  System §5-新-g (don't rely on colour alone) — the label text itself
 *  changes too ("M" -> "[M]", "S" -> "[S]"), reusing colours already in
 *  this file rather than inventing new ones: removeLayerButton's red for
 *  muted (same "this lane won't sound" meaning as removing it), and the
 *  strong-accent teal for soloed (same "this is what's emphasised"
 *  meaning it already has in the grid). */
const laneToggleButton: React.CSSProperties = {
  // min, not fixed: at large text "[M]" is wider than 20 px and would spill
  // over its neighbour.
  minWidth: 20,
  minHeight: 18,
  flexShrink: 0,
  padding: '0 2px',
  fontSize: fsPx(10),
  fontWeight: 700,
  lineHeight: 1,
  backgroundColor: 'var(--app-control, #2a2a2a)',
  color: 'var(--app-muted, #ddd)',
  border: '1px solid var(--app-border-strong, #3d3d3d)',
  borderRadius: '6px',
  cursor: 'pointer',
};

const laneMutedButton: React.CSSProperties = {
  backgroundColor: 'var(--app-danger-strong, #8a3030)',
  color: 'var(--app-text, #f0f0f0)',
};

const laneSoloedButton: React.CSSProperties = {
  backgroundColor: ACCENT_COLOR[2],
  color: 'var(--app-bg, #0a0a0a)',
};

/** Matte pads (owner 2026-10-06: "光沢はほぼ抑えて、マットな質感"): no
 *  gloss and no glow. Only a 1 px lighter top edge and a 1 px darker bottom
 *  edge keep the soft silicone shape; ON is the flat lit fill. Main and sub
 *  pads share the same edges, so they read as one kind of button. */
const MATTE_EDGES =
  'inset 0 1px 0 color-mix(in srgb, var(--app-text, #fff) 7%, transparent), inset 0 -1px 0 color-mix(in srgb, var(--app-bg, #000) 45%, transparent)';
const PAD_SHADOW_OFF = MATTE_EDGES;
/** ON uses the same matte edges at every strength; in the 3-level style the
 *  strength shows in the fill only. */
function padShadowOn(_level: Accent): string {
  return MATTE_EDGES;
}
const SUB_SHADOW_OFF = MATTE_EDGES;
const SUB_SHADOW_ON = MATTE_EDGES;

/** One lane row's frame, shared by every lane and by the add-lane row
 *  (owner request 2026-10-05: the add-lane row wears the same frame). */
const LANE_ROW_CLASS = 'bb-lane-row';
const laneRowStyle: React.CSSProperties = {
  display: 'flex',
  // The label frame takes the height of its pad unit (owner 2026-10-06).
  alignItems: 'stretch',
  // Rows touch like a hardware step sequencer (owner 2026-10-05).
  marginBottom: 0,
};
const laneLabelColumnStyle: React.CSSProperties = {
  flexShrink: 0,
  // The label is its own framed cell, joined to the step cells (same 1 px
  // border, touching; owner 2026-10-05).
  padding: 'clamp(1px, 0.3vw, 2px) clamp(1px, 0.4vw, 4px)',
  boxSizing: 'border-box',
  border: '1px solid var(--app-border-strong, #5a5a5a)',
  borderRadius: 8,
  boxShadow: PAD_SHADOW_OFF,
  backgroundColor: 'var(--app-panel-alt, #1c1c1c)',
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
};

/** Square pad + half-height sub pad = one unit, 1.5 pads tall (owner
 *  2026-10-06). The pad size is taken from the label's own content height,
 *  so a lane's label frame and its unit are the same height and the grid
 *  tiles without gaps inside an instrument. */
export const UNIT_HEIGHT_IN_PADS = 1.5;
/** Largest pad, px. 40 until 2026-10-19; then 44 so the lane label's text can
 *  be the Tempo label's size (owner chose this over a compact-only label), and
 *  46 once text sizes snap to even .0/.5 steps: the Tempo size is 18 px at the
 *  default, which needs a 23 px label line = half a 46 px pad (x 0.8 rule). */
export const PAD_MAX_PX = 46;
export function padSizeForLabel(labelContentPx: number): number {
  if (!(labelContentPx > 0)) return 17;
  return Math.max(14, Math.min(PAD_MAX_PX, Math.round(labelContentPx / UNIT_HEIGHT_IN_PADS)));
}

/** Small gap between instruments (Kick / Tom / ...), widening with the
 *  window: a rhythm-kit look, one strip per instrument. */
/**
 * Height of one line of the full (wide) lane label: the name row and one row
 * per sound stack inside the label frame, whose height is
 * `mainCell + subRows * subCell` and which has a 1 px border on each side.
 * A line of `round(cell / 2)` px (the old value) made the stack taller than
 * the frame's inside (the frame is only 1.5 pads tall and the pad heights are
 * rounded), so the last select was cut at the bottom. This returns the
 * largest line height that fits, for the tallest stack (`maxSubs` extra
 * layers), never above `desired`.
 */
export function labelLineFitPx(mainCell: number, subCell: number, maxSubs: number, desired: number): number {
  let fit = desired;
  for (let k = 1; k <= Math.max(1, maxSubs); k++) {
    const inner = mainCell + k * subCell - 2;
    fit = Math.min(fit, Math.floor(inner / (k + 2)));
  }
  return Math.max(6, fit);
}

export function instrumentGap(availablePx: number): number {
  return availablePx > 0 && availablePx < 600 ? 2 : availablePx < 1280 ? 3 : 4;
}

/** Floor for the add-lane row: a 24 px touch target for its + buttons plus
 *  a little room for the label text. */
export const ADD_LANE_ROW_MIN_PX = 28;

/** The add-lane row is half a lane row's measured height, never below the
 *  touch-target floor. */
export function addLaneRowHeight(laneRowPx: number): number {
  return Math.max(ADD_LANE_ROW_MIN_PX, Math.round(laneRowPx / 2));
}

/** True when a label of naturalPx does not fit roomPx on one line. A room of
 *  0 means "not measured yet" (or no layout, as in jsdom): keep the text. */
export function addLabelIsTooWide(naturalPx: number, roomPx: number): boolean {
  return roomPx > 0 && naturalPx > roomPx + 0.5;
}


/** Side padding of the grid container, shrinking with the window (owner
 *  2026-10-06): 20 px wide, down to 3 px at phone width. 0 = not measured. */
export function gridPadX(available: number): number {
  return available === 0
    ? 20
    : available < 420
      ? 3
      : available < 640
        ? 6
        : available < 960
          ? 10
          : available < 1280
            ? 14
            : 20;
}

/** Pad width in whole pixels for a label column of labelPx. Cells touch (no
 *  gap), so the usable width is shared by all steps; PAD_MAX_PX at most; below
 *  `floor` the pad stops shrinking (and the grid scrolls inside itself).
 *  Above 128 steps the floor is 6 px. */
export function padWidthFor(available: number, labelPx: number, floor: number, totalSteps: number): number {
  const usable = Math.max(0, available - labelPx - 4 - gridPadX(available) * 2);
  const slot = usable > 0 ? usable / totalSteps : 32;
  return Math.floor(Math.max(totalSteps > 128 ? 6 : floor, Math.min(PAD_MAX_PX, slot)));
}

/** Smallest pad the compact label may leave (owner 2026-10-07: all 16
 *  columns visible at 360 px). */
export const COMPACT_MIN_PAD_PX = 16;
/** Icon-only compact label: border 2 + padding ~6 + icon 16 + its 4 px gap +
 *  4 px + the 18 px lane-more button = 52 px. */
export const COMPACT_ICON_ONLY_LABEL_PX = 52;
/** Compact label with the name: icon box 16 + 4 gap, then the name, 4 px, the
 *  18 px button, and 10 px of frame and padding. */
const COMPACT_NAME_CHROME_PX = 16 + 4 + 4 + 18 + 10;
/** Wanted name font = 13 px x text scale (13 px at the default size, the
 *  old fixed maximum), never below 8 px. The lane row height caps it. */
export const COMPACT_NAME_FONT_BASE = 13;

export interface CompactLabelLayout {
  labelWidth: number;
  cellWidth: number;
  /** false: icon + lane-more button only; the name stays in the accessible name. */
  showName: boolean;
  /** Lane-name font (px); meaningful when showName is true. */
  nameFontPx: number;
}

/** Sizing of the compact label (narrow screens or large text). The name is
 *  shown only when (a) the 30 % label column still leaves pads of at least 16 px,
 *  (b) the name font, wanted = 13 px x text scale and capped at half the unit
 *  height, is at least min(wanted, 12) px and at least half of wanted (so a
 *  large text setting never leaves a tiny name next to huge text) and
 *  (c) the name fits the column. Otherwise the label is icon-only (52 px),
 *  which at an available width of 345 px leaves 17 px pads for all 16 columns.
 *  nameChars = characters of the longest lane name. */
export function compactLabelLayout(
  available: number,
  textScale: number,
  totalSteps: number,
  nameChars = 6
): CompactLabelLayout {
  const iconOnly = (): CompactLabelLayout => ({
    labelWidth: COMPACT_ICON_ONLY_LABEL_PX,
    cellWidth: padWidthFor(available, COMPACT_ICON_ONLY_LABEL_PX, COMPACT_MIN_PAD_PX, totalSteps),
    showName: false,
    nameFontPx: 0,
  });
  if (!(available > 0)) {
    // Not measured yet: keep the name, as before.
    const labelWidth = 56;
    return {
      labelWidth,
      cellWidth: padWidthFor(available, labelWidth, COMPACT_MIN_PAD_PX, totalSteps),
      showName: true,
      nameFontPx: snapTextPx(Math.max(8, COMPACT_NAME_FONT_BASE * textScale)),
    };
  }
  const labelWidth = Math.max(56, Math.floor(available * 0.3));
  const cellWidth = padWidthFor(available, labelWidth, COMPACT_MIN_PAD_PX, totalSteps);
  const wanted = snapTextPx(Math.max(8, COMPACT_NAME_FONT_BASE * textScale));
  const rowCap = Math.floor((cellWidth + Math.max(6, Math.round(cellWidth / 2))) * 0.5);
  const nameFontPx = snapTextPxDown(Math.min(wanted, rowCap));
  // Never below the smallest text (the Tempo label's size, owner 2026-10-19).
  const fontOk = nameFontPx >= Math.min(wanted, minTextPx(textScale)) && nameFontPx * 2 >= wanted;
  const nameW = Math.ceil(Math.max(1, nameChars) * nameFontPx * 0.62);
  const roomOk = labelWidth >= nameW + COMPACT_NAME_CHROME_PX;
  // cellWidth is floored at 16, so test the real slot: 16 px pads must fit
  // beside the name (above 128 steps the grid scrolls anyway).
  const slot = (available - labelWidth - 4 - gridPadX(available) * 2) / totalSteps;
  const padsOk = totalSteps > 128 || slot >= COMPACT_MIN_PAD_PX;
  if (!padsOk || !fontOk || !roomOk) return iconOnly();
  return { labelWidth, cellWidth, showName: true, nameFontPx };
}

/** True when 2 bars per row fit with pads at the PAD_MAX_PX cap beside the widest
 *  (316 px) label; only worth it with more than 2 bars. */
export function wideTwoBarRows(available: number, bars: number, resolution: number): boolean {
  if (!(available > 0) || bars <= 2) return false;
  const usable = available - 316 - 4 - gridPadX(available) * 2;
  return usable >= 2 * resolution * PAD_MAX_PX;
}

export const SequencerGrid: React.FC<{
  audioEngine: AudioEngine | null;
  onSoundChange: () => void;
}> = ({ audioEngine, onSoundChange }) => {
  const {
    lanes,
    grid,
    subGrid,
    accents,
    currentStep,
    cycleAccent,
    toggleSubCell,
    subLayerAdded,
    subLayerRemoved,
    resolution,
    bars,
    isPlaying,
    addLane,
    removeLane,
    toggleMute,
    toggleSolo,
  } = useSequencerStore();

  const t = useT();
  const lanesOver = lanesAboveLimit(lanes);
  const loadRefused = useSequencerStore((st) => st.loadRefused);
  const dismissLoadRefused = useSequencerStore((st) => st.dismissLoadRefused);

  // Keyboard (owner 2026-10-06): one pad in the grid is in the tab order
  // (roving tabindex). Arrow keys move it; Space/Enter switch the main step
  // (the button's own click); Shift+Space switches the first sub step.
  const [focusCell, setFocusCell] = useState({ lane: 0, step: 0 });
  // Compact mode: each lane's M/S and sound selects open on demand, so the
  // instruments stay 2-4 px apart (audit 2026-10-06).
  const [openLane, setOpenLane] = useState<string | null>(null);
  const moveFocus = (lane: number, step: number) => {
    const total = bars * resolution;
    const nextLane = Math.max(0, Math.min(lanes.length - 1, lane));
    const nextStep = Math.max(0, Math.min(total - 1, step));
    setFocusCell({ lane: nextLane, step: nextStep });
    const el = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-cell="${nextLane}:${nextStep}"]`
    );
    el?.focus();
  };
  const onStyle = useThemeStore((st) => st.onStyle);
  const markMode = onStyle === 'mark';
  // 'single' and 'mark' light every ON pad at the normal level; only
  // 'brightness' shows the strength in the fill and glow.
  const litLevel = (accent: Accent): Accent => (onStyle === 'brightness' ? accent : 1);

  const containerRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  const firstLaneRowRef = useRef<HTMLDivElement>(null);
  const firstLabelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totalSteps = bars * resolution;
  const stepsPerBar = resolution;
  // Wide screens (owner 2026-10-09): when the pads are already at their PAD_MAX_PX
  // cap and two bars fit side by side beside the widest label, a row holds 2
  // bars and further bars continue in the next row group. Pad size is
  // unchanged; narrow screens keep one row for every bar.
  const rowBars = wideTwoBarRows(available, bars, resolution) ? 2 : bars;
  const rowSteps = rowBars * resolution;
  const groupCount = Math.ceil(bars / rowBars);
  // Past this many steps, shrinking cells to fit the viewport makes them too
  // small to tap reliably — scroll horizontally instead of squeezing further.
  const isOverflow = rowSteps > 128;

  const textScale = useThemeStore((st) => textScaleOf(st.settings));
  const narrow = available > 0 && available < 600;
  const labelBase = available > 0 && available < 720 ? 128 : 316;
  const labelCap =
    available > 0
      ? Math.min(Math.floor(available * 0.45), available - rowSteps * 26 - 44)
      : Infinity;
  const wideLabelWidth = Math.max(labelBase, Math.min(Math.round(labelBase * textScale), labelCap));

  // Cells are sized to consume exactly the space available: the grid always
  // fits the window, so nothing ever scrolls sideways — unless there are more
  // than 128 steps on screen, in which case cells keep a usable minimum width
  // and the grid scrolls instead.
  // Side padding shrinks with the window (owner 2026-10-06): 20 px wide,
  // down to 3 px at phone width. Kept in px here because the cell size
  // below is computed from it.
  const padX = gridPadX(available);
  const containerPaddingX = padX * 2;
  // Cells touch (owner 2026-10-05, TR-style): no gap between steps.
  const gap = 0;
  const cellFor = (labelPx: number, floor: number) => padWidthFor(available, labelPx, floor, rowSteps);
  // Owner 2026-10-06 (option A): the label frame is never taller than its
  // pad unit. In the full label each line (name, then one per sound) is one
  // sub pad tall, which fits the unit exactly; when a line that short
  // cannot hold the text at the chosen size, or on narrow screens, the
  // label switches to the compact form (icon and name; M/S and the selects
  // open under the pads).
  const wideCell = cellFor(wideLabelWidth, 12);
  const wideLine = Math.max(6, Math.round(wideCell / 2));
  // The smallest text size (the Tempo label's, owner 2026-10-19), snapped:
  // 18 px at the default fits the 23 px line of a 46 px pad (x 0.8 rule).
  const labelFontPx = minTextPx(textScale);
  const compact = narrow || wideLine < 16 || labelFontPx > wideLine * 0.8;
  // Compact (owner 2026-10-07): when the name cannot coexist with 16 px pads
  // (360 px: all 16 columns must show), the label is icon + lane-more only.
  // 16 px floor; when 16 px pads still do not fit, the grid scrolls inside
  // itself (the page never does).
  const longestName = lanes.reduce((m, l) => Math.max(m, l.label.length), 4);
  const compactLayout = compactLabelLayout(available, textScale, rowSteps, longestName);
  const labelWidth = compact ? compactLayout.labelWidth : wideLabelWidth;
  const showName = !compact || compactLayout.showName;
  const cellWidth = compact ? compactLayout.cellWidth : wideCell;
  // Fit inside the label frame (see labelLineFitPx); was round(cellWidth / 2),
  // which cut the bottom of the last select.
  const labelLinePx = labelLineFitPx(
    Math.round(cellWidth),
    Math.max(6, Math.round(cellWidth / 2)),
    MAX_LAYERS_PER_VOICE - 1,
    Math.max(6, Math.round(cellWidth / 2)),
  );
  const labelIconPx = labelIconBoxPx(textScale, 1);
  const labelBtnPx = labelLinePx + 4;
  const labelRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `${labelIconPx + 4}px minmax(0, 1fr) ${labelBtnPx}px ${labelBtnPx}px ${labelBtnPx}px`,
    gridTemplateRows: `${labelLinePx}px`,
    columnGap: 2,
    alignItems: 'center',
    minWidth: 0,
    fontSize: labelFontPx,
  };
  const gridButton: React.CSSProperties = {
    width: labelBtnPx,
    height: labelLinePx,
    minWidth: 0,
    minHeight: 0,
    padding: 0,
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    fontSize: labelFontPx,
    lineHeight: 1,
  };
  const cellSlot = cellWidth + gap;
  const barWidth = stepsPerBar * cellSlot;

  // Owner request (2026-09-24): cells are square (height = width), so the
  // rows get lower as cellWidth shrinks on narrow screens — the ISSUE-025
  // minimum (minCell) already floors cellWidth, so square cells never drop
  // below that floor. Lanes added via "+ Add layer" (P2-17, not one of the
  // four permanent categories) are half that height, same width per step;
  // that half can go below minCell on narrow screens by design — it is a
  // thinner sub-row, not a second minimum tap target. Rounded to whole
  // pixels so borders don't blur on sub-pixel boundaries.
  const padRadius = Math.max(2, Math.round(cellWidth * 0.22));
  const mainCellHeight = Math.round(cellWidth);
  // Sub rows: half a pad's height, same width (owner 2026-10-06; was 1/3).
  const subCellHeight = Math.max(6, Math.round(cellWidth / 2));
  // Same corners as a main pad (owner 2026-10-06: the sub pad must look
  // like the same kind of button), limited to half the sub pad's height.
  const subRadius = Math.max(1, Math.min(padRadius, Math.floor(subCellHeight / 2)));

    // At 1/2 and 1/4 every step is at least a beat, so accent them all.
  const stepsPerBeat = resolution / 4;

  return (
    <div
      ref={containerRef}
      style={{
        padding: `2px ${padX}px ${Math.min(12, padX + 2)}px`,
        backgroundColor: 'var(--app-panel, #1a1a1a)',
        color: 'var(--app-text, #fff)',
        overflowX: isOverflow || cellWidth * rowSteps > Math.max(0, available - labelWidth - 4 - containerPaddingX) ? 'auto' : 'visible',
        // Up to 32 bars x 32 steps: the grid scrolls inside itself and must
        // never widen the page.
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
      }}
    >
      {/* One row per lane: layer stack on the left, steps on the right */}
      {Array.from({ length: groupCount }).map((_g, groupIdx) => {
      const groupStart = groupIdx * rowSteps;
      const groupSteps = Math.min(rowSteps, totalSteps - groupStart);
      const groupBars = groupSteps / resolution;
      return (
      <React.Fragment key={`group-${groupIdx}`}>
      {lanes.map((lane, laneIdx) => {
        const isCore = CORE_LANE_IDS.has(lane.id);
        // Owner 2026-10-09: rows after the first show only icon + name;
        // M/S, sound select, remove and add live in the first row only.
        const continued = groupIdx > 0;
        // Before the first user gesture, audioEngine is still null (browsers
        // refuse to start an AudioContext without one) and getLayers() has
        // nothing to return. Fall back to the shipped defaults so the row
        // still shows what will play, just disabled — matching how every
        // other control in this panel handles "audio not started yet"
        // rather than rendering nothing (STRUCTURE.md C5: a voice row always
        // shows its select).
        const layers = audioEngine?.getLayers(lane.id) ?? DEFAULT_LAYERS[lane.category];
        const atMax = layers.length >= MAX_LAYERS_PER_VOICE;
        const subCount = Math.max(0, layers.length - 1);
        const subRowCount = Math.max(1, subCount);

        // Main and sub sound selects. Wide: inside the label column.
        // Narrow (owner 2026-10-06): a row of their own under the pads, so
        // the label column stays compact and the pads keep their room.
        const laneButtons = (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
                {/* Mute/solo (ISSUE-BEATBOX-011) — every lane, added or
                    original. Actual audibility (isLaneAudible) accounts for
                    every lane's mute/solo together, not just this one. */}
                <button
                  type="button"
                  onClick={() => toggleMute(lane.id)}
                  aria-pressed={lane.muted}
                  aria-label={`Mute lane ${lane.label}`}
                  title={lane.muted ? 'Unmute this lane' : 'Mute this lane'}
                  style={{
                    ...laneToggleButton,
                    ...(lane.muted ? laneMutedButton : {}),
                  }}
                >
                  {lane.muted ? '[M]' : 'M'}
                </button>
                <button
                  type="button"
                  onClick={() => toggleSolo(lane.id)}
                  aria-pressed={lane.solo}
                  aria-label={`Solo lane ${lane.label}`}
                  title={lane.solo ? 'Unsolo this lane' : 'Solo this lane'}
                  style={{
                    ...laneToggleButton,
                    ...(lane.solo ? laneSoloedButton : {}),
                  }}
                >
                  {lane.solo ? '[S]' : 'S'}
                </button>

                {/* Only added lanes (P2-17) can be removed — the original
                    four are the grid's permanent shape. */}
                {!isCore && (
                  <button
                    type="button"
                    onClick={() => {
                      if (removeLane(lane.id)) {
                        audioEngine?.removeLane(lane.id);
                        onSoundChange();
                      }
                    }}
                    aria-label={`Remove lane ${lane.label}`}
                    title="Remove this lane"
                    style={{
                      ...removeLayerButton,
                      minWidth: 16,
                      minHeight: 16,
                      fontSize: fsPx(9),
                    }}
                  >
                    {/* 16 px icon in a 16 px button: its empty edge overlaps the border. */}
                    <PixelIcon name="close" style={{ display: 'block', margin: '-1px' }} />
                  </button>
                )}
          </span>
        );
        const sounds = (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 2,
              flex: compact ? '1 1 auto' : '100 1 200px',
              minWidth: 0,
            }}
          >
            {layers.map((layer, layerIdx) => (
              <div
                key={layer.layerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  // Main takes the room; each sub sits beside it, smaller.
                  flex: layerIdx === 0 ? '1 1 108px' : '1 1 104px',
                  minWidth: 0,
                }}
              >
                {/* Sound number: 1 = main (square pads), 2+ = subs
                    (the half-height rows), matching the step rows. */}
                <span
                  aria-hidden="true"
                  data-testid="sound-number"
                  style={{
                    flexShrink: 0,
                    minWidth: 14,
                    padding: '0 3px',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                    fontSize: fsPx(9),
                    fontWeight: 700,
                    lineHeight: 1.4,
                    borderRadius: 4,
                    border: '1px solid var(--app-border-strong, #4a4a4a)',
                    color: layerIdx === 0 ? 'var(--app-voice-label, #2ba695)' : 'var(--app-muted, #aaa)',
                    backgroundColor: 'var(--app-control, #2a2a2a)',
                  }}
                >
                  {layerIdx + 1}
                </span>
                <select
                  value={layer.presetId}
                  disabled={!audioEngine}
                  onChange={(e) => {
                    audioEngine?.updateLayer(lane.id, layer.layerId, {
                      presetId: e.target.value,
                    });
                    onSoundChange();
                    audioEngine?.playDrum(lane.id);
                  }}
                  aria-label={`${lane.label} layer ${layerIdx + 1} sound`}
                  // The full sound name is in the title: a narrow label
                  // column can cut the visible text of the select.
                  title={`${getPresetDisplayName(lane.category, layer.presetId)} — ${
                    layerIdx === 0
                      ? "change this voice's primary sound"
                      : `change layer ${layerIdx + 1}'s sound`
                  }`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    // Main sound is the primary control: larger. Subs are
                    // secondary: smaller (owner 2026-10-05).
                    padding: layerIdx === 0 ? '4px 4px' : '2px 2px',
                    fontSize: fsPx(layerIdx === 0 ? 12 : 10),
                    fontWeight: layerIdx === 0 ? 600 : 400,
                    backgroundColor: 'var(--app-panel-alt, #242424)',
                    color: audioEngine ? 'var(--app-muted, #ddd)' : 'var(--app-muted, #666)',
                    border: '1px solid var(--app-border-strong, #4a4a4a)',
                    borderRadius: '6px',
                    cursor: audioEngine ? 'pointer' : 'not-allowed',
                  }}
                >
                  {!audioEngine && <option value="">— audio off —</option>}
                  {getPresetIds(lane.category).map((id) => (
                    <option key={id} value={id}>
                      {getPresetDisplayName(lane.category, id)}
                    </option>
                  ))}
                </select>

                {/* Layer 1 can never be removed — a voice can't be emptied. */}
                {layerIdx > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (audioEngine?.removeLayer(lane.id, layer.layerId)) {
                        subLayerRemoved(lane.id, layerIdx - 1);
                      }
                      onSoundChange();
                    }}
                    disabled={!audioEngine}
                    aria-label={`Remove layer ${layerIdx + 1} from ${lane.label}`}
                    title="Remove this layer"
                    style={{
                      ...removeLayerButton,
                      opacity: audioEngine ? 1 : 0.35,
                      cursor: audioEngine ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <PixelIcon name="close" style={{ display: 'block', margin: '0 auto' }} />
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                if (audioEngine?.addLayer(lane.id)) {
                  subLayerAdded(lane.id, audioEngine.getLayers(lane.id).length - 2);
                }
                onSoundChange();
              }}
              disabled={!audioEngine || atMax}
              aria-label={`Add layer to ${lane.label}`}
              title={
                !audioEngine
                  ? 'Start audio first'
                  : atMax
                    ? `Up to ${MAX_LAYERS_PER_VOICE} layers per voice`
                    : 'Add a sub sound to this lane (same step row)'
              }
              style={{
                ...layerButtonBase,
                flex: '0 0 auto',
                textAlign: 'left',
                opacity: !audioEngine || atMax ? 0.35 : 1,
                cursor: !audioEngine || atMax ? 'not-allowed' : 'pointer',
              }}
            >
              <IconLabel icon="plus" tight>{t('addSub')}</IconLabel>
            </button>
          </div>
        );

        return (
          <React.Fragment key={`${groupIdx}-${lane.id}`}>
          <div
            ref={laneIdx === 0 && groupIdx === 0 ? firstLaneRowRef : undefined}
            className={LANE_ROW_CLASS}
            data-testid="lane-row"
            style={{
              ...laneRowStyle,
              marginBottom: laneIdx < lanes.length - 1 ? instrumentGap(available) : 0,
            }}
          >
            <div
              data-testid="lane-label"
              {...(continued ? { 'aria-hidden': true as const } : {})}
              {...(compact && !showName && !continued
                ? { role: 'group' as const, 'aria-label': lane.label, title: lane.label }
                : {})}
              style={{
                ...laneLabelColumnStyle,
                width: labelWidth,
                // Never taller than the pad unit (owner 2026-10-06, option A).
                height: mainCellHeight + subRowCount * subCellHeight,
                overflow: 'hidden',
                padding: compact ? laneLabelColumnStyle.padding : '0 2px',
              }}
            >
              {compact ? (
              <div
                ref={laneIdx === 0 && groupIdx === 0 ? firstLabelRef : undefined}
                data-testid="lane-label-content"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  columnGap: 6,
                  rowGap: 2,
                  width: '100%',
                  minWidth: 0,
                }}
              >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  // Wraps at large text: the name takes its own line and
                  // the M/S/remove buttons move below instead of overlapping.
                  flexWrap: 'wrap',
                  gap: 4,
                  flex: '1 1 90px',
                  minWidth: 0,
                }}
              >
                {compact && !showName ? (
                  /* Icon-only label (owner 2026-10-07, "ラベルをアイコンだけにする"):
                     the name stays as the accessible name and tooltip. */
                  <span
                    role="img"
                    aria-label={lane.label}
                    title={lane.label}
                    data-testid="lane-name-icon-only"
                    style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}
                  >
                    <LabelIconBox icon={LABEL_ICONS[lane.category]} fixedScale={1} />
                  </span>
                ) : (
                <span
                  title={lane.label}
                  data-testid="lane-name"
                  style={{
                    // Compact name follows the text-size setting (rule C9),
                    // capped by the lane row height inside compactLabelLayout;
                    // when it no longer fits, the label is icon-only.
                    fontSize: compact ? `${compactLayout.nameFontPx}px` : fsPx(11),
                    fontWeight: 700,
                    color: 'var(--app-voice-label, #2ba695)',
                    flex: '1 1 auto',
                    minWidth: 0,
                    maxWidth: '100%',
                    ...(compact
                      ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center' }
                      : { overflowWrap: 'anywhere' }),
                  }}
                >
                  <LabelIconBox icon={LABEL_ICONS[lane.category]} fixedScale={compact ? 1 : undefined} />
                  {lane.label}
                </span>
                )}
                {compact && !continued && (
                  <button
                    type="button"
                    data-testid="lane-more"
                    aria-expanded={openLane === lane.id}
                    aria-label={t('laneSettings', { lane: lane.label })}
                    title={t('laneSettings', { lane: lane.label })}
                    onClick={() => setOpenLane((v) => (v === lane.id ? null : lane.id))}
                    style={{
                      ...laneToggleButton,
                      minWidth: 18,
                      minHeight: 16,
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PixelIcon
                      name={openLane === lane.id ? 'arrow-up' : 'arrow-down'}
                      scale={1}
                      style={{ display: 'block' }}
                    />
                  </button>
                )}

              </div>

              </div>
              ) : (
              /* Fixed column grid shared by every lane (owner 2026-10-06):
                 [icon][name][M][S][remove] then [1][main][ ][+sub],
                 [2][sub][x]... Same template and width in every lane, so
                 each column sits at the same x everywhere. */
              <div
                ref={laneIdx === 0 && groupIdx === 0 ? firstLabelRef : undefined}
                data-testid="lane-label-content"
                style={{ display: 'grid', rowGap: 0, width: '100%', minWidth: 0, alignSelf: 'flex-start' }}
              >
                <div data-testid="lane-label-head" style={continued ? { ...labelRowStyle, gridTemplateColumns: `${labelIconPx + 4}px minmax(0, 1fr)` } : labelRowStyle}>
                  <span data-col="icon" style={{ display: 'inline-flex', justifyContent: 'center' }}>
                    <LabelIconBox icon={LABEL_ICONS[lane.category]} fixedScale={1} />
                  </span>
                  <span
                    data-col="name"
                    title={lane.label}
                    style={{
                      fontSize: snapTextPx(labelFontPx + 1),
                      fontWeight: 700,
                      color: 'var(--app-voice-label, #2ba695)',
                      minWidth: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {lane.label}
                  </span>
                  {!continued && (<>
                  <button
                    type="button"
                    data-col="m"
                    onClick={() => toggleMute(lane.id)}
                    aria-pressed={lane.muted}
                    aria-label={`Mute lane ${lane.label}`}
                    title={lane.muted ? 'Unmute this lane' : 'Mute this lane'}
                    style={{ ...laneToggleButton, ...gridButton, ...(lane.muted ? laneMutedButton : {}) }}
                  >
                    {lane.muted ? '[M]' : 'M'}
                  </button>
                  <button
                    type="button"
                    data-col="s"
                    onClick={() => toggleSolo(lane.id)}
                    aria-pressed={lane.solo}
                    aria-label={`Solo lane ${lane.label}`}
                    title={lane.solo ? 'Unsolo this lane' : 'Solo this lane'}
                    style={{ ...laneToggleButton, ...gridButton, ...(lane.solo ? laneSoloedButton : {}) }}
                  >
                    {lane.solo ? '[S]' : 'S'}
                  </button>
                  {!isCore ? (
                    <button
                      type="button"
                      data-col="x"
                      onClick={() => {
                        if (removeLane(lane.id)) {
                          audioEngine?.removeLane(lane.id);
                          onSoundChange();
                        }
                      }}
                      aria-label={`Remove lane ${lane.label}`}
                      title="Remove this lane"
                      style={{ ...removeLayerButton, ...gridButton }}
                    >
                      <PixelIcon name="close" scale={1} style={{ display: 'block', margin: '0 auto' }} />
                    </button>
                  ) : (
                    <span />
                  )}
                  </>)}
                </div>
                {!continued && layers.map((layer, layerIdx) => (
                  <div key={layer.layerId} data-testid="lane-label-layer" style={labelRowStyle}>
                    <span
                      aria-hidden="true"
                      data-testid="sound-number"
                      data-col="icon"
                      style={{
                        justifySelf: 'center',
                        minWidth: 14,
                        height: labelLinePx - 2,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 3px',
                        boxSizing: 'border-box',
                        fontSize: labelFontPx,
                        fontWeight: 700,
                        lineHeight: 1,
                        borderRadius: 4,
                        border: '1px solid var(--app-border-strong, #4a4a4a)',
                        color: layerIdx === 0 ? 'var(--app-voice-label, #2ba695)' : 'var(--app-muted, #aaa)',
                        backgroundColor: 'var(--app-control, #2a2a2a)',
                      }}
                    >
                      {layerIdx + 1}
                    </span>
                    <select
                      data-col="name"
                      value={layer.presetId}
                      disabled={!audioEngine}
                      onChange={(e) => {
                        audioEngine?.updateLayer(lane.id, layer.layerId, { presetId: e.target.value });
                        onSoundChange();
                        audioEngine?.playDrum(lane.id);
                      }}
                      aria-label={`${lane.label} layer ${layerIdx + 1} sound`}
                      title={`${getPresetDisplayName(lane.category, layer.presetId)} — ${
                        layerIdx === 0 ? "change this voice's primary sound" : `change layer ${layerIdx + 1}'s sound`
                      }`}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        height: labelLinePx,
                        boxSizing: 'border-box',
                        padding: '0 2px',
                        fontSize: labelFontPx,
                        lineHeight: 1,
                        fontWeight: layerIdx === 0 ? 600 : 400,
                        backgroundColor: 'var(--app-panel-alt, #242424)',
                        color: audioEngine ? 'var(--app-muted, #ddd)' : 'var(--app-muted, #666)',
                        border: '1px solid var(--app-border-strong, #4a4a4a)',
                        borderRadius: '6px',
                        cursor: audioEngine ? 'pointer' : 'not-allowed',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {!audioEngine && <option value="">— audio off —</option>}
                      {getPresetIds(lane.category).map((id) => (
                        <option key={id} value={id}>
                          {getPresetDisplayName(lane.category, id)}
                        </option>
                      ))}
                    </select>
                    {layerIdx > 0 ? (
                      <button
                        type="button"
                        data-col="m"
                        onClick={() => {
                          if (audioEngine?.removeLayer(lane.id, layer.layerId)) {
                            subLayerRemoved(lane.id, layerIdx - 1);
                          }
                          onSoundChange();
                        }}
                        disabled={!audioEngine}
                        aria-label={`Remove layer ${layerIdx + 1} from ${lane.label}`}
                        title="Remove this layer"
                        style={{
                          ...removeLayerButton,
                          ...gridButton,
                          opacity: audioEngine ? 1 : 0.35,
                          cursor: audioEngine ? 'pointer' : 'not-allowed',
                        }}
                      >
                        <PixelIcon name="close" scale={1} style={{ display: 'block', margin: '0 auto' }} />
                      </button>
                    ) : (
                      <span />
                    )}
                    {layerIdx === 0 ? (
                      <button
                        type="button"
                        data-col="s"
                        onClick={() => {
                          if (audioEngine?.addLayer(lane.id)) {
                            subLayerAdded(lane.id, audioEngine.getLayers(lane.id).length - 2);
                          }
                          onSoundChange();
                        }}
                        disabled={!audioEngine || atMax}
                        aria-label={`Add layer to ${lane.label}`}
                        title={
                          !audioEngine
                            ? 'Start audio first'
                            : atMax
                              ? `Up to ${MAX_LAYERS_PER_VOICE} layers per voice`
                              : 'Add a sub sound to this lane (same step row)'
                        }
                        style={{
                          ...layerButtonBase,
                          ...gridButton,
                          gridColumn: 'span 2',
                          width: 'auto',
                          padding: 0,
                          opacity: !audioEngine || atMax ? 0.35 : 1,
                          cursor: !audioEngine || atMax ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <PixelIcon name="plus" scale={1} style={{ display: 'block', margin: '0 auto' }} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              )}
            </div>

            {/* Steps: one grid template for every lane, so columns line up
                exactly across lanes. Row 1 = the main sound (square pads),
                rows 2+ = one half-height row per sub sound. At least one
                sub row is always drawn; with no sub sound it is an empty,
                inactive frame (owner 2026-10-06). */}
            <div
              data-testid="lane-steps"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${groupSteps}, ${cellWidth}px)`,
                // Fixed rows, top-aligned: the sub row always touches the
                // main row whatever the label's height.
                gridTemplateRows: `${mainCellHeight}px repeat(${subRowCount}, ${subCellHeight}px)`,
                alignSelf: 'flex-start',
                alignContent: 'start',
                columnGap: gap,
                rowGap: 0,
                flexShrink: 0,
              }}
            >
              {Array.from({ length: groupSteps }).map((_, stepOff) => {
                const stepIdx = groupStart + stepOff;
                const isActive = grid[laneIdx]?.[stepIdx] || false;
                const accent = accents[laneIdx]?.[stepIdx] ?? 1;
                const isCurrent = isPlaying && stepIdx === currentStep;
                const stepInBar = stepIdx % stepsPerBar;
                const isBarStart = stepInBar === 0;
                const isBeat =
                  stepsPerBeat <= 1 || stepInBar % stepsPerBeat === 0;
                const positionLabel = `bar ${
                  Math.floor(stepIdx / stepsPerBar) + 1
                }, step ${stepInBar + 1}`;

                return (
                  <button
                    key={`${lane.id}-${stepIdx}`}
                    className="bb-step"
                    data-testid="main-step"
                    data-cell={`${laneIdx}:${stepIdx}`}
                    tabIndex={
                      laneIdx === Math.min(focusCell.lane, lanes.length - 1) &&
                      stepIdx === Math.min(focusCell.step, totalSteps - 1)
                        ? 0
                        : -1
                    }
                    onFocus={() => {
                      if (focusCell.lane !== laneIdx || focusCell.step !== stepIdx) {
                        setFocusCell({ lane: laneIdx, step: stepIdx });
                      }
                    }}
                    onKeyDown={(e) => {
                      const moves: Record<string, [number, number]> = {
                        ArrowLeft: [0, -1],
                        ArrowRight: [0, 1],
                        ArrowUp: [-1, 0],
                        ArrowDown: [1, 0],
                      };
                      const move = moves[e.key];
                      if (move) {
                        e.preventDefault();
                        moveFocus(laneIdx + move[0], stepIdx + move[1]);
                      } else if (e.key === 'Home') {
                        e.preventDefault();
                        moveFocus(laneIdx, 0);
                      } else if (e.key === 'End') {
                        e.preventDefault();
                        moveFocus(laneIdx, totalSteps - 1);
                      } else if (e.key === ' ' && e.shiftKey) {
                        e.preventDefault();
                        if (subCount > 0) toggleSubCell(laneIdx, 0, stepIdx);
                      }
                    }}
                    type="button"
                    onClick={() => cycleAccent(laneIdx, stepIdx)}
                    aria-pressed={isActive}
                    aria-label={
                      isActive
                        ? `${lane.label}, ${positionLabel}, ${ACCENT_LABELS[accent]} accent`
                        : `${lane.label}, ${positionLabel}`
                    }
                    style={{
                      gridRow: 1,
                      gridColumn: stepIdx - groupStart + 1,
                      width: cellWidth,
                      height: mainCellHeight,
                      flexShrink: 0,
                      padding: 0,
                      display: 'flex',
                      boxSizing: 'border-box',
                      borderStyle: 'solid',
                      borderWidth: isCurrent ? 2 : 1,
                      borderColor: isCurrent
                        ? 'var(--app-selection, #00ff88)'
                        : isBarStart
                          ? 'var(--app-muted, #8f8f8f)'
                          : isBeat
                            ? 'var(--app-border-strong, #5a5a5a)'
                            : 'var(--app-border-strong, #303030)',
                      backgroundColor: isActive
                        ? ACCENT_COLOR[litLevel(accent)]
                        : isBeat
                          ? 'var(--app-panel-alt, #282828)'
                          : 'var(--app-panel-alt, #1c1c1c)',
                      // Soft silicone pad (owner 2026-10-05): rounded corners,
                      // top highlight + bottom shade; ON sits pressed in.
                      borderRadius: padRadius,
                      boxShadow: isActive ? padShadowOn(litLevel(accent)) : PAD_SHADOW_OFF,
                      position: 'relative',
                      zIndex: isActive ? 1 : 0,
                      cursor: 'pointer',
                    }}
                    title={
                      isActive
                        ? `${lane.label} — ${positionLabel} — ${ACCENT_LABELS[accent]} accent (click to cycle)`
                        : `${lane.label} — ${positionLabel}`
                    }
                  >
                    {/* Mode "mark": a lit pad with a centred dark-asagi square whose
                        size follows the accent. Default mode "brightness" has no
                        square: fill and glow step in three levels. */}
                    {isActive && markMode && (
                      <span
                        aria-hidden="true"
                        data-testid="step-on-mark"
                        style={{
                          display: 'block',
                          margin: 'auto',
                          width: accent === 2 ? '60%' : accent === 1 ? '40%' : '22%',
                          height: accent === 2 ? '60%' : accent === 1 ? '40%' : '22%',
                          backgroundColor: 'var(--app-step-mark, #052f2c)',
                          borderRadius: 1,
                        }}
                      />
                    )}
                  </button>
                );
              })}

              {Array.from({ length: subRowCount }).map((_, subIdx) => {
                const exists = subIdx < subCount;
                const subNumber = subIdx + 2;
                return Array.from({ length: groupSteps }).map((__, stepOff) => {
                  const stepIdx = groupStart + stepOff;
                  const isOn = exists && subGrid[laneIdx]?.[subIdx]?.[stepIdx] === true;
                  const isCurrent = isPlaying && stepIdx === currentStep;
                  const stepInBar = stepIdx % stepsPerBar;
                  const positionLabel = `bar ${
                    Math.floor(stepIdx / stepsPerBar) + 1
                  }, step ${stepInBar + 1}`;
                  return (
                    <button
                      key={`${lane.id}-sub${subIdx}-${stepIdx}`}
                      className="bb-step bb-sub-step"
                      tabIndex={-1}
                      data-testid="sub-step"
                      data-sub={subNumber}
                      type="button"
                      aria-disabled={exists ? undefined : 'true'}
                      aria-pressed={exists ? isOn : undefined}
                      onClick={() => {
                        if (exists) toggleSubCell(laneIdx, subIdx, stepIdx);
                      }}
                      aria-label={`${lane.label} sound ${subNumber}, ${positionLabel}`}
                      title={
                        exists
                          ? `${lane.label} ${subNumber} — ${positionLabel}${isOn ? ' — ON' : ''}`
                          : t('addSubFirst')
                      }
                      style={{
                        gridRow: subIdx + 2,
                        gridColumn: stepIdx - groupStart + 1,
                        width: cellWidth,
                        height: subCellHeight,
                        padding: 0,
                        display: 'flex',
                        boxSizing: 'border-box',
                        borderStyle: 'solid',
                        borderWidth: 1,
                        borderColor:
                          isCurrent && exists
                            ? 'var(--app-selection, #00ff88)'
                            : 'var(--app-sub-frame, #3b849c)',
                        // A calmer blue-green sibling of the asagi ON, one
                        // brightness for every sub pad (owner 2026-10-06):
                        // no beat or accent difference.
                        backgroundColor: isOn
                          ? 'var(--app-sub-on, #2d6376)'
                          : 'var(--app-sub-off, #000000)',
                        borderRadius: subRadius,
                        // ON vs OFF is 2.90:1 by fill alone (owner accepted
                        // the darker ON), so ON also gets a 1 px lighter top
                        // edge: a cue besides colour.
                        // Same bevel and glow as a main pad, scaled to half
                        // the height, glow in the sub colour.
                        boxShadow: isOn ? SUB_SHADOW_ON : exists ? SUB_SHADOW_OFF : 'none',
                        // An empty frame (no sub sound yet) reads as inactive.
                        opacity: exists ? 1 : 0.45,
                        position: 'relative',
                        zIndex: isOn ? 1 : 0,
                        cursor: exists ? 'pointer' : 'default',
                      }}
                    >
                      {isOn && markMode && (
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'block',
                            margin: 'auto',
                            width: '40%',
                            height: '50%',
                            backgroundColor: 'var(--app-step-mark, #052f2c)',
                            borderRadius: 1,
                          }}
                        />
                      )}
                    </button>
                  );
                });
              })}
            </div>
          </div>
          {compact && !continued && openLane === lane.id && (
            <div
              data-testid="lane-sounds-row"
              style={{
                display: 'flex',
                minWidth: 0,
                margin: `0 0 ${instrumentGap(available) + 2}px`,
                padding: '2px 4px',
                boxSizing: 'border-box',
                border: '1px solid var(--app-border-strong, #5a5a5a)',
                borderRadius: 8,
                backgroundColor: 'var(--app-panel-alt, #1c1c1c)',
              }}
            >
              {laneButtons}
              {sounds}
            </div>
          )}
          </React.Fragment>
        );
      })}

      {/* Bar numbers: under the grid (owner 2026-10-06) */}
      <div style={{ display: 'flex', marginTop: '4px' }}>
        <div style={{ width: labelWidth, flexShrink: 0 }} />
        {Array.from({ length: groupBars }).map((_, barIdx) => (
          <div
            key={`bar-${groupIdx}-${barIdx}`}
            style={{
              width: barWidth,
              flexShrink: 0,
              boxSizing: 'border-box',
              textAlign: 'center',
              fontSize: fsPx(11),
              letterSpacing: '0.06em',
              color: 'var(--app-muted, #999999)',
              borderLeft: '1px solid var(--app-muted, #555)',
              paddingTop: '2px',
            }}
          >
            {t('bar', { n: groupIdx * rowBars + barIdx + 1 })}
          </div>
        ))}
      </div>

      </React.Fragment>
      );
      })}

      {/* Add a lane (P2-17), owner 2026-10-06: no frame, one compact row
          right under the grid, starting at the label column's left edge:
          a small "+ Add lane" label, then one small button per instrument
          with its icon. Up to MAX_LANES lanes. */}
      <div
        data-testid="add-lane-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 4,
          marginTop: 4,
          minWidth: 0,
        }}
      >
        <span
          data-testid="add-lane-label"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: fsPx(11),
            fontWeight: 600,
            color: 'var(--app-muted, #999)',
            whiteSpace: 'nowrap',
          }}
        >
          <PixelIcon name="plus" scale={1} style={{ display: 'block', marginInlineEnd: 3 }} />
          {lanes.length >= MAX_LANES ? t('upToLanes', { max: MAX_LANES }) : t('addLane')}
        </span>
        {lanes.length < MAX_LANES &&
          DRUM_IDS.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => {
                const id = addLane(category);
                if (id) {
                  audioEngine?.addLane(id, category);
                  onSoundChange();
                }
              }}
              title={t('addFamilyLane', { family: CATEGORY_LABEL[category] })}
              aria-label={t('addFamilyLane', { family: CATEGORY_LABEL[category] })}
              style={{
                ...layerButtonBase,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                minHeight: 24,
                padding: '0 6px',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <PixelIcon name="plus" scale={1} style={{ display: 'block' }} />
              <PixelIcon name={LABEL_ICONS[category]} scale={1} style={{ display: 'block' }} />
              <span>{CATEGORY_LABEL[category]}</span>
            </button>
          ))}
      </div>

      {/* A loaded save can hold more lanes than MAX_LANES. Everything is kept;
          this only says why add-lane is gone (owner decision 2026-10-04, B). */}
      {loadRefused && (
        <div
          role="status"
          data-testid="load-refused-notice"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            marginTop: 6,
            fontSize: fsPx(11),
            color: 'var(--app-muted, #aaa)',
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          <PixelIcon name="warning" style={{ marginTop: 1 }} />
          <span style={{ minWidth: 0, flex: 1 }}>{t('loadRefused')}</span>
          <button
            type="button"
            aria-label={t('dismissNotice')}
            title={t('dismissNotice')}
            onClick={dismissLoadRefused}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              padding: '0 4px',
              fontSize: fsPx(11),
            }}
          >
            ×
          </button>
        </div>
      )}

      {lanesOver !== null && (
        <div
          role="status"
          data-testid="lane-limit-notice"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            marginTop: 6,
            fontSize: fsPx(11),
            color: 'var(--app-muted, #aaa)',
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          <PixelIcon name="warning" style={{ marginTop: 1 }} />
          <span style={{ minWidth: 0 }}>
            {t('lanesOver', { n: lanesOver, max: MAX_LANES })}
          </span>
        </div>
      )}

      <div style={{ marginTop: '10px', fontSize: fsPx(12), color: 'var(--app-muted, #999)' }}>
        {t('stepStatus', { step: currentStep + 1, total: totalSteps, r: resolution })}
      </div>
    </div>
  );
};
