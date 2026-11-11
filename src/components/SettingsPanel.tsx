// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { AlignedIconLabel } from './LabelIcon';
import React, { useEffect, useRef, useState } from 'react';
import { PixelIcon, IconLabel, LABEL_ICONS } from '../pixel-icons';
import { AudioEngine, MAX_LAYERS_PER_VOICE, MIN_LAYERS_PER_VOICE } from '../audio/AudioEngine';
import {
  getPreset,
  getPresetDefaults,
  getPresetIds,
  getPresetDisplayName,
  getPresetParameters,
  type DelayConfig,
  type Lane,
} from '../audio/synthPresets';
import { useSequencerStore } from '../store/sequencerStore';
import { translate, useLanguageStore, useT } from '../i18n/i18n';
import * as userPresets from '../audio/userPresets';
import type { UserPreset } from '../audio/userPresets';
import { useModalA11y } from '../hooks/useModalA11y';
import { SliderField } from './SliderField';
import { AppearanceSection } from '../theme/AppearanceSection';
import { fsPx } from '../theme/themeStore';

const STORAGE_KEY = 'BeatBayashi.drumSettings';
const TITLE_ID = 'settings-panel-title';

/** Sliders are stored per drum AND per preset, keyed `${drum}:${presetId}`. */
type SettingsStore = Record<string, Record<string, number>>;

