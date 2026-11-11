// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
import { AlignedIconLabel, LabelIconBox } from './components/LabelIcon';
import { useEffect, useRef, useState } from 'react';
import { fsPx, useThemeStore, textScaleOf } from './theme/themeStore';
import {
  useSequencerStore,
  loadSequencerState,
  saveSequencerState,
  startAutosave,
  isLaneAudible,
} from './store/sequencerStore';
import { AudioEngine } from './audio/AudioEngine';
import {
  readSoundDocument,
  startSoundAutosave,
  type SoundAutosave,
} from './audio/soundPersistence';
import { SequencerGrid } from './components/SequencerGrid';
import { ControlPanel } from './components/ControlPanel';
import { RightsBanner } from './components/RightsBanner';
import { BrandMark } from './components/BrandMark';
import { BackgroundArt } from './pixel-art/BackgroundArt';
import { PixelIcon, IconLabel, TIGHT_ICON, PixelIconTextScale, LABEL_ICONS } from './pixel-icons';
import { PresetDropdowns } from './components/PresetDropdowns';
import { PanelFrame } from './components/PanelFrame';
import { ClearConfirmDialog } from './components/ClearConfirmDialog';
import { useLayoutStore } from './layout/layoutStore';
import { LanguagePicker } from './components/LanguagePicker';
import { ThemeToggle } from './components/ThemeToggle';
import { langTag, useLanguageStore, useT } from './i18n/i18n';
import type { UiKey } from './i18n/strings';
import { loadStoredSettings } from './components/SettingsPanel';
import {
  DEFAULT_PRESET_ID,
  PRESET_RESOLUTION,
  getPreset,
} from './presets';
import { useAPI } from './hooks/useAPI';
import {
  SOUND_SPACES,
  SOUND_BASES,
  loadSoundBasisState,
  saveSoundBasisState,
  type SoundBasis,
  type SoundBasisState,
} from './audio/soundBasis';

/** Loads the sound basis for a genre into the engine (all lanes + space). */
function applySoundBasisTo(
  engine: AudioEngine,
  state: SoundBasisState,
  options: { respectSaved?: boolean; keepLanes?: readonly string[] } = {}
): Promise<void> {
  return engine.applySoundBasis(
    SOUND_BASES[state.basis][state.genre],
    SOUND_SPACES[state.basis][state.genre],
    options
  );
}
import { ACCENT_VELOCITY, DEFAULT_ACCENT } from './accent';

/** What Clear replaces or depends on; Restore puts all of it back together. */
const CLEARED_SNAPSHOT_FIELDS = ['lanes', 'bars', 'resolution', 'grid', 'subGrid', 'accents'] as const;
type ClearedSnapshot = Pick<
  ReturnType<typeof useSequencerStore.getState>,
  (typeof CLEARED_SNAPSHOT_FIELDS)[number]
>;

