// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { AlignedIconLabel } from './LabelIcon';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { PixelIcon, IconLabel, LABEL_ICONS } from '../pixel-icons';
import { FAMILY_LOUDNESS } from '@otoinki/loudness';
import { fsPx } from '../theme/themeStore';
import { useT } from '../i18n/i18n';
import {
  useSequencerStore,
  RESOLUTIONS,
  MAX_SWING,
  MIN_BARS,
  MAX_BARS,
  type Resolution,
} from '../store/sequencerStore';
import { AudioEngine } from '../audio/AudioEngine';
import {
  MAX_VOLUME_PERCENT,
  VOLUME_PERCENT_STEP,
  dbToPercent,
  percentToDb,
} from '../store/masterVolume';
import { SettingsPanel } from './SettingsPanel';
import { ExportPanel } from './ExportPanel';
import { ClearConfirmDialog } from './ClearConfirmDialog';
import { NumberBox, SliderField, StepButton } from './SliderField';

/** Mirrors the step-cell frames in SequencerGrid so the button previews it. */
const FRAME: Record<number, { border: number; radius: number }> = {
  2: { border: 3, radius: 9 },
  4: { border: 2.5, radius: 7 },
  8: { border: 2, radius: 5 },
  16: { border: 1.5, radius: 3 },
  32: { border: 1, radius: 2 },
};

const transportIconButton: React.CSSProperties = {
  flex: '0 0 auto',
  padding: '5px 8px',
  backgroundColor: 'var(--app-panel-alt, #222)',
  color: 'var(--app-accent, #0f8a80)',
  border: '1px solid var(--app-accent, #0f8a80)',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: fsPx(12),
  lineHeight: 1,
};

