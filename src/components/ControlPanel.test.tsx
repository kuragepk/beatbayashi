// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// ISSUE-BEATBOX-023: a failed audio initialization used to leave the
// transport button stuck on "Initialising..." forever with no way out. This
// checks the fallback UI (error text + Retry button) that App.tsx renders
// in its place, and that Retry re-invokes the callback the caller passed.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ControlPanel } from './ControlPanel';
import {
  MAX_MASTER_DB,
  MAX_VOLUME_PERCENT,
  NORMAL_MASTER_DB,
  percentToDb,
} from '../store/masterVolume';
import { useSequencerStore } from '../store/sequencerStore';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ControlPanel — audio init failure UI', () => {
  it('shows "Audio initialization failed" and a Retry button instead of the transport button', () => {
    render(
      <ControlPanel
        audioEngine={null}
        audioError="mock audio init failure"
        onRetryAudio={vi.fn()}
        onSoundChange={() => {}}
      />,
    );

    expect(screen.getByText('Audio initialization failed')).toBeTruthy();
    expect(screen.queryByText(/Initialising/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('calls onRetryAudio when Retry is clicked', () => {
    const onRetryAudio = vi.fn();
    render(
      <ControlPanel
        audioEngine={null}
        audioError="mock audio init failure"
        onRetryAudio={onRetryAudio}
        onSoundChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryAudio).toHaveBeenCalledTimes(1);
  });

  it('shows an enabled Play button, not "Initialising...", when there is no error and no engine yet', () => {
    render(
      <ControlPanel
        audioEngine={null}
        audioError={null}
        onEnsureAudio={vi.fn(async () => true)}
        onSoundChange={() => {}}
      />,
    );

    const play = screen.getByRole('button', { name: 'PLAY' }) as HTMLButtonElement;
    expect(play.disabled).toBe(false);
    // aria-label and title say the same thing as the visible label.
    expect(play.title).toBe('PLAY');
    expect(play.textContent).toContain('PLAY');
    expect(screen.queryByText(/Initialising/)).toBeNull();
    expect(screen.queryByText('Audio initialization failed')).toBeNull();
  });

  it('without an engine, Play asks for one and starts playback only if it is ready', async () => {
    useSequencerStore.setState({ isPlaying: false });
    const onEnsureAudio = vi.fn(async () => false);
    render(
      <ControlPanel audioEngine={null} onEnsureAudio={onEnsureAudio} onSoundChange={() => {}} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'PLAY' }));
    });
    expect(onEnsureAudio).toHaveBeenCalledTimes(1);
    expect(useSequencerStore.getState().isPlaying).toBe(false);

    onEnsureAudio.mockResolvedValue(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'PLAY' }));
    });
    expect(onEnsureAudio).toHaveBeenCalledTimes(2);
    expect(useSequencerStore.getState().isPlaying).toBe(true);
    useSequencerStore.setState({ isPlaying: false });
  });
});

// Owner request 2026-10-05: the master volume is shown in percent, 100% is
// normal and 120% the maximum (mapping in ../store/masterVolume.ts), with a
// mute toggle.
describe('ControlPanel - master volume (percent, 100% normal, max 120%)', () => {
  beforeEach(() => {
    localStorage.clear();
    useSequencerStore.setState({ masterDb: NORMAL_MASTER_DB });
  });

  function renderPanel(audioEngine: { setMasterDb: (db: number) => void } | null = null) {
    return render(
      <ControlPanel
        audioEngine={audioEngine as never}
        audioError={null}
        onSoundChange={() => {}}
      />,
    );
  }

  it('the slider is a native <input type=range> 0..120 with a label and a % aria-valuetext', () => {
    renderPanel();
    const slider = document.getElementById('master-volume-slider') as HTMLInputElement;
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe(String(MAX_VOLUME_PERCENT));
    expect(slider.getAttribute('aria-valuetext')).toBe('100%');
    expect(document.querySelector('label[for="master-volume-slider"]')?.textContent).toBe('Master volume');
    // The value is a typed box next to the slider (owner 2026-10-06).
    const box = screen.getByRole('spinbutton', { name: 'Master volume' }) as HTMLInputElement;
    expect(box.value).toBe('100');
  });

  it('defaults to 100%', () => {
    renderPanel();
    const slider = document.getElementById('master-volume-slider') as HTMLInputElement;
    expect(Number(slider.value)).toBe(100);
  });

  it('moving the slider to 50% sets -6.02 dB in the store and the engine', () => {
    const setMasterDb = vi.fn();
    renderPanel({ setMasterDb });
    const slider = document.getElementById('master-volume-slider') as HTMLInputElement;

    fireEvent.change(slider, { target: { value: '50' } });

    expect(useSequencerStore.getState().masterDb).toBeCloseTo(percentToDb(50), 6);
    expect(setMasterDb).toHaveBeenCalledWith(percentToDb(50));
    expect(slider.getAttribute('aria-valuetext')).toBe('50%');
  });

  it('120% is the top: the store never goes above MAX_MASTER_DB', () => {
    renderPanel({ setMasterDb: vi.fn() });
    const slider = document.getElementById('master-volume-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '120' } });
    expect(useSequencerStore.getState().masterDb).toBeCloseTo(MAX_MASTER_DB, 6);
    useSequencerStore.getState().setMasterDb(6);
    expect(useSequencerStore.getState().masterDb).toBe(MAX_MASTER_DB);
  });

  it('Mute disables the slider and shows "Muted"; Unmute restores the prior level', () => {
    const setMasterDb = vi.fn();
    renderPanel({ setMasterDb });
    const slider = document.getElementById('master-volume-slider') as HTMLInputElement;
    const before = useSequencerStore.getState().masterDb;

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(slider.disabled).toBe(true);
    expect(slider.getAttribute('aria-valuetext')).toMatch(/Muted/);

    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(slider.disabled).toBe(false);
    expect(useSequencerStore.getState().masterDb).toBe(before);
  });
});