export const SettingsPanel: React.FC<{
  audioEngine: AudioEngine | null;
  onPresetChange: () => void;
  onClose: () => void;
}> = ({ audioEngine, onPresetChange, onClose }) => {
  const { lanes } = useSequencerStore();
  const t = useT();
  const [activeLaneId, setActiveLaneId] = useState<string>('kick');
  const [activeLayerId, setActiveLayerId] = useState<string>('');
  const [values, setValues] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sound' | 'appearance'>('sound');

  // A lane the panel was showing can vanish (P2-17's "remove lane") while
  // it's open; fall back to the first lane rather than rendering nothing.
  const activeLane: Lane = lanes.find((l) => l.id === activeLaneId) ?? lanes[0];
  const activeCategory = activeLane.category;

  // Sounds the user named and kept. Stored on this machine only (docs/PRIVACY.md).
  const [myPresets, setMyPresets] = useState<UserPreset[]>(() => userPresets.load());
  const [newPresetName, setNewPresetName] = useState('');
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const layers = audioEngine?.getLayers(activeLane.id) ?? [];
  const activeLayer = layers.find((l) => l.layerId === activeLayerId) ?? layers[0] ?? null;
  const activeLayerIndex = activeLayer
    ? layers.findIndex((l) => l.layerId === activeLayer.layerId)
    : -1;
  const presetId = activeLayer?.presetId ?? 'membrane_808';

  // Pull the live values whenever the lane, the selected layer, or which
  // layer resolves to "active" (e.g. after an add/remove elsewhere) changes.
  useEffect(() => {
    if (!audioEngine || !activeLayer) return;
    if (activeLayer.layerId !== activeLayerId) {
      setActiveLayerId(activeLayer.layerId);
    }
    setValues(audioEngine.getLayerSettings(activeLane.id, activeLayer.layerId));
    // Only the resolved layer's identity should retrigger this — `layers`
    // itself is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEngine, activeLane.id, activeLayer?.layerId]);

  const persist = (store: SettingsStore) => {
    const ok = persistSettings(store);
    setSaveNotice(
      ok ? null : 'Could not save: this browser is refusing local storage (private mode?).'
    );
    return ok;
  };

  const commit = (next: Record<string, number>) => {
    setValues(next);
    setSaved(false);
    if (!audioEngine || !activeLayer) return;
    audioEngine.setLayerSettings(activeLane.id, activeLayer.layerId, next);
  };

  const selectPreset = (nextPresetId: string) => {
    if (!audioEngine || !activeLayer) return;
    if (activeLayerIndex === 0) {
      audioEngine.changeDrumPreset(activeLane.id, nextPresetId);
    } else {
      audioEngine.updateLayer(activeLane.id, activeLayer.layerId, { presetId: nextPresetId });
    }
    setValues(audioEngine.getLayerSettings(activeLane.id, activeLayer.layerId));
    setSaved(false);
    onPresetChange();
    audioEngine.playDrum(activeLane.id);
  };

  const saveAll = () => {
    if (!audioEngine) return;
    setSaved(persist(audioEngine.getAllSettings()));
  };

  const commitPresets = (next: UserPreset[], notice: string) => {
    setMyPresets(next);
    setPresetNotice(
      userPresets.save(next)
        ? notice
        : 'Could not save: this browser is refusing local storage (private mode?).'
    );
  };

  /** Keeps the active layer's preset + sliders under a name. Kept sounds are
   *  filed by category (P2-17), not lane, so a sound kept from one kick lane
   *  shows up for every kick-category lane, added ones included. */
  const saveNamedPreset = () => {
    const name = userPresets.normaliseName(newPresetName);
    if (!name || !audioEngine || !activeLayer) return;
    const preset = userPresets.createPreset({
      name,
      drum: activeCategory,
      basePresetId: presetId,
      values: audioEngine.getLayerSettings(activeLane.id, activeLayer.layerId),
    });
    commitPresets(userPresets.upsert(myPresets, preset), `Saved "${name}".`);
    setNewPresetName('');
  };

  /** Loads a kept sound into the active layer of whichever lane is open —
   *  not necessarily the lane it was originally saved from (P2-17: a kept
   *  sound is filed by category, and this panel can have any lane of that
   *  category open when "Load" is clicked). */
  const loadNamedPreset = (preset: UserPreset) => {
    if (!audioEngine || !activeLayer) return;
    if (activeLayerIndex === 0) {
      audioEngine.changeDrumPreset(activeLane.id, preset.basePresetId);
    } else {
      audioEngine.updateLayer(activeLane.id, activeLayer.layerId, {
        presetId: preset.basePresetId,
      });
    }
    audioEngine.setLayerSettings(activeLane.id, activeLayer.layerId, preset.values);
    setValues(audioEngine.getLayerSettings(activeLane.id, activeLayer.layerId));
    setSaved(false);
    setPresetNotice(`Loaded "${preset.name}".`);
    onPresetChange();
    audioEngine.playDrum(activeLane.id);
  };

  const deleteNamedPreset = (preset: UserPreset) => {
    commitPresets(userPresets.remove(myPresets, preset.id), `Deleted "${preset.name}".`);
  };

  /** Promise 3: a sound you tuned can leave this app. */
  const exportNamedPresets = () => {
    const blob = new Blob([userPresets.serialisePresetFile(myPresets)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'beatbayashi-sounds.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importNamedPresets = async (file: File) => {
    if (userPresets.isImportFileTooLarge(file.size)) {
      setPresetNotice(translate(useLanguageStore.getState().language, 'fileTooLarge'));
      return;
    }
    const imported = userPresets.parsePresetFile(await file.text());
    if (imported.length === 0) {
      setPresetNotice('No sounds found in that file.');
      return;
    }
    commitPresets(
      userPresets.merge(myPresets, imported),
      `Imported ${imported.length} sound${imported.length === 1 ? '' : 's'}.`
    );
  };

  const resetThisLayer = () => {
    if (!audioEngine || !activeLayer) return;
    audioEngine.clearLayerSettings(activeLane.id, activeLayer.layerId);
    setValues(getPresetDefaults(activeCategory, activeLayer.presetId));
    persist(audioEngine.getAllSettings());
    setSaved(false);
  };

  const updateLayerField = (patch: { gainDb?: number; pan?: number }) => {
    if (!audioEngine || !activeLayer) return;
    audioEngine.updateLayer(activeLane.id, activeLayer.layerId, patch);
    setSaved(false);
    onPresetChange();
  };

  const updateDelayField = (patch: Partial<DelayConfig>) => {
    if (!audioEngine || !activeLayer) return;
    audioEngine.updateLayer(activeLane.id, activeLayer.layerId, {
      delay: { ...activeLayer.delay, ...patch },
    });
    setSaved(false);
    onPresetChange();
  };

  const addLayerHere = () => {
    if (!audioEngine) return;
    const created = audioEngine.addLayer(activeLane.id);
    if (created) {
      // Sub steps (pattern v3): the new sub's row starts as the main steps.
      useSequencerStore
        .getState()
        .subLayerAdded(activeLane.id, audioEngine.getLayers(activeLane.id).length - 2);
      setActiveLayerId(created.layerId);
      setSaved(false);
      onPresetChange();
    }
  };

  const removeThisLayer = () => {
    if (!audioEngine || !activeLayer) return;
    const removedIndex = audioEngine
      .getLayers(activeLane.id)
      .findIndex((l) => l.layerId === activeLayer.layerId);
    const ok = audioEngine.removeLayer(activeLane.id, activeLayer.layerId);
    if (ok) {
      if (removedIndex > 0) {
        useSequencerStore.getState().subLayerRemoved(activeLane.id, removedIndex - 1);
      }
      const remaining = audioEngine.getLayers(activeLane.id);
      setActiveLayerId(remaining[0]?.layerId ?? '');
      setSaved(false);
      onPresetChange();
    }
  };

  const preset = getPreset(activeCategory, presetId);
  const parameters = getPresetParameters(activeCategory, presetId);
  const defaults = getPresetDefaults(activeCategory, presetId);

  const decimals = (step: number) => (step < 0.001 ? 4 : step < 0.1 ? 3 : 1);

  const atMaxLayers = layers.length >= MAX_LAYERS_PER_VOICE;
  const atMinLayers = layers.length <= MIN_LAYERS_PER_VOICE;
  const delayEnabled = activeLayer?.delay.enabled ?? false;

  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.82)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        style={{
          backgroundColor: 'var(--app-panel-alt, #161616)',
          color: 'var(--app-text, #fff)',
          padding: '24px',
          borderRadius: '10px',
          width: 'min(680px, 100%)',
          maxHeight: '88vh',
          overflowY: 'auto',
          border: '1px solid var(--app-accent, #0f8a80)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '18px',
          }}
        >
          {/* minWidth 0 + break-word: at 48 px text (UI rule C9) the title wraps
              and the close button stays in view; no effect at normal sizes. */}
          <h2 id={TITLE_ID} style={{ margin: 0, fontSize: fsPx(20), minWidth: 0, overflowWrap: 'anywhere' }}>
            <IconLabel icon="gear">Sound Settings</IconLabel>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close sound settings"
            style={{
              backgroundColor: 'var(--app-control, #2a2a2a)',
              color: 'var(--app-text, #fff)',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: fsPx(16),
            }}
          >
            <PixelIcon name="close" style={{ display: 'block' }} />
          </button>
        </div>

        {/* Owner decisions #70-71 (2026-09-27): appearance lives in this same
            dialog rather than a second modal. */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('sound')}
            aria-pressed={activeTab === 'sound'}
            style={{
              padding: '8px 14px',
              backgroundColor: activeTab === 'sound' ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
              color: activeTab === 'sound' ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: activeTab === 'sound' ? 700 : 400,
            }}
          >
            <AlignedIconLabel icon={LABEL_ICONS.soundTab}>{t('soundTab')}</AlignedIconLabel>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            aria-pressed={activeTab === 'appearance'}
            style={{
              padding: '8px 14px',
              backgroundColor: activeTab === 'appearance' ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
              color: activeTab === 'appearance' ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: activeTab === 'appearance' ? 700 : 400,
            }}
          >
            <AlignedIconLabel icon={LABEL_ICONS.appearanceTab}>{t('appearanceTab')}</AlignedIconLabel>
          </button>
        </div>

        {activeTab === 'appearance' && <AppearanceSection />}

        {activeTab === 'sound' && (
        <>
        {!audioEngine && (
          <p style={{ color: 'var(--app-danger, #ffb066)', fontSize: fsPx(13) }}>
            Click anywhere on the page first to start audio, then reopen this panel.
          </p>
        )}

        {/* Which lane (P2-17: the original four, plus anything added) */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {lanes.map((lane) => (
            <button
              key={lane.id}
              onClick={() => setActiveLaneId(lane.id)}
              aria-pressed={activeLane.id === lane.id}
              style={{
                flex: '1 0 auto',
                minWidth: '70px',
                padding: '10px',
                backgroundColor: activeLane.id === lane.id ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
                color: activeLane.id === lane.id ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: activeLane.id === lane.id ? 700 : 400,
              }}
            >
              {lane.label}
            </button>
          ))}
        </div>

        {/* Which layer of this lane — only shown once there's a choice, so a
            single-layer voice looks exactly like it always has. */}
        {layers.length >= 2 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
            {layers.map((layer, idx) => {
              const isActive = layer.layerId === activeLayer?.layerId;
              return (
                <button
                  key={layer.layerId}
                  type="button"
                  onClick={() => setActiveLayerId(layer.layerId)}
                  aria-pressed={isActive}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: isActive ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
                    color: isActive ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: isActive ? 700 : 400,
                    fontSize: fsPx(12),
                  }}
                >
                  Layer {idx + 1}
                </button>
              );
            })}
          </div>
        )}

        {/* Which preset for that layer */}
        <label style={{ display: 'block', marginBottom: '16px' }}>
          <span style={{ fontSize: fsPx(13), color: 'var(--app-muted, #aaa)' }}>Preset</span>
          <select
            value={presetId}
            onChange={(e) => selectPreset(e.target.value)}
            disabled={!audioEngine}
            aria-label={`${activeLane.label} layer ${activeLayerIndex + 1} preset`}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '10px',
              backgroundColor: 'var(--app-panel-alt, #222)',
              color: 'var(--app-text, #fff)',
              border: '1px solid var(--app-muted, #555)',
              borderRadius: '4px',
            }}
          >
            {getPresetIds(activeCategory).map((id) => (
              <option key={id} value={id}>
                {getPresetDisplayName(activeCategory, id)}
              </option>
            ))}
          </select>
          {preset && (
            <span
              style={{
                display: 'block',
                marginTop: '6px',
                fontSize: fsPx(12),
                color: 'var(--app-muted, #888)',
              }}
            >
              {preset.note}
            </span>
          )}
        </label>

        {/* Parameters — the slider list is derived from this preset */}
        <div style={{ marginBottom: '18px' }}>
          {parameters.map((param) => {
            const value = values[param.key] ?? defaults[param.key] ?? param.min;
            const isChanged =
              defaults[param.key] !== undefined &&
              Math.abs(value - defaults[param.key]) > 1e-9;

            return (
              <div key={param.key} style={{ marginBottom: '8px' }}>
                <SliderField
                  label={`${param.label}${isChanged ? ' •' : ''}`}
                  labelColor={isChanged ? 'var(--app-danger, #ffb066)' : undefined}
                  name={param.label}
                  value={value}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  digits={decimals(param.step)}
                  disabled={!audioEngine}
                  onChange={(v) => commit({ ...values, [param.key]: v })}
                  onCommitted={() => audioEngine?.playDrum(activeLane.id)}
                />
              </div>
            );
          })}
        </div>

        {/* Layer shaping — new in ISSUE-LAYER-002: every layer (including a
            voice's only layer) gets its own level, pan and short delay, so
            stacking synths actually reads as thickness instead of just
            volume. */}
        <div
          style={{
            marginBottom: '18px',
            padding: '10px',
            border: '1px solid var(--app-border, #333333)',
            borderRadius: '6px',
          }}
        >
          <div
            style={{
              fontSize: fsPx(11),
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--app-muted, #999999)',
              marginBottom: '10px',
            }}
          >
            Layer {activeLayerIndex + 1 || 1} shaping
          </div>

          <div style={{ marginBottom: '8px' }}>
            <SliderField
              label="Gain"
              name="Layer gain"
              value={activeLayer?.gainDb ?? 0}
              min={-24}
              max={6}
              step={0.5}
              digits={1}
              unit="dB"
              disabled={!audioEngine || !activeLayer}
              onChange={(v) => updateLayerField({ gainDb: v })}
              onCommitted={() => audioEngine?.playDrum(activeLane.id)}
            />
          </div>

          <div style={{ marginBottom: '8px' }}>
            <SliderField
              label="Pan"
              name="Layer pan, left to right"
              value={activeLayer?.pan ?? 0}
              min={-1}
              max={1}
              step={0.05}
              digits={2}
              disabled={!audioEngine || !activeLayer}
              onChange={(v) => updateLayerField({ pan: v })}
              onCommitted={() => audioEngine?.playDrum(activeLane.id)}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <span style={{ fontSize: fsPx(13), color: 'var(--app-muted, #ccc)' }}>Delay</span>
            <button
              type="button"
              onClick={() => updateDelayField({ enabled: !delayEnabled })}
              disabled={!audioEngine || !activeLayer}
              aria-pressed={delayEnabled}
              aria-label="Toggle layer delay"
              style={{
                padding: '4px 12px',
                fontSize: fsPx(11),
                fontWeight: 700,
                backgroundColor: delayEnabled ? 'var(--app-accent, #0f8a80)' : 'var(--app-control, #2a2a2a)',
                color: delayEnabled ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #ddd)',
                border: '1px solid var(--app-border-strong, #3d3d3d)',
                borderRadius: '4px',
                cursor: audioEngine && activeLayer ? 'pointer' : 'not-allowed',
              }}
            >
              {delayEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {(
            [
              { key: 'timeMs', label: 'Delay Time (ms)', min: 5, max: 400, step: 1, digits: 0 },
              { key: 'feedback', label: 'Delay Feedback', min: 0, max: 0.6, step: 0.01, digits: 2 },
              { key: 'wet', label: 'Delay Wet', min: 0, max: 1, step: 0.01, digits: 2 },
            ] as const
          ).map((slider) => {
            const value = activeLayer?.delay[slider.key] ?? slider.min;
            return (
              <div key={slider.key} style={{ marginBottom: '8px' }}>
                <SliderField
                  label={slider.label}
                  labelColor={delayEnabled ? undefined : 'var(--app-muted, #666666)'}
                  name={slider.label}
                  value={value}
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  digits={slider.digits}
                  disabled={!audioEngine || !activeLayer || !delayEnabled}
                  onChange={(v) => updateDelayField({ [slider.key]: v })}
                  onCommitted={() => audioEngine?.playDrum(activeLane.id)}
                />
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            marginBottom: '8px',
          }}
        >
          <button
            onClick={() => audioEngine?.playDrum(activeLane.id)}
            disabled={!audioEngine}
            style={{
              padding: '12px',
              backgroundColor: audioEngine ? 'var(--app-ok, #2ba695)' : 'var(--app-border-strong, #444)',
              color: 'var(--app-on-accent, #000)',
              border: 'none',
              borderRadius: '4px',
              cursor: audioEngine ? 'pointer' : 'not-allowed',
              fontWeight: 700,
            }}
          >
            <IconLabel icon="speaker">Preview</IconLabel>
          </button>
          <button
            onClick={saveAll}
            disabled={!audioEngine || activeLayerIndex > 0}
            title={
              activeLayerIndex > 0
                ? 'Layer 2+ settings are not saved across reloads yet — only layer 1 persists'
                : undefined
            }
            style={{
              padding: '12px',
              backgroundColor: !audioEngine || activeLayerIndex > 0 ? 'var(--app-border-strong, #444)' : 'var(--app-accent, #0f8a80)',
              color: activeLayerIndex > 0 ? 'var(--app-muted, #999)' : 'var(--app-on-accent, #000)',
              border: 'none',
              borderRadius: '4px',
              cursor: !audioEngine || activeLayerIndex > 0 ? 'not-allowed' : 'pointer',
              fontWeight: 700,
            }}
          >
            {saved ? <IconLabel icon="check">Saved</IconLabel> : <IconLabel icon="floppy">Save</IconLabel>}
          </button>
          <button
            onClick={resetThisLayer}
            disabled={!audioEngine}
            style={{
              padding: '12px',
              backgroundColor: 'var(--app-danger-strong, #8a3030)',
              color: 'var(--app-text, #fff)',
              border: 'none',
              borderRadius: '4px',
              cursor: audioEngine ? 'pointer' : 'not-allowed',
              fontWeight: 700,
            }}
          >
            <IconLabel icon="undo">Reset</IconLabel>
          </button>
        </div>

        {/* Layer count controls — mirrors the "Add layer" / remove (close icon) pair in the
            step grid, so the same operation is reachable from either place. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
          }}
        >
          <button
            type="button"
            onClick={addLayerHere}
            disabled={!audioEngine || atMaxLayers}
            aria-label={`Add layer to ${activeLane.label}`}
            title={atMaxLayers ? `Up to ${MAX_LAYERS_PER_VOICE} layers per voice` : undefined}
            style={{
              padding: '10px',
              backgroundColor: 'var(--app-control, #2a2a2a)',
              color: 'var(--app-muted, #ddd)',
              border: '1px solid var(--app-border-strong, #3d3d3d)',
              borderRadius: '4px',
              cursor: !audioEngine || atMaxLayers ? 'not-allowed' : 'pointer',
              opacity: !audioEngine || atMaxLayers ? 0.35 : 1,
              fontWeight: 700,
            }}
          >
            <IconLabel icon="plus">Add layer</IconLabel>
          </button>
          <button
            type="button"
            onClick={removeThisLayer}
            disabled={!audioEngine || atMinLayers || activeLayerIndex === 0}
            aria-label={`Remove layer ${activeLayerIndex + 1} from ${activeLane.label}`}
            title={
              atMinLayers
                ? 'Every voice needs at least 1 layer'
                : activeLayerIndex === 0
                  ? "Layer 1 is this voice's primary sound and can't be removed"
                  : undefined
            }
            style={{
              padding: '10px',
              backgroundColor: 'var(--app-danger-strong, #8a3030)',
              color: 'var(--app-text, #fff)',
              border: 'none',
              borderRadius: '4px',
              cursor:
                !audioEngine || atMinLayers || activeLayerIndex === 0
                  ? 'not-allowed'
                  : 'pointer',
              opacity: !audioEngine || atMinLayers || activeLayerIndex === 0 ? 0.35 : 1,
              fontWeight: 700,
            }}
          >
            <IconLabel icon="trash">Remove this layer</IconLabel>
          </button>
        </div>

        {saveNotice && (
          <p role="alert" style={{ fontSize: fsPx(12), color: 'var(--app-danger, #ff3333)', marginTop: '10px' }}>
            {saveNotice}
          </p>
        )}

        <p style={{ fontSize: fsPx(12), color: 'var(--app-muted, #777)', marginTop: '14px' }}>
          Each preset keeps its own slider values. Reset restores this layer's
          tuned defaults; Save stores the primary layer's settings in this browser.
          Gain/Pan/Delay and added layers live for this session (not yet persisted
          across reloads).
        </p>

        {/* Sounds the user named and kept */}
        <div style={{ marginTop: '20px', borderTop: '1px solid var(--app-border, #333)', paddingTop: '16px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: fsPx(15) }}>
            My sounds <span style={{ color: 'var(--app-muted, #888)', fontWeight: 400 }}>({activeCategory})</span>
          </h3>
          <p style={{ fontSize: fsPx(12), color: 'var(--app-muted, #777)', margin: '0 0 12px' }}>
            Save what you tuned under a name, and it is here next time. Stored on this
            machine only — nothing is uploaded. Export writes a file you can carry to
            another machine.
          </p>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              type="text"
              value={newPresetName}
              maxLength={userPresets.MAX_NAME_LENGTH}
              placeholder="Name this sound"
              aria-label="Name this sound"
              disabled={!audioEngine}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveNamedPreset();
              }}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: 'var(--app-panel-alt, #222)',
                color: 'var(--app-text, #fff)',
                border: '1px solid var(--app-muted, #555)',
                borderRadius: '4px',
              }}
            />
            <button
              onClick={saveNamedPreset}
              disabled={!audioEngine || userPresets.normaliseName(newPresetName) === ''}
              style={{
                padding: '10px 16px',
                backgroundColor:
                  audioEngine && userPresets.normaliseName(newPresetName) ? 'var(--app-accent, #0f8a80)' : 'var(--app-border-strong, #444)',
                color: audioEngine && userPresets.normaliseName(newPresetName) ? 'var(--app-on-accent, #000)' : 'var(--app-muted, #999)',
                border: 'none',
                borderRadius: '4px',
                cursor: audioEngine ? 'pointer' : 'not-allowed',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              <IconLabel icon="plus">Keep</IconLabel>
            </button>
          </div>

          {userPresets.forDrum(myPresets, activeCategory).length === 0 ? (
            <p style={{ fontSize: fsPx(12), color: 'var(--app-muted, #666)', margin: '0 0 12px' }}>
              Nothing kept for {activeCategory} yet.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
              {userPresets.forDrum(myPresets, activeCategory).map((entry) => (
                <li
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--app-border-strong, #262626)',
                  }}
                >
                  <span style={{ flex: 1, fontSize: fsPx(13) }}>
                    {entry.name}
                    <span style={{ color: 'var(--app-muted, #777)', fontSize: fsPx(11), marginLeft: '8px' }}>
                      {getPresetDisplayName(entry.drum, entry.basePresetId)}
                    </span>
                  </span>
                  <button
                    onClick={() => loadNamedPreset(entry)}
                    disabled={!audioEngine}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'var(--app-control, #2a2a2a)',
                      color: 'var(--app-muted, #ddd)',
                      border: '1px solid var(--app-border-strong, #444)',
                      borderRadius: '4px',
                      cursor: audioEngine ? 'pointer' : 'not-allowed',
                      fontSize: fsPx(12),
                    }}
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteNamedPreset(entry)}
                    aria-label={`Delete ${entry.name}`}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: 'var(--app-control, #2a2a2a)',
                      color: 'var(--app-danger, #e08a8a)',
                      border: '1px solid var(--app-border-strong, #444)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: fsPx(12),
                    }}
                  >
                    <IconLabel icon="trash">Delete</IconLabel>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={exportNamedPresets}
              disabled={myPresets.length === 0}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: myPresets.length ? 'var(--app-control, #2a2a2a)' : 'var(--app-panel-alt, #222)',
                color: myPresets.length ? 'var(--app-muted, #ddd)' : 'var(--app-muted, #666)',
                border: '1px solid var(--app-border-strong, #444)',
                borderRadius: '4px',
                cursor: myPresets.length ? 'pointer' : 'not-allowed',
                fontSize: fsPx(13),
              }}
            >
              <IconLabel icon="download">Export all ({myPresets.length})</IconLabel>
            </button>
            <button
              onClick={() => importInput.current?.click()}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: 'var(--app-control, #2a2a2a)',
                color: 'var(--app-muted, #ddd)',
                border: '1px solid var(--app-border-strong, #444)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: fsPx(13),
              }}
            >
              <IconLabel icon="upload">Import</IconLabel>
            </button>
            <input
              ref={importInput}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importNamedPresets(file);
                e.target.value = '';
              }}
            />
          </div>

          {presetNotice && (
            <p style={{ fontSize: fsPx(12), color: 'var(--app-ok, #9fd8c8)', marginTop: '10px' }}>
              {presetNotice}
            </p>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
};

/** Read persisted settings at startup.
 *
 * ISSUE-BEATBOX-030: `raw` can be corrupted (other tab, extension, manual
 * edit) in more ways than "not valid JSON" — it can also be valid JSON that
 * isn't a plain object at all (`null`, an array, a string, a number). Both
 * cases fall back to an empty settings store rather than handing a shape
 * `loadAllSettings` doesn't expect further down, matching the grid/lanes
 * validation `loadSequencerState` already does for ISSUE-BEATBOX-027. */
/** Write settings to storage, catching the same failures `userPresets.save`
 * catches (QuotaExceededError, private-mode refusal). Returns whether the
 * write succeeded so callers can surface a message instead of throwing. */
export function persistSettings(store: SettingsStore): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function loadStoredSettings(): SettingsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as SettingsStore;
  } catch {
    return {};
  }
}