export const ControlPanel: React.FC<{
  audioEngine: AudioEngine | null;
  audioError?: string | null;
  onRetryAudio?: () => void;
  /** Called when Play is pressed and there is no engine yet: creates and
   *  initialises it (inside the same click, so the browser still counts it as
   *  a user gesture) and resolves true if the engine is ready, false if it
   *  failed (the caller then shows its own error and retry UI). */
  onEnsureAudio?: () => Promise<boolean>;
  onSoundChange: () => void;
  /** 'transport' = only the PLAY row (and the settings/export dialogs it
   *  opens); 'pattern' = tempo, length and resolution (shown under the
   *  Sequencer header); 'body' = swing and master volume; 'all' (default)
   *  = everything. */
  section?: 'all' | 'transport' | 'pattern' | 'body';
}> = ({
  audioEngine,
  audioError = null,
  onRetryAudio,
  onEnsureAudio,
  onSoundChange,
  section = 'all',
}) => {
  const {
    isPlaying,
    bpm,
    swing,
    resolution,
    bars,
    masterDb,
    togglePlayback,
    stop,
    setBPM,
    setSwing,
    setMasterDb,
    setResolution,
    addBar,
    removeLastBar,
    lastBarHasNotes,
  } = useSequencerStore();
  const t = useT();
  // True only while a Play press is creating the audio engine; that is the one
  // time the button says "Initialising...". Play itself is enabled from the
  // first render (owner decision 2026-10-07): a click on a disabled button is
  // dropped by the browser, so the first press used to do nothing.
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const onPlayPress = async () => {
    if (startingRef.current) return;
    if (!audioEngine) {
      if (!onEnsureAudio) return;
      startingRef.current = true;
      setStarting(true);
      let ready = false;
      try {
        ready = await onEnsureAudio();
      } finally {
        startingRef.current = false;
        setStarting(false);
      }
      // On failure App shows the error and Retry; playback is not started.
      if (!ready) return;
      // Start rather than toggle, in case playback was started meanwhile.
      if (!useSequencerStore.getState().isPlaying) togglePlayback();
      return;
    }
    // A call may have interrupted the audio since the last press; resume
    // inside this gesture (see AudioEngine.resumeIfInterrupted).
    void audioEngine.resumeIfInterrupted();
    togglePlayback();
  };
  const [confirmRemoveBar, setConfirmRemoveBar] = useState(false);
  const onRemoveBar = () => {
    if (bars <= MIN_BARS) return;
    if (lastBarHasNotes()) setConfirmRemoveBar(true);
    else removeLastBar();
  };
  const counterButton = (enabled: boolean): React.CSSProperties => ({
    minWidth: 0,
    padding: '2px 5px',
    backgroundColor: 'var(--app-control, #2a2a2a)',
    color: 'var(--app-muted, #ddd)',
    border: '1px solid var(--app-border-strong, #444)',
    borderRadius: '4px',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.45,
    fontWeight: 700,
    fontSize: fsPx(12),
    lineHeight: 1,
  });

  const [showSettings, setShowSettings] = useState(false);
  const transportRef = useRef<HTMLDivElement>(null);
  const [transportIconOnly, setTransportIconOnly] = useState(false);
  // Width the row had when the words were dropped; words come back only
  // once there is clearly more room than that, so it does not flicker.
  const iconOnlyAtRef = useRef(0);
  useLayoutEffect(() => {
    const el = transportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const width = el.clientWidth;
      if (width === 0) return; // not laid out (jsdom)
      if (!transportIconOnlyRef.current) {
        if (el.scrollWidth > width + 1) {
          iconOnlyAtRef.current = width;
          transportIconOnlyRef.current = true;
          setTransportIconOnly(true);
        }
      } else if (width > iconOnlyAtRef.current + 24) {
        transportIconOnlyRef.current = false;
        setTransportIconOnly(false);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });
  const transportIconOnlyRef = useRef(false);
  // Remembers the pre-mute level (dB) so "unmute" restores it instead of
  // jumping to the default; null means "not currently muted" (owner decision
  // 2026-09-27/28: shared @otoinki/loudness master control).
  const [preMuteDb, setPreMuteDb] = useState<number | null>(null);
  const isMasterMuted = preMuteDb !== null;
  const [masterMinDb] = FAMILY_LOUDNESS.masterRangeDb;
  const volumePercent = dbToPercent(masterDb);
  const toggleMasterMute = () => {
    if (isMasterMuted) {
      setMasterDb(preMuteDb);
      audioEngine?.setMasterDb(preMuteDb);
      setPreMuteDb(null);
    } else {
      setPreMuteDb(masterDb);
      setMasterDb(masterMinDb);
      audioEngine?.setMasterDb(masterMinDb);
    }
  };
  const [showExport, setShowExport] = useState(false);
  const [destructiveWarning, setDestructiveWarning] = useState<{
    type: 'resolution';
    loss: number;
    newValue: number | Resolution;
  } | null>(null);


  // Transport row (owner 2026-10-06): one line at every width and text
  // size. PLAY is about a third of its old width; when even that does not
  // fit, the PLAY/Reset words go and the buttons show only their icons
  // (aria-label and title keep the words for assistive tech and hover).
  const transport = (
    <div
      ref={transportRef}
      data-testid="transport-row"
      data-icon-only={transportIconOnly ? 'true' : 'false'}
      style={{
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
        flexWrap: 'nowrap',
        overflow: 'hidden',
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        marginBottom: section === 'transport' ? 0 : '12px',
        padding: '6px',
        backgroundColor: 'var(--app-panel, #1a1a1a)',
        borderRadius: '8px',
        border: '2px solid var(--app-accent, #0f8a80)',
      }}
    >
      {audioError ? (
        <div
          style={{
            flex: '0 1 auto',
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'nowrap',
          }}
        >
          <span
            title={t('audioFailed')}
            style={{
              color: 'var(--app-danger, #ff3333)',
              fontSize: fsPx(12),
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {t('audioFailed')}
          </span>
          <button
            type="button"
            onClick={onRetryAudio}
            aria-label={t('retry')}
            title={t('retry')}
            style={{
              flexShrink: 0,
              padding: '4px 8px',
              backgroundColor: 'var(--app-control, #2a2a2a)',
              color: 'var(--app-muted, #ddd)',
              border: '1px solid var(--app-danger, #ff3333)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: fsPx(12),
              whiteSpace: 'nowrap',
            }}
          >
            {transportIconOnly ? <PixelIcon name="redo" /> : <IconLabel icon="redo">{t('retry')}</IconLabel>}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPlayPress}
          disabled={starting}
          aria-label={starting ? t('initialising') : isPlaying ? t('stop') : t('play')}
          title={starting ? t('audioInitialising') : isPlaying ? t('stop') : t('play')}
          style={{
            // About a third of the old 190 px basis.
            flex: '0 0 auto',
            minWidth: 0,
            padding: '5px 10px',
            backgroundColor: isPlaying ? 'var(--app-accent, #0f8a80)' : 'var(--app-ok, #2ba695)',
            color: 'var(--app-on-accent, #000)',
            border: 'none',
            borderRadius: '6px',
            cursor: starting ? 'wait' : 'pointer',
            fontWeight: 700,
            fontSize: fsPx(12),
            whiteSpace: 'nowrap',
            opacity: starting ? 0.5 : 1,
          }}
        >
          {transportIconOnly ? (
            <PixelIcon name={starting ? 'speaker' : isPlaying ? 'stop' : 'play'} />
          ) : starting ? (
            <IconLabel icon="speaker" tight>{t('initialising')}</IconLabel>
          ) : isPlaying ? (
            <IconLabel icon="stop" tight>{t('stop')}</IconLabel>
          ) : (
            <IconLabel icon="play" tight>{t('play')}</IconLabel>
          )}
        </button>
      )}
      <button
        type="button"
        onClick={stop}
        aria-label={t('reset')}
        title={t('resetTitle')}
        style={{
          flex: '0 0 auto',
          padding: '5px 8px',
          backgroundColor: 'var(--app-border, #333)',
          color: 'var(--app-text, #fff)',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: fsPx(12),
          whiteSpace: 'nowrap',
        }}
      >
        {transportIconOnly ? <PixelIcon name="rewind" /> : <IconLabel icon="rewind" tight>{t('reset')}</IconLabel>}
      </button>
      {/* Clear moved to the Layout toolbar in App.tsx (owner request,
          2026-09-28): a destructive action must not sit right next to
          Play, and it is now one of that toolbar's reorderable items. */}
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        title={t('soundSettings')}
        aria-label={t('soundSettings')}
        style={transportIconButton}
      >
        <PixelIcon name="gear" />
      </button>
      <button
        type="button"
        onClick={() => setShowExport(true)}
        data-testid="export-open"
        title={t('exportTitle')}
        aria-label={t('exportTitle')}
        style={transportIconButton}
      >
        <PixelIcon name="download" />
      </button>
    </div>
  );

  const outerStyle: React.CSSProperties =
    section === 'transport' || section === 'pattern'
      ? { minWidth: 0, maxWidth: '100%', color: 'var(--app-text, #fff)' }
      : {
          padding: '12px',
          backgroundColor: 'var(--app-bg, #0a0a0a)',
          color: 'var(--app-text, #fff)',
          borderTop: '2px solid var(--app-border, #333)',
        };

  // One framed unit per setting (owner 2026-10-06): its name, its value and
  // the buttons that change it sit inside one small frame, so the control
  // and its role read together. Existing tokens only.
  const groupFrame: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 'clamp(2px, 0.4vw, 4px)',
    minWidth: 0,
    maxWidth: '100%',
    padding: 'clamp(1px, 0.3vw, 3px) clamp(2px, 0.5vw, 6px)',
    boxSizing: 'border-box',
    backgroundColor: 'var(--app-panel-alt, #1c1c1c)',
    border: '1px solid var(--app-border-strong, #3d3d3d)',
    borderRadius: '6px',
  };
  const groupLabel: React.CSSProperties = {
    fontSize: fsPx(12),
    fontWeight: 700,
    color: 'var(--app-text, #ffffff)',
    whiteSpace: 'nowrap',
  };
  const groupValue: React.CSSProperties = {
    fontSize: fsPx(12),
    fontWeight: 700,
    whiteSpace: 'nowrap',
    textAlign: 'center',
  };

  const pattern = (
    <div
      data-testid="pattern-settings"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'clamp(2px, 0.5vw, 6px)',
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      <div role="group" aria-label={t('tempo')} style={groupFrame}>
        <span style={groupLabel}><AlignedIconLabel icon={LABEL_ICONS.tempo}>{t('tempo')}</AlignedIconLabel></span>
        <StepButton
          direction={-1}
          label={t('decrease', { name: t('tempo') })}
          disabled={bpm <= 20}
          onStep={(n) => setBPM(useSequencerStore.getState().bpm + n)}
        />
        <StepButton
          direction={1}
          label={t('increase', { name: t('tempo') })}
          disabled={bpm >= 300}
          onStep={(n) => setBPM(useSequencerStore.getState().bpm + n)}
        />
        <NumberBox
          value={bpm}
          min={20}
          max={300}
          step={1}
          digits={0}
          label={t('tempo')}
          onCommit={setBPM}
        />
        <span style={groupLabel}>BPM</span>
      </div>

      {/* Owner decision 2026-09-29: a counter, 1..MAX_BARS. */}
      <div role="group" aria-label={t('barsGroup')} style={groupFrame}>
        <span style={groupLabel}><AlignedIconLabel icon={LABEL_ICONS.length}>{t('length')}</AlignedIconLabel></span>
        <button
          type="button"
          onClick={onRemoveBar}
          disabled={bars <= MIN_BARS}
          aria-label={t('removeBar')}
          title={t('removeBarTitle')}
          style={counterButton(bars > MIN_BARS)}
        >
          <PixelIcon name="minus" />
        </button>
        <span aria-live="polite" data-testid="bar-count" style={{ ...groupValue, minWidth: '3.5em' }}>
          {t('barsCount', { n: bars })}
        </span>
        <button
          type="button"
          onClick={addBar}
          disabled={bars >= MAX_BARS}
          aria-label={t('addBar')}
          title={t('addBarTitle', { max: MAX_BARS })}
          style={counterButton(bars < MAX_BARS)}
        >
          <PixelIcon name="plus" />
        </button>
      </div>

      <div role="group" aria-label={t('resolution')} style={groupFrame}>
        <span style={groupLabel}><AlignedIconLabel icon={LABEL_ICONS.resolution}>{t('resolution')}</AlignedIconLabel></span>
        {RESOLUTIONS.map((r) => {
          const selected = resolution === r;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                const { checkResolutionLossImpl } = useSequencerStore.getState();
                const loss = checkResolutionLossImpl(r);
                if (loss) {
                  setDestructiveWarning({ type: 'resolution', loss, newValue: r });
                } else {
                  setResolution(r);
                }
              }}
              title={t('stepsPerBar', { r })}
              style={{
                flex: '0 0 auto',
                padding: '2px 5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                backgroundColor: selected ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
                color: selected ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: selected ? 700 : 400,
                fontSize: fsPx(11),
                whiteSpace: 'nowrap',
              }}
            >
              {/* Same frame the step cells use at this resolution */}
              <span
                aria-hidden="true"
                style={{
                  width: 12,
                  height: 8,
                  boxSizing: 'border-box',
                  borderStyle: 'solid',
                  borderWidth: Math.min(2, FRAME[r].border),
                  borderColor: selected ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #8f8f8f)',
                  borderRadius: Math.min(4, FRAME[r].radius),
                }}
              />
              1/{r}
            </button>
          );
        })}
      </div>
    </div>
  );

  const body = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${fsPx(220)}), 1fr))`,
        gap: '8px',
      }}
    >
      <SliderField
        label={t('swingName')}
        icon={LABEL_ICONS.swing}
        name={t('swingName')}
        value={swing}
        min={0}
        max={MAX_SWING}
        step={1}
        unit="%"
        title={t('swingTitle')}
        onChange={setSwing}
        testId="swing-field"
      />

      {/* 100% is the normal level, 120% the cleanest maximum (owner
          request 2026-10-05; mapping in ../store/masterVolume.ts). */}
      <SliderField
        label={isMasterMuted ? `${t('masterName')} — ${t('muted')}` : t('masterName')}
        icon={LABEL_ICONS.masterVolume}
        name={t('masterName')}
        value={volumePercent}
        min={0}
        max={MAX_VOLUME_PERCENT}
        step={VOLUME_PERCENT_STEP}
        unit="%"
        disabled={isMasterMuted}
        title={t('masterVolumeAria')}
        onChange={(percent) => {
          const db = percentToDb(percent);
          setMasterDb(db);
          audioEngine?.setMasterDb(db);
        }}
        testId="master-volume-field"
        rangeId="master-volume-slider"
        valueText={isMasterMuted ? t('muted') : undefined}
        trailing={
          <button
            type="button"
            onClick={toggleMasterMute}
            aria-pressed={isMasterMuted}
            style={{
              flex: '0 0 auto',
              minHeight: 24,
              padding: '2px 8px',
              backgroundColor: 'var(--app-control, #2a2a2a)',
              color: 'var(--app-muted, #ddd)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: fsPx(12),
              whiteSpace: 'nowrap',
            }}
          >
            {isMasterMuted ? (
              <IconLabel icon="speaker" tight>{t('unmute')}</IconLabel>
            ) : (
              <IconLabel icon="speaker-off" tight>{t('mute')}</IconLabel>
            )}
          </button>
        }
      />
    </div>
  );

  const patternDialogs = (
    <>
      {confirmRemoveBar && (
        <ClearConfirmDialog
          title={t('removeBarQuestion', { n: bars })}
          confirmLabel={t('remove')}
          onCancel={() => setConfirmRemoveBar(false)}
          onConfirm={() => {
            removeLastBar();
            setConfirmRemoveBar(false);
          }}
        />
      )}

      {destructiveWarning && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setDestructiveWarning(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--app-panel, #1a1a1a)',
              color: 'var(--app-text, #fff)',
              padding: '30px',
              borderRadius: '8px',
              border: '2px solid var(--app-danger, #ff3333)',
              maxWidth: '400px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '10px', color: 'var(--app-danger, #ff3333)' }}>
              <IconLabel icon="warning">{t('carefulStepsLost')}</IconLabel>
            </h2>
            <p style={{ color: 'var(--app-muted, #ccc)', fontSize: fsPx(14), marginBottom: '20px' }}>
              {t('resolutionLoss', {
                r: destructiveWarning.newValue,
                n: destructiveWarning.loss,
              })}
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setResolution(destructiveWarning.newValue as Resolution);
                  setDestructiveWarning(null);
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: 'var(--app-danger, #ff3333)',
                  color: 'var(--app-on-accent, #000)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {t('yesDelete')}
              </button>
              <button
                type="button"
                onClick={() => setDestructiveWarning(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: 'var(--app-panel-alt, #222)',
                  color: 'var(--app-muted, #ddd)',
                  border: '1px solid var(--app-border-strong, #444)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const showTransport = section === 'all' || section === 'transport';
  const showPattern = section === 'all' || section === 'pattern';
  const showBody = section === 'all' || section === 'body';

  return (
    <div style={outerStyle}>
      {showTransport && transport}
      {showPattern && (
        <div style={{ marginBottom: section === 'pattern' ? '4px' : '12px' }}>{pattern}</div>
      )}
      {showBody && body}
      {showPattern && patternDialogs}
      {showTransport && showSettings && (
        <SettingsPanel
          audioEngine={audioEngine}
          onPresetChange={onSoundChange}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showTransport && showExport && (
        <ExportPanel audioEngine={audioEngine} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
};
