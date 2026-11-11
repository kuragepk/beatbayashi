// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import React, { useState } from 'react';
import { IconLabel } from '../pixel-icons';
import { useSequencerStore } from '../store/sequencerStore';
import { fsPx } from '../theme/themeStore';
import { AudioEngine } from '../audio/AudioEngine';
import { downloadMidi, GM_DRUM_NOTES } from '../export/midi';
import { buildSoundRecipe } from '../audio/soundRecipe';
import { encodeWav } from '../export/wav';
import { createZip, type ZipEntry } from '../export/zip';
import { buildSfz, type SfzRegion } from '../export/sfz';
import { getPreset } from '../audio/synthPresets';
import { useModalA11y } from '../hooks/useModalA11y';
import { CONTENT_RIGHTS_LINE, exportRightsFields } from '../export/rights';

const TITLE_ID = 'export-panel-title';

// Finding 11, P1-1 licensing-provenance audit: exported WAVs otherwise carry
// no note that they were synthesised, not sampled.
const WAV_PROVENANCE = {
  software: 'BeatBayashi',
  comment: 'All sounds synthesised, no samples or third-party recordings.',
};

export const ExportPanel: React.FC<{
  audioEngine: AudioEngine | null;
  onClose: () => void;
}> = ({ audioEngine, onClose }) => {
  const { lanes, grid, subGrid, accents, swing, bars, resolution, bpm } = useSequencerStore();
  // Preset of each existing sub sound per lane (layers 1+). Without the
  // engine there is no layer list yet, so no sub is written.
  const subPresets: Record<string, string[]> =
    audioEngine && typeof audioEngine.getLayers === 'function'
    ? Object.fromEntries(
        lanes.map((l) => [l.id, audioEngine.getLayers(l.id).slice(1).map((layer) => layer.presetId)])
      )
    : {};
  const [exporting, setExporting] = useState(false);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const exportJSON = () => {
    // Version 2: contentRights became an object (SPDX id + deed URL) instead
    // of a sentence. Version 1 files stay readable via readContentRights().
    // Version 3 (2026-10-06): adds subGrid, the sub-sound steps
    // (subGrid[lane][sub][step]); a reader without it plays subs on `grid`.
    const state = {
      version: 3,
      lanes,
      grid,
      subGrid,
      accents,
      swing,
      bars,
      resolution,
      bpm,
      timestamp: new Date().toISOString(),
      ...exportRightsFields(),
    };

    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beatbayashi-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMIDI = () => {
    // P2-15: a lane's real pitch, for the presets whose sound is tuned by a
    // frequency slider (MetalSynth-based cymbal/clap presets) rather than a
    // fixed drum note. Anything else has no such slider, so it is left out
    // and midi.ts falls back to the preset-name table.
    const frequencies: Record<string, number> = {};
    if (audioEngine) {
      for (const lane of lanes) {
        const presetId = audioEngine.getCurrentPreset(lane.id);
        const preset = getPreset(lane.category, presetId);
        if (preset?.type !== 'metal' && preset?.type !== 'cymbal') continue;
        const settings = audioEngine.getSettings(lane.id);
        const frequency = settings.frequency ?? preset.defaults.frequency;
        if (typeof frequency === 'number') frequencies[lane.id] = frequency;
      }
    }

    downloadMidi(
      {
        lanes,
        grid,
        bpm,
        resolution,
        bars,
        accents,
        subGrid,
        subPresets,
        swing,
        name: 'BeatBayashi',
        rightsText: CONTENT_RIGHTS_LINE,
        ...(audioEngine
          ? { presets: Object.fromEntries(lanes.map((l) => [l.id, audioEngine.getCurrentPreset(l.id)])) }
          : {}),
        ...(Object.keys(frequencies).length > 0 ? { frequencies } : {}),
      },
      `beatbayashi-${Date.now()}.mid`
    );
  };

  // MIDI carries the notes but not the sound. This writes down the synthesis
  // settings so the pattern can be rebuilt on any synth, not just this app.
  const exportSoundRecipe = () => {
    if (!audioEngine) {
      alert('Audio engine not ready — click anywhere first to start audio.');
      return;
    }

    const recipe = buildSoundRecipe(audioEngine, lanes, new Date().toISOString());
    const blob = new Blob([JSON.stringify(recipe, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beatbayashi-sound-recipe-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * An SFZ instrument: the .sfz definition plus one rendered WAV per voice.
   *
   * SFZ is a sampler format - every region names an audio file - so the only
   * honest way to export one from a synthesis-only app is to render the voices
   * first. Each drum is rendered offline as a one-shot, encoded as a real WAV,
   * and zipped with the definition. The samples are still not recordings of
   * anything: they are this app's own synthesis, captured.
   */
  const exportSFZ = async () => {
    if (!audioEngine) {
      alert('Audio engine not ready');
      return;
    }

    setExporting(true);
    try {
      const entries: ZipEntry[] = [];
      const regions: SfzRegion[] = [];
      // A second lane in the same category (e.g. kick-2) shares kick's GM
      // note by default, which would make both regions answer to the same
      // key. Keep every used key unique by moving a later collision to the
      // next free MIDI note.
      const usedKeys = new Set<number>();
      const nextFreeKey = (preferred: number): number => {
        let key = preferred;
        while (usedKeys.has(key) && key < 127) key++;
        usedKeys.add(key);
        return key;
      };

      for (const lane of lanes) {
        const rendered = await audioEngine.renderOneShot(lane.id);
        if (!rendered) continue;

        const file = `${lane.id}.wav`;
        entries.push({
          path: `samples/${file}`,
          bytes: encodeWav({ ...rendered, metadata: WAV_PROVENANCE }),
        });
        regions.push({
          sample: file,
          key: nextFreeKey(GM_DRUM_NOTES[lane.category]),
          label: lane.label,
          technique: getPreset(lane.category, audioEngine.getCurrentPreset(lane.id))?.name,
        });
      }

      if (regions.length === 0) {
        alert('Nothing to export: no voice could be rendered.');
        return;
      }

      const sfz = buildSfz({
        name: 'BeatBayashi kit',
        regions,
        generatedAt: new Date().toISOString(),
      });
      entries.unshift({
        path: 'beatbayashi-kit.sfz',
        bytes: new TextEncoder().encode(sfz),
      });

      const zip = createZip(entries);
      // .slice() hands Blob a plain ArrayBuffer; a Uint8Array can in principle
      // be backed by a SharedArrayBuffer, which Blob will not take.
      const url = URL.createObjectURL(
        new Blob([zip.slice().buffer as ArrayBuffer], { type: 'application/zip' })
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `beatbayashi-kit-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('SFZ export failed:', error);
      alert('SFZ export failed: ' + String(error));
    } finally {
      setExporting(false);
    }
  };

  /**
   * The pattern, as audio.
   *
   * Rendered offline, not recorded. Recording through MediaRecorder took as
   * long as the pattern plays, produced whatever codec the browser preferred,
   * and in a headless browser handed back an empty file - which the export
   * then tried, and failed, to turn into a WAV.
   */
  const exportWAV = async () => {
    if (!audioEngine) {
      alert('Audio engine not ready');
      return;
    }

    setExporting(true);
    try {
      const rendered = await audioEngine.renderPattern({
        lanes,
        grid,
        subGrid,
        bars,
        resolution,
        bpm,
        accents,
        swing,
      });
      if (!rendered) {
        alert('Nothing to export: the pattern could not be rendered.');
        return;
      }

      const bytes = encodeWav({ ...rendered, metadata: WAV_PROVENANCE });
      const url = URL.createObjectURL(
        new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'audio/wav' })
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `beatbayashi-${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);

      onClose();
    } catch (error) {
      console.error('WAV export failed:', error);
      alert('WAV export failed: ' + String(error));
    } finally {
      setExporting(false);
    }
  };

  return (
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
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        style={{
          backgroundColor: 'var(--app-panel, #1a1a1a)',
          color: 'var(--app-text, #fff)',
          padding: '30px',
          borderRadius: '8px',
          border: '2px solid var(--app-accent, #0f8a80)',
          maxWidth: '400px',
          width: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={TITLE_ID} style={{ marginTop: 0, marginBottom: '10px', color: 'var(--app-accent, #0f8a80)' }}>
          <IconLabel icon="download">Export Your Work</IconLabel>
        </h2>
        <p style={{ color: 'var(--app-muted, #999)', fontSize: fsPx(13), lineHeight: '1.5' }}>
          Everything you create is yours to keep, publish, and sell.
          No attribution needed.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
          <button
            onClick={exportMIDI}
            disabled={exporting}
            style={{
              padding: '12px',
              backgroundColor: exporting ? 'var(--app-muted, #555)' : 'var(--app-accent, #0f8a80)',
              color: 'var(--app-on-accent, #000)',
              border: 'none',
              borderRadius: '4px',
              cursor: exporting ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: fsPx(14),
            }}
          >
            <IconLabel icon="keys">Export as MIDI — opens in any DAW</IconLabel>
          </button>

          <button
            onClick={exportJSON}
            disabled={exporting}
            style={{
              padding: '12px',
              backgroundColor: exporting ? 'var(--app-muted, #555)' : 'var(--app-accent, #0f8a80)',
              color: 'var(--app-on-accent, #000)',
              border: 'none',
              borderRadius: '4px',
              cursor: exporting ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: fsPx(14),
            }}
          >
            <IconLabel icon="document">Export as JSON</IconLabel>
          </button>

          <button
            onClick={exportWAV}
            disabled={exporting || !audioEngine}
            title={!audioEngine ? 'Audio not ready' : undefined}
            style={{
              padding: '12px',
              backgroundColor: exporting || !audioEngine ? 'var(--app-muted, #555)' : 'var(--app-accent, #0f8a80)',
              color: 'var(--app-on-accent, #000)',
              border: 'none',
              borderRadius: '4px',
              cursor: exporting || !audioEngine ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: fsPx(14),
            }}
          >
            {exporting ? (
              <IconLabel icon="hourglass">Rendering…</IconLabel>
            ) : (
              <IconLabel icon="wave">Export as WAV</IconLabel>
            )}
          </button>

          <button
            onClick={exportSFZ}
            disabled={exporting || !audioEngine}
            title={
              !audioEngine
                ? 'Audio not ready'
                : 'A sampler instrument: each drum rendered as a one-shot WAV, plus the .sfz that maps them'
            }
            style={{
              padding: '12px',
              backgroundColor: exporting || !audioEngine ? 'var(--app-muted, #555)' : 'var(--app-control, #2a2a2a)',
              color: exporting || !audioEngine ? 'var(--app-muted, #999)' : 'var(--app-muted, #ddd)',
              border: '1px solid var(--app-accent, #0f8a80)',
              borderRadius: '4px',
              cursor: exporting || !audioEngine ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: fsPx(14),
            }}
          >
            <IconLabel icon="drum" accent="var(--app-accent, #0f8a80)">Export as SFZ instrument (.zip)</IconLabel>
          </button>

          <button
            onClick={exportSoundRecipe}
            disabled={exporting || !audioEngine}
            title={
              !audioEngine
                ? 'Audio not ready'
                : 'The synthesis settings behind each drum, so you can rebuild this sound on your own synth'
            }
            style={{
              padding: '12px',
              backgroundColor: exporting || !audioEngine ? 'var(--app-muted, #555)' : 'var(--app-accent, #0f8a80)',
              color: 'var(--app-on-accent, #000)',
              border: 'none',
              borderRadius: '4px',
              cursor: exporting || !audioEngine ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: fsPx(14),
            }}
          >
            <IconLabel icon="sliders">Export sound recipe — rebuild this sound anywhere</IconLabel>
          </button>
        </div>

        <p style={{ color: 'var(--app-muted, #666)', fontSize: fsPx(12), marginTop: '16px', marginBottom: 0, lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--app-muted, #999)' }}>MIDI</strong> drops straight into Cubase,
          Studio One, Ableton, Logic or Reaper on the General MIDI drum map, at this
          tempo. <strong style={{ color: 'var(--app-muted, #999)' }}>WAV</strong> renders one playthrough
          as audio, at a fixed export level rather than the live volume.{' '}
          <strong style={{ color: 'var(--app-muted, #999)' }}>JSON</strong> saves the pattern — there is
          no way to load it back into this app yet.
        </p>

        <button
          onClick={onClose}
          disabled={exporting}
          style={{
            marginTop: '20px',
            width: '100%',
            padding: '10px',
            backgroundColor: 'var(--app-panel-alt, #222)',
            color: 'var(--app-muted, #ddd)',
            border: '1px solid var(--app-border-strong, #444)',
            borderRadius: '4px',
            cursor: exporting ? 'not-allowed' : 'pointer',
            fontSize: fsPx(14),
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};