function App() {
  // text_px / base px (or the preset's factor); 1 at the default setting.
  const textScale = useThemeStore((s) => textScaleOf(s.settings));
  const themeKey = useThemeStore((s) => `${s.settings.theme}:${s.settings.sub_palette ?? ''}`);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  // The initialisation in flight, if any: a second caller (the Play press, the
  // first-gesture listener, Retry) joins it instead of starting another.
  const initPromiseRef = useRef<Promise<boolean> | null>(null);
  // Saves the per-lane sound document once the engine exists (soundPersistence.ts).
  const soundAutosaveRef = useRef<SoundAutosave | null>(null);
  // Off by default (ISSUE-BEATBOX-013): a static deployment must not have every
  // visitor's browser probe their own localhost on load (docs/PRIVACY.md §2).
  const [reorderOn, setReorderOn] = useState(false); // owner 2026-10-09: arrows only while on
  const [backendEnabled, setBackendEnabled] = useState(false);
  const [apiStatus, setApiStatus] = useState<UiKey>('backendOff');
  // Holds the engine once it exists, so children re-render when audio is ready.
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  // ISSUE-BEATBOX-023: surfaces a failed initialize() instead of leaving the
  // "Initialising..." button stuck forever with no way out.
  const [audioError, setAudioError] = useState<string | null>(null);
  const [layoutSavedAt, setLayoutSavedAt] = useState<number | null>(null);
  const {
    order: panelOrder,
    autoFit,
    setAutoFit,
    saveLayout,
    resetLayout,
    toolbarOrder,
    moveToolbarItem,
  } = useLayoutStore();
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  // Bumped when a voice's sound changes, so the grid re-reads its dropdowns.
  const [, refreshSounds] = useState(0);
  const { getPatterns } = useAPI();
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  useEffect(() => {
    // Text direction stays left-to-right for the app: the step grid is a
    // timeline and must not mirror. Right-to-left text blocks set their own
    // dir (RightsBanner).
    document.documentElement.lang = langTag(language);
  }, [language]);

  // Clear-the-pattern confirmation flow (owner request, 2026-09-28): the
  // Clear toolbar button opens this dialog instead of clearing immediately.
  // `clearedSnapshot` holds exactly one prior pattern, with the lanes, bars and
  // resolution its rows were built for, so "Restore" can undo the most recent
  // clear -- not a full undo history, one step only, matching the request. It
  // is dropped (so Restore disappears) as soon as any of those change again:
  // restoring past that point would discard new work or put back a grid of the
  // wrong shape.
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearedSnapshot, setClearedSnapshot] = useState<ClearedSnapshot | null>(null);
  const [showClearedStatus, setShowClearedStatus] = useState(false);
  useEffect(() => {
    if (!clearedSnapshot) return;
    return useSequencerStore.subscribe((state, previous) => {
      if (CLEARED_SNAPSHOT_FIELDS.some((field) => state[field] !== previous[field])) {
        setClearedSnapshot(null);
      }
    });
  }, [clearedSnapshot]);

  const {
    isPlaying,
    currentStep,
    bpm,
    setCurrentStep,
    setBPM,
    loadPattern,
    lanes,
    grid,
    subGrid,
    accents,
    swing,
    bars,
    resolution,
    resetGrid,
  } = useSequencerStore();

  const requestClear = () => setClearConfirmOpen(true);
  const cancelClear = () => setClearConfirmOpen(false);
  const confirmClear = () => {
    const snapshot: ClearedSnapshot = {
      lanes,
      bars,
      resolution,
      grid: grid.map((row) => [...row]),
      subGrid: subGrid.map((rows) => rows.map((row) => [...row])),
      accents: accents.map((row) => [...row]),
    };
    // Reset first: the store listener above must not see the clear itself.
    resetGrid();
    setClearedSnapshot(snapshot);
    setClearConfirmOpen(false);
    setShowClearedStatus(true);
  };
  const restoreCleared = () => {
    if (!clearedSnapshot) return;
    useSequencerStore.setState(clearedSnapshot);
    setClearedSnapshot(null);
    setShowClearedStatus(false);
  };

  // Latest-value refs so the sequencer effect (below) can read these without
  // depending on them — an edit mid-playback should not restart the schedule.
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const subGridRef = useRef(subGrid);
  subGridRef.current = subGrid;
  const accentsRef = useRef(accents);
  accentsRef.current = accents;
  const lanesRef = useRef(lanes);
  lanesRef.current = lanes;
  const swingRef = useRef(swing);
  swingRef.current = swing;
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  // Sound basis (theory / systematic / empirical / modern) and the genre it
  // was last applied for. Persisted; the ref lets initAudioEngine read the
  // latest value without being re-created.
  const [soundBasisState, setSoundBasisState] = useState<SoundBasisState>(loadSoundBasisState);
  const soundBasisRef = useRef(soundBasisState);
  soundBasisRef.current = soundBasisState;

  const changeSoundBasis = (next: SoundBasisState) => {
    setSoundBasisState(next);
    soundBasisRef.current = next;
    saveSoundBasisState(next);
    const running = audioEngineRef.current;
    if (running) {
      void applySoundBasisTo(running, next).then(() => refreshSounds((n) => n + 1));
    }
  };

  const applyPreset = (presetId: string) => {
    const preset = getPreset(presetId);
    if (!preset) return;
    loadPattern(preset.grid, PRESET_RESOLUTION);
    setBPM(preset.bpm);
    setActivePresetId(presetId);
    // A new genre loads that genre's sounds; another pattern of the same
    // genre keeps whatever the player has tuned.
    if (preset.genre !== soundBasisRef.current.genre) {
      changeSoundBasis({ ...soundBasisRef.current, genre: preset.genre });
    }
  };

  // Load saved state, then apply the default preset if this is the first time.
  useEffect(() => {
    loadSequencerState();
    // Only apply the default preset if the grid is still empty (first load).
    const state = useSequencerStore.getState();
    const isEmpty = state.grid.every((row: boolean[]) => !row.some((cell: boolean) => cell));
    if (isEmpty) {
      applyPreset(DEFAULT_PRESET_ID);
    }
    // Debounced autosave (500ms after the last change), on top of the
    // beforeunload save below which only catches a clean exit.
    return startAutosave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save state before the user leaves.
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveSequencerState();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Browsers refuse to start an AudioContext before a user gesture, so the
  // engine is built inside one: the Play press (ControlPanel, owner decision
  // 2026-10-07: Play is enabled from the start and creates the engine itself)
  // or, earlier, the first click/keypress anywhere (the listener below).
  // Resolves true when the engine is ready; false after a failure, which has
  // already been put into `audioError` (ISSUE-BEATBOX-023). Never rejects.
  const initAudioEngine = (): Promise<boolean> => {
    if (audioEngineRef.current) return Promise.resolve(true);
    if (initPromiseRef.current) return initPromiseRef.current;
    setAudioError(null);

    const attempt = (async () => {
      let created: AudioEngine | null = null;
      try {
        created = new AudioEngine();
        await created.initialize();
        // initialize() only registers the original four lanes; a saved
        // pattern with lanes added past them (P2-17) needs those built too.
        // addLane() is a no-op for a lane it already knows, so this is safe
        // to call for every lane unconditionally.
        useSequencerStore.getState().lanes.forEach((lane) => {
          created!.addLane(lane.id, lane.category);
        });
        created.loadAllSettings(loadStoredSettings());
        // The player's saved per-lane sound (presets, layers, sliders, lane
        // effects) wins over the genre default: restored lanes are skipped by
        // the sound-basis step below. Lanes it does not name keep the default.
        const restoredLanes = created.loadSoundDocument(readSoundDocument());
        created.setTransportBpm(useSequencerStore.getState().bpm);
        // After loadAllSettings, so a slider set the player saved still wins.
        await applySoundBasisTo(created, soundBasisRef.current, {
          respectSaved: true,
          keepLanes: restoredLanes,
        });
        created.setMasterDb(useSequencerStore.getState().masterDb);
        audioEngineRef.current = created;
        // Started only now, so loading the saved sound does not write it back.
        soundAutosaveRef.current?.stop();
        soundAutosaveRef.current = startSoundAutosave(created);
        setEngine(created);
        return true;
      } catch (error) {
        console.error('Failed to initialize audio:', error);
        // Nothing is kept from a failed attempt: a retry builds a fresh engine.
        try {
          created?.dispose();
        } catch (disposeError) {
          console.error('Failed to dispose the half-built audio engine:', disposeError);
        }
        setAudioError(error instanceof Error ? error.message : 'unknown error');
        return false;
      }
    })().finally(() => {
      initPromiseRef.current = null;
    });
    initPromiseRef.current = attempt;
    return attempt;
  };

  // Retry button (ISSUE-BEATBOX-023): re-attempts initAudioEngine. A user
  // gesture already happened to reach this button, so the AudioContext can
  // start straight away.
  const retryAudioInit = () => {
    void initAudioEngine();
  };

  // Save any pending sound change when the app goes away.
  useEffect(() => {
    return () => {
      soundAutosaveRef.current?.stop();
      soundAutosaveRef.current = null;
    };
  }, []);

  // Optional backend reachability check — opt-in only (ISSUE-BEATBOX-013).
  // Nothing is fetched until the visitor turns on "Use backend" below.
  useEffect(() => {
    if (!backendEnabled) {
      setApiStatus('backendOff');
      return;
    }
    let cancelled = false;
    const init = async () => {
      try {
        await getPatterns();
        if (!cancelled) setApiStatus('backendReachable');
      } catch (error) {
        if (!cancelled) setApiStatus('backendNotRunning');
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [backendEnabled, getPatterns]);

  // A phone call interrupts the audio context while the page is open, and
  // mobile browsers need a user gesture to resume it. Every tap or key press
  // tries once the engine exists; while the context runs this does nothing.
  useEffect(() => {
    const resumeOnGesture = () => {
      void audioEngineRef.current?.resumeIfInterrupted();
    };
    ['pointerdown', 'keydown'].forEach((event) => {
      document.addEventListener(event, resumeOnGesture);
    });
    return () => {
      ['pointerdown', 'keydown'].forEach((event) => {
        document.removeEventListener(event, resumeOnGesture);
      });
    };
  }, []);

  // The first click/keypress anywhere also builds the engine, so the per-voice
  // sound pulldowns and "+ layer" buttons (which need one) work before Play is
  // pressed. Play does not depend on this: it builds the engine itself.
  // Independent of the backend toggle above.
  useEffect(() => {
    const handleFirstInteraction = async () => {
      await initAudioEngine();
      ['click', 'keydown', 'touchstart'].forEach((event) => {
        document.removeEventListener(event, handleFirstInteraction);
      });
    };

    ['click', 'keydown', 'touchstart'].forEach((event) => {
      document.addEventListener(event, handleFirstInteraction);
    });

    return () => {
      ['click', 'keydown', 'touchstart'].forEach((event) => {
        document.removeEventListener(event, handleFirstInteraction);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sequencer, driven by Tone.Transport (P2-14) instead of a JS setInterval:
  // the Transport schedules against the Web Audio clock, which keeps time
  // even when the main thread is busy or the tab is backgrounded, and a BPM
  // change below just updates its tempo signal rather than tearing this
  // down. This effect only (re)builds the schedule when the step grid's
  // *shape* changes (bars/resolution) — not on every step, and not on bpm.
  useEffect(() => {
    if (!isPlaying || !engine) return;

    const totalSteps = bars * resolution;
    let stepCounter = currentStep;

    const id = engine.scheduleRepeat((time) => {
      // Classic swing (P2-16): every other step lands a little late. Read
      // live off refs so a swing/bpm change mid-playback applies to the very
      // next tick instead of needing the schedule torn down and rebuilt.
      const stepDuration = 60 / bpmRef.current / (resolution / 4);
      const swingOffset = (swingRef.current / 100) * stepDuration;
      const audioTime = stepCounter % 2 === 1 ? time + swingOffset : time;

      lanesRef.current.forEach((lane, idx) => {
        const step = stepCounter;
        const mainOn = gridRef.current[idx]?.[step] === true;
        const subs = subGridRef.current[idx];
        const layerOn = (layerIndex: number) =>
          layerIndex === 0 ? mainOn : subs?.[layerIndex - 1]?.[step] === true;
        if (mainOn || subs?.some((row) => row[step] === true)) {
          const accent = accentsRef.current[idx]?.[step] ?? DEFAULT_ACCENT;
          engine.playDrumAt(lane.id, audioTime, ACCENT_VELOCITY[accent], layerOn);
        }
      });

      // The step that sounds at `time` is the one to light at `time`: capture
      // it before advancing the counter to the next step to schedule.
      const soundingStep = stepCounter;
      stepCounter = (stepCounter + 1) % totalSteps;
      // Deferred to land near the audio itself, not the Transport's
      // lookahead — otherwise the highlighted step visibly leads the sound.
      // Intentionally the unswung `time`: only the audio moves for swing, not
      // the playhead, so the highlight doesn't visibly jitter off-grid.
      engine.drawAt(time, () => setCurrentStep(soundingStep));
    }, resolution);

    engine.setTransportBpm(bpm);
    engine.startTransport();

    return () => {
      engine.clearScheduled(id);
      engine.stopTransport();
    };
    // currentStep is read once to seed the local counter and is deliberately
    // not a dependency: it changes on every step, and re-running this would
    // tear down and rebuild the schedule sixteen times a bar.
    // grid is also deliberately excluded: the callback reads it via gridRef
    // so an edit during playback doesn't tear down and rebuild the schedule
    // either (ISSUE-REL-004 IT-4 — that restart is what causes the audible
    // skip/double). bpm is excluded for the same reason and handled by the
    // effect below instead, which updates the Transport's tempo in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, engine, bars, resolution, setCurrentStep]);

  // Tempo changes while playing update the Transport directly — see above.
  useEffect(() => {
    engine?.setTransportBpm(bpm);
  }, [bpm, engine]);

  // Mute/solo (ISSUE-BEATBOX-011): recomputes every lane's audibility
  // whenever `lanes` changes (a mute/solo toggle, a lane added/removed, or
  // the initial load from localStorage) and pushes the result to the
  // engine's per-lane buses. All lanes, not just the one that changed —
  // toggling one lane's solo can flip whether every *other* lane is audible
  // too, which a "just update the lane that was clicked" handler (like
  // removeLane's own engine call above) would miss. This does not run per
  // Transport tick, so it cannot affect playback timing.
  useEffect(() => {
    if (!engine) return;
    lanes.forEach((lane) => {
      engine.setLaneAudible(lane.id, isLaneAudible(lanes, lane.id));
    });
  }, [engine, lanes]);

  return (
    // Pixel icons follow the text-size setting in whole multiples of 16 px
    // (src/pixel-icons/PixelIcon.tsx, iconMultipleForTextScale).
    <PixelIconTextScale.Provider value={textScale}>
    <div
      style={{
        fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
        backgroundColor: 'var(--app-bg, #0a0a0a)',
        color: 'var(--app-text, #fff)',
        minHeight: '100vh',
      }}
      // Page margin lives in theme-bridge.css (.bb-app-root): 20 px from
      // 480 px up, 8 px below so a 360 px phone shows all 16 step columns.
      className="bb-app-root"
    >
      {/* Festival picture in the lower right, behind the UI, dark themes only (owner 2026-10-19). */}
      <BackgroundArt themeKey={themeKey} />
      {/* Inline header keeps the whole tool on one screen (owner request, 2026-09-01) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        {/* maxWidth + break-word: at 48 px text (UI rule C9) the title is wider
            than a phone screen; it wraps instead of widening the page. At
            normal sizes it is narrower than its row, so nothing changes. */}
        <h1 style={{ margin: '0 0 6px 0', fontSize: fsPx(22), maxWidth: '100%', overflowWrap: 'break-word' }}>
          <BrandMark decorative style={{ marginRight: '8px' }} />
          BeatBayashi
        </h1>
        <p
          data-testid="tagline"
          title={t('taglineFull')}
          style={{ color: 'var(--app-muted, #999)', margin: 0, minWidth: 0, flex: '1 1 12em', overflowWrap: 'anywhere', fontSize: fsPx(12) }}
        >
          {/* Owner 2026-10-06: the full line on wide screens, the short
              name under 600 px (the full line stays in the title). */}
          <span className="bb-tagline-full" style={{ whiteSpace: 'pre-line' }}>{t('taglineFull')}</span>
          <span className="bb-tagline-short">{t('tagline')}</span>
        </p>
        {/* Language: top right of the header (owner 2026-10-06). */}
        <div style={{ marginLeft: 'auto', display: 'flex', minWidth: 0, maxWidth: '100%' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <LabelIconBox icon={LABEL_ICONS.languageLabel} />
            <LanguagePicker />
          </span>
          <span style={{ marginLeft: 6, display: 'inline-flex', flex: '0 0 auto' }}>
            <ThemeToggle />
          </span>
        </div>
      </div>

      {/* Owner 2026-10-06: the PLAY row sits right under the header, on one
          line; the layout toolbar moved down under the panels, and the
          rights notice is a pulldown at the very bottom. */}
      <div style={{ margin: '6px 0' }}>
        <ControlPanel
          section="transport"
          audioEngine={engine}
          audioError={audioError}
          onRetryAudio={retryAudioInit}
          onEnsureAudio={initAudioEngine}
          onSoundChange={() => refreshSounds((n) => n + 1)}
        />
      </div>

      {showClearedStatus && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            margin: '2px 0 8px',
            fontSize: fsPx(11),
            color: 'var(--app-muted, #aaa)',
          }}
        >
          <span>{t('cleared')}</span>
          {clearedSnapshot && (
            <button
              type="button"
              onClick={restoreCleared}
              style={{
                padding: '2px 10px',
                background: 'var(--app-control, #2a2a2a)',
                color: 'var(--app-muted, #ddd)',
                border: '1px solid var(--app-border-strong, #3d3d3d)',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: fsPx(11),
              }}
            >
              <IconLabel icon="undo" tight>{t('restore')}</IconLabel>
            </button>
          )}
        </div>
      )}

      {clearConfirmOpen && (
        <ClearConfirmDialog onCancel={cancelClear} onConfirm={confirmClear} />
      )}

      {/* Panel board: panels flow in saved order and wrap automatically */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'flex-start',
        }}
      >
        {panelOrder.map((panelId) => {
          switch (panelId) {
            case 'sequencer':
              return (
                <PanelFrame key={panelId} id="sequencer" title={t('panelSequencer')} icon={LABEL_ICONS.panelSequencer}>
                  {/* Tempo, length and resolution sit right under the
                      Sequencer header (owner 2026-10-06). */}
                  <ControlPanel
                    section="pattern"
                    audioEngine={engine}
                    onSoundChange={() => refreshSounds((n) => n + 1)}
                  />
                  <SequencerGrid
                    audioEngine={engine}
                    onSoundChange={() => refreshSounds((n) => n + 1)}
                  />
                </PanelFrame>
              );
            case 'controls':
              return (
                <PanelFrame key={panelId} id="controls" title={t('panelControls')} icon={LABEL_ICONS.panelControls}>
                  <ControlPanel
                    section="body"
                    audioEngine={engine}
                    audioError={audioError}
                    onRetryAudio={retryAudioInit}
                    onSoundChange={() => refreshSounds((n) => n + 1)}
                  />
                </PanelFrame>
              );
            case 'presets':
              return (
                <PanelFrame key={panelId} id="presets" title={t('rhythmPresets')} icon={LABEL_ICONS.rhythmPresets} scrollY>
                  <PresetDropdowns
                    activePresetId={activePresetId}
                    onLoadPreset={applyPreset}
                    soundBasis={soundBasisState.basis}
                    onSoundBasisChange={(basis: SoundBasis) =>
                      changeSoundBasis({ ...soundBasisRef.current, basis })
                    }
                  />
                </PanelFrame>
              );
          }
        })}
      </div>

      {/* Layout toolbar: explicit save + reset for the customisable panel
          board. Owner decision #72 (2026-09-27): these three buttons are
          also reorderable, same "basic layout reorder" mechanism as the
          panels below (an ordered id array + left/right move buttons); focus order
          follows this same array since the buttons render in that order. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '12px 0 2px', flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: fsPx(13),
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--app-text, #ffffff)',
            fontWeight: 700,
          }}
        >
          <AlignedIconLabel icon={LABEL_ICONS.layoutCustom}>{t('layoutCustom')}</AlignedIconLabel>
        </span>
        <button
          type="button"
          aria-pressed={reorderOn}
          data-testid="reorder-toggle"
          onClick={() => setReorderOn(!reorderOn)}
          style={{
            padding: '2px 10px',
            background: reorderOn ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
            color: reorderOn ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
            border: '1px solid var(--app-border-strong, #3d3d3d)',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: fsPx(11),
            fontWeight: reorderOn ? 700 : 400,
          }}
        >
          <IconLabel icon="arrow-left" tight>{t('reorder')}</IconLabel>
        </button>
        {toolbarOrder.map((itemId, itemIdx) => {
          const moveButtons = !reorderOn ? null : (
            <span style={{ display: 'inline-flex', gap: '1px' }}>
              <button
                type="button"
                aria-label={t('moveEarlier', { item: itemId })}
                title="Move earlier"
                disabled={itemIdx === 0}
                onClick={() => moveToolbarItem(itemId, -1)}
                style={{
                  padding: '2px 4px',
                  background: 'var(--app-control, #2a2a2a)',
                  color: 'var(--app-muted, #ddd)',
                  border: '1px solid var(--app-border-strong, #3d3d3d)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: fsPx(9),
                  opacity: itemIdx === 0 ? 0.35 : 1,
                }}
              >
                <PixelIcon name="arrow-left" style={TIGHT_ICON} />
              </button>
              <button
                type="button"
                aria-label={t('moveLater', { item: itemId })}
                title="Move later"
                disabled={itemIdx === toolbarOrder.length - 1}
                onClick={() => moveToolbarItem(itemId, 1)}
                style={{
                  padding: '2px 4px',
                  background: 'var(--app-control, #2a2a2a)',
                  color: 'var(--app-muted, #ddd)',
                  border: '1px solid var(--app-border-strong, #3d3d3d)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: fsPx(9),
                  opacity: itemIdx === toolbarOrder.length - 1 ? 0.35 : 1,
                }}
              >
                <PixelIcon name="arrow-right" style={TIGHT_ICON} />
              </button>
            </span>
          );

          if (itemId === 'save') {
            return (
              <span key={itemId} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                <button
                  type="button"
                  onClick={() => {
                    saveLayout();
                    setLayoutSavedAt(Date.now());
                  }}
                  style={{
                    padding: '2px 10px',
                    background: 'var(--app-control, #2a2a2a)',
                    color: 'var(--app-muted, #ddd)',
                    border: '1px solid var(--app-border-strong, #3d3d3d)',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: fsPx(11),
                  }}
                >
                  <IconLabel icon="floppy" tight>{t('save')}</IconLabel>
                </button>
                {moveButtons}
              </span>
            );
          }

          if (itemId === 'reset') {
            return (
              <span key={itemId} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                <button
                  type="button"
                  onClick={resetLayout}
                  style={{
                    padding: '2px 10px',
                    background: 'var(--app-control, #2a2a2a)',
                    color: 'var(--app-muted, #ddd)',
                    border: '1px solid var(--app-border-strong, #3d3d3d)',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: fsPx(11),
                  }}
                >
                  <IconLabel icon="undo" tight>{t('layoutReset')}</IconLabel>
                </button>
                {moveButtons}
              </span>
            );
          }

          if (itemId === 'clear') {
            return (
              <span key={itemId} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                <button
                  type="button"
                  onClick={requestClear}
                  title={t('clearTitle')}
                  style={{
                    padding: '2px 10px',
                    background: 'var(--app-control, #2a2a2a)',
                    color: 'var(--app-muted, #ddd)',
                    border: '1px solid var(--app-danger, #ff3333)',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: fsPx(11),
                  }}
                >
                  <IconLabel icon="trash" tight>{t('clear')}</IconLabel>
                </button>
                {moveButtons}
              </span>
            );
          }

          return (
            <span key={itemId} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              <button
                type="button"
                aria-pressed={autoFit}
                title={t('autoFitTitle')}
                onClick={() => setAutoFit(!autoFit)}
                style={{
                  padding: '2px 10px',
                  background: autoFit ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
                  color: autoFit ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
                  border: '1px solid var(--app-border-strong, #3d3d3d)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: fsPx(11),
                  fontWeight: autoFit ? 700 : 400,
                }}
              >
                <IconLabel icon="fit" tight>{t('autoFit', { state: autoFit ? t('on') : t('off') })}</IconLabel>
              </button>
              {moveButtons}
            </span>
          );
        })}
        {layoutSavedAt !== null && Date.now() - layoutSavedAt < 4000 && (
          <span style={{ fontSize: fsPx(10), color: 'var(--app-ok, #2ba695)' }}>
            <IconLabel icon="check" tight>{t('saved')}</IconLabel>
          </span>
        )}
        <span style={{ fontSize: fsPx(10), color: 'var(--app-muted, #666)', minWidth: 0 }}>
          — {t('layoutHint')}
        </span>
      </div>

      <footer
        style={{
          marginTop: '40px',
          padding: '20px',
          borderTop: '1px solid var(--app-border, #333)',
          color: 'var(--app-muted, #666)',
          fontSize: fsPx(12),
          lineHeight: '1.6',
          overflowWrap: 'break-word',
        }}
      >
        <p style={{ marginTop: 0, marginBottom: '4px' }}>
          <strong style={{ color: 'var(--app-muted, #999)' }}>
            <BrandMark decorative style={{ marginRight: '6px' }} />
            BeatBayashi
          </strong> — {t('footerTagline')}
        </p>
        <p
          style={{
            margin: '4px 0',
            color: 'var(--app-muted, #555)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <span>{t('codeLicence', { status: t(apiStatus) })}</span>
          <button
            type="button"
            aria-pressed={backendEnabled}
            title="Probes your own http://localhost:8080 pattern-save server. Off by default — nothing leaves this app until you turn this on (docs/PRIVACY.md)."
            onClick={() => setBackendEnabled((v) => !v)}
            style={{
              padding: '2px 10px',
              background: backendEnabled ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
              color: backendEnabled ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
              border: '1px solid var(--app-border-strong, #3d3d3d)',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: fsPx(11),
              fontWeight: backendEnabled ? 700 : 400,
            }}
          >
            {t('useBackend', { state: backendEnabled ? t('on') : t('off') })}
          </button>
        </p>
        {/* Keyboard use (owner 2026-10-06), in the UI language. */}
        <details data-testid="keyboard-help" style={{ marginTop: '8px' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--app-text, #eee)', fontWeight: 600 }}>
            <AlignedIconLabel icon={LABEL_ICONS.keyboardTitle}>{t('keyboardTitle')}</AlignedIconLabel>
          </summary>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: '1.2em' }}>
            <li>{t('kbGrid')}</li>
            <li>{t('kbSlider')}</li>
            <li>{t('kbNumber')}</li>
          </ul>
        </details>
      </footer>

      {/* Rights notice: the very bottom of the interface (owner 2026-10-06). */}
      <RightsBanner />
    </div>
    </PixelIconTextScale.Provider>
  );
}

export default App;
