// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// ISSUE-BEATBOX-016: exportMIDI must pass each lane's current preset id
// through to downloadMidi (audit finding 5 — without it, the ride/clap GM
// note map in export/midi.ts is unreachable from the UI). exportJSON must
// carry lanes/accents/swing/version (finding 11) and the panel's own text
// must no longer promise a "reload here later" that does not exist.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ExportPanel } from './ExportPanel';
import { useSequencerStore } from '../store/sequencerStore';
import type { AudioEngine } from '../audio/AudioEngine';
import type { RenderedAudio } from '../audio/AudioEngine';

const { downloadMidi, buildSfz } = vi.hoisted(() => ({
  downloadMidi: vi.fn(),
  buildSfz: vi.fn(() => ''),
}));

vi.mock('../export/midi', async () => {
  const actual = await vi.importActual<typeof import('../export/midi')>('../export/midi');
  return { ...actual, downloadMidi };
});

vi.mock('../export/sfz', async () => {
  const actual = await vi.importActual<typeof import('../export/sfz')>('../export/sfz');
  return { ...actual, buildSfz };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useSequencerStore.setState({
    lanes: useSequencerStore.getState().lanes.map((lane) =>
      lane.id === 'cymbal' ? { ...lane, muted: false, solo: false } : lane
    ),
  });
});

function fakeEngine(
  presetByLane: Record<string, string>,
  settingsByLane: Record<string, Record<string, number>> = {}
): AudioEngine {
  return {
    getCurrentPreset: (laneId: string) => presetByLane[laneId] ?? '',
    getSettings: (laneId: string) => settingsByLane[laneId] ?? {},
  } as unknown as AudioEngine;
}

describe('exportMIDI wiring (ISSUE-BEATBOX-016, finding 5)', () => {
  it('passes each lane\'s current preset id to downloadMidi', () => {
    const engine = fakeEngine({ cymbal: 'metal_ride' });
    render(<ExportPanel audioEngine={engine} onClose={() => {}} />);

    screen.getByText(/Export as MIDI/).click();

    expect(downloadMidi).toHaveBeenCalledTimes(1);
    const [options] = downloadMidi.mock.calls[0];
    expect(options.presets).toBeDefined();
    expect(options.presets.cymbal).toBe('metal_ride');
  });

  it('omits presets when no audio engine is ready', () => {
    render(<ExportPanel audioEngine={null} onClose={() => {}} />);

    screen.getByText(/Export as MIDI/).click();

    expect(downloadMidi).toHaveBeenCalledTimes(1);
    const [options] = downloadMidi.mock.calls[0];
    expect(options.presets).toBeUndefined();
  });
});

describe('exportMIDI pitch follows the frequency slider (P2-15)', () => {
  it('passes a metal-preset lane\'s configured frequency through to downloadMidi', () => {
    const engine = fakeEngine(
      { cymbal: 'metal_ride' },
      { cymbal: { frequency: 880 } }
    );
    render(<ExportPanel audioEngine={engine} onClose={() => {}} />);

    screen.getByText(/Export as MIDI/).click();

    const [options] = downloadMidi.mock.calls[0];
    expect(options.frequencies).toBeDefined();
    expect(options.frequencies.cymbal).toBe(880);
  });

  it('falls back to the preset\'s own default frequency when nothing is overridden', () => {
    const engine = fakeEngine({ cymbal: 'metal_ride' }, {});
    render(<ExportPanel audioEngine={engine} onClose={() => {}} />);

    screen.getByText(/Export as MIDI/).click();

    const [options] = downloadMidi.mock.calls[0];
    expect(typeof options.frequencies.cymbal).toBe('number');
  });

  it('does not add a frequency entry for a non-metal preset (e.g. a kick)', () => {
    const engine = fakeEngine({ kick: 'membrane_808' });
    render(<ExportPanel audioEngine={engine} onClose={() => {}} />);

    screen.getByText(/Export as MIDI/).click();

    const [options] = downloadMidi.mock.calls[0];
    expect(options.frequencies?.kick).toBeUndefined();
  });

  it('omits frequencies entirely when no audio engine is ready', () => {
    render(<ExportPanel audioEngine={null} onClose={() => {}} />);

    screen.getByText(/Export as MIDI/).click();

    const [options] = downloadMidi.mock.calls[0];
    expect(options.frequencies).toBeUndefined();
  });
});

describe('exportJSON fields (ISSUE-BEATBOX-016, finding 11)', () => {
  it('includes lanes, accents, swing and a version, and no longer promises a reload', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL =
      createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL =
      revokeObjectURL;

    let capturedBlobText = '';
    const originalBlob = globalThis.Blob;
    class CapturingBlob extends originalBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        capturedBlobText = String(parts[0]);
      }
    }
    globalThis.Blob = CapturingBlob as unknown as typeof Blob;

    render(<ExportPanel audioEngine={null} onClose={() => {}} />);
    screen.getByText(/Export as JSON/).click();

    globalThis.Blob = originalBlob;

    const parsed = JSON.parse(capturedBlobText);
    expect(parsed.version).toBe(3);
    expect(parsed.licence).toBeUndefined();
    expect(parsed.generatorLicence).toBe('MIT-0');
    expect(parsed.contentRights.spdx).toBe('CC0-1.0 OR MIT-0');
    expect(parsed.contentRights.url).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
    expect(Array.isArray(parsed.lanes)).toBe(true);
    expect(parsed.lanes.length).toBeGreaterThan(0);
    expect(parsed.accents).toBeDefined();
    expect(parsed.swing).toBeDefined();
  });

  it('the panel text no longer says the pattern reloads here later', () => {
    render(<ExportPanel audioEngine={null} onClose={() => {}} />);
    expect(screen.queryByText(/reload here later/)).toBeNull();
  });
});

describe('exportSFZ key collisions (ISSUE-BEATBOX-016, finding 12)', () => {
  it('a second kick lane gets a different key than the first', async () => {
    const state = useSequencerStore.getState();
    const kick = state.lanes.find((l) => l.id === 'kick')!;
    useSequencerStore.setState({
      lanes: [...state.lanes, { ...kick, id: 'kick-2', label: 'Kick 2' }],
    });

    const fakeAudio: RenderedAudio = { sampleRate: 44100, channels: [new Float32Array(4)] };
    const engine = {
      renderOneShot: vi.fn(async () => fakeAudio),
      getCurrentPreset: () => 'membrane_808',
    } as unknown as AudioEngine;

    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL =
      createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL =
      revokeObjectURL;

    render(<ExportPanel audioEngine={engine} onClose={() => {}} />);
    screen.getByText(/Export as SFZ/).click();

    // exportSFZ is async (awaits renderOneShot per lane); let its microtasks run.
    await vi.waitFor(() => expect(buildSfz).toHaveBeenCalledTimes(1));

    const call = buildSfz.mock.calls[0] as unknown as [{ regions: { sample: string; key: number }[] }];
    const { regions } = call[0];
    const kickRegion = regions.find((r) => r.sample === 'kick.wav');
    const kick2Region = regions.find((r) => r.sample === 'kick-2.wav');
    expect(kickRegion).toBeDefined();
    expect(kick2Region).toBeDefined();
    expect(kickRegion?.key).not.toBe(kick2Region?.key);
  });
});
