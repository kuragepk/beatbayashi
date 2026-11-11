// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Label key -> pixel icon (2026-10-06, new). Owner request of the same day: an
// emoji-size pixel mark in front of each label so it reads at a glance. Keys
// follow the string keys in the app's i18n table where one exists (the app is
// not imported here; see isolation.test.ts). Icons drawn for this map are in
// source/icons16-labels.mjs; the rest reuse the ui16 set.
import type { PixelIconName } from './pixelIconData';

export const LABEL_ICONS = {
  // panels
  panelSequencer: 'sequencer',
  panelControls: 'knob',
  layoutCustom: 'layout',
  rights: 'rights',
  rhythmPresets: 'presets',
  soundSettings: 'gear',
  // transport and tempo
  play: 'play',
  stop: 'stop',
  reset: 'rewind',
  tempo: 'metronome',
  bpm: 'metronome',
  length: 'bars',
  bars: 'bars',
  resolution: 'resolution',
  swing: 'swing',
  masterVolume: 'speaker',
  mute: 'speaker-off',
  solo: 'headphones',
  // lanes and sounds
  kick: 'kick',
  tom: 'tom',
  cymbal: 'cymbal',
  clap: 'clap',
  mainSound: 'drum',
  subSound: 'note',
  soundBasis: 'sliders',
  soundTab: 'wave',
  addLane: 'plus',
  addBar: 'plus',
  removeBar: 'minus',
  // file and edit
  save: 'floppy',
  export: 'download',
  import: 'upload',
  clear: 'trash',
  restore: 'undo',
  layoutReset: 'undo',
  autoFit: 'fit',
  retry: 'redo',
  cancel: 'close',
  remove: 'trash',
  // settings
  languageLabel: 'globe',
  appearanceTab: 'palette',
  theme: 'contrast',
  colours: 'palette',
  font: 'font',
  textSize: 'text-size',
  onSteps: 'on-step',
  motion: 'motion',
  uiSound: 'bell',
  hemisphere: 'hemisphere',
  subPalette: 'palette',
  controlOrder: 'order',
  keyboardTitle: 'keys',
  useBackend: 'server',
} as const satisfies Record<string, PixelIconName>;

export type LabelIconKey = keyof typeof LABEL_ICONS;
