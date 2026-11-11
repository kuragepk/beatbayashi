// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Owner requests 2026-10-06: typed number boxes next to sliders, and
// ◀ ▶ step buttons that repeat while held.
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  HOLD_DELAY_MS,
  HOLD_REPEAT_MS,
  SliderField,
  clampToStep,
  parseTyped,
} from './SliderField';
import { useLanguageStore } from '../i18n/i18n';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  act(() => useLanguageStore.setState({ language: 'en' }));
});

function Harness({ initial = 50, onChange }: { initial?: number; onChange?: (v: number) => void }) {
  const [v, setV] = useState(initial);
  return (
    <SliderField
      label="Swing"
      name="Swing"
      value={v}
      min={0}
      max={75}
      step={1}
      unit="%"
      onChange={(n) => {
        setV(n);
        onChange?.(n);
      }}
    />
  );
}

const box = () => screen.getByRole('spinbutton', { name: 'Swing' }) as HTMLInputElement;
const range = () => screen.getByRole('slider') as HTMLInputElement;

describe('clampToStep / parseTyped', () => {
  it('clamps to the range and snaps to the step', () => {
    expect(clampToStep(80, 0, 75, 1)).toBe(75);
    expect(clampToStep(-3, 0, 75, 1)).toBe(0);
    expect(clampToStep(0.27, 0, 1, 0.05)).toBe(0.25);
    expect(clampToStep(-23.7, -24, 6, 0.5)).toBe(-23.5);
    expect(clampToStep(NaN, 0, 10, 1)).toBe(0);
  });
  it('reads typed numbers, comma decimals too, and rejects the rest', () => {
    expect(parseTyped(' 12 ')).toBe(12);
    expect(parseTyped('0,5')).toBe(0.5);
    expect(parseTyped('abc')).toBeNull();
    expect(parseTyped('')).toBeNull();
  });
});

describe('SliderField number box', () => {
  it('stays in sync with the slider both ways', () => {
    render(<Harness />);
    fireEvent.change(range(), { target: { value: '30' } });
    expect(box().value).toBe('30');
    fireEvent.change(box(), { target: { value: '12' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(range().value).toBe('12');
  });

  it('clamps a typed value on blur', () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: '500' } });
    fireEvent.blur(box());
    expect(box().value).toBe('75');
    expect(range().value).toBe('75');
  });

  it('Escape puts the previous value back; invalid input shows it again', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(box(), { target: { value: '9' } });
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(box().value).toBe('50');
    fireEvent.change(box(), { target: { value: 'loud' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(box().value).toBe('50');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes min/max to assistive tech', () => {
    render(<Harness />);
    expect(box().getAttribute('aria-valuemin')).toBe('0');
    expect(box().getAttribute('aria-valuemax')).toBe('75');
  });
});

describe('SliderField keys on the slider', () => {
  it('PageUp/PageDown move ten steps, Home/End go to the ends', () => {
    render(<Harness />);
    fireEvent.keyDown(range(), { key: 'PageUp' });
    expect(box().value).toBe('60');
    fireEvent.keyDown(range(), { key: 'PageDown' });
    fireEvent.keyDown(range(), { key: 'PageDown' });
    expect(box().value).toBe('40');
    fireEvent.keyDown(range(), { key: 'End' });
    expect(box().value).toBe('75');
    fireEvent.keyDown(range(), { key: 'Home' });
    expect(box().value).toBe('0');
  });
});

describe('SliderField step buttons', () => {
  it('have localized labels', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Decrease Swing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Increase Swing' })).toBeTruthy();
    cleanup();
    act(() => useLanguageStore.setState({ language: 'ja' }));
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Swingを上げる' })).toBeTruthy();
  });

  it('one click is one step; Shift+click is ten; keyboard click works', () => {
    render(<Harness />);
    const up = screen.getByRole('button', { name: 'Increase Swing' });
    fireEvent.pointerDown(up, { button: 0 });
    fireEvent.pointerUp(up);
    fireEvent.click(up);
    expect(box().value).toBe('51');
    fireEvent.pointerDown(up, { button: 0, shiftKey: true });
    fireEvent.pointerUp(up);
    fireEvent.click(up);
    expect(box().value).toBe('61');
    fireEvent.click(up); // keyboard Enter/Space arrives as a click alone
    expect(box().value).toBe('62');
  });

  it('repeats while held and stops on release', () => {
    vi.useFakeTimers();
    render(<Harness initial={10} />);
    const down = screen.getByRole('button', { name: 'Decrease Swing' });
    fireEvent.pointerDown(down, { button: 0 });
    expect(box().value).toBe('9');
    act(() => {
      vi.advanceTimersByTime(HOLD_DELAY_MS + HOLD_REPEAT_MS * 3 + 1);
    });
    expect(box().value).toBe('6');
    fireEvent.pointerUp(down);
    act(() => {
      vi.advanceTimersByTime(HOLD_REPEAT_MS * 10);
    });
    expect(box().value).toBe('6');
  });

  it('stops repeating when the pointer leaves', () => {
    vi.useFakeTimers();
    render(<Harness initial={10} />);
    const up = screen.getByRole('button', { name: 'Increase Swing' });
    fireEvent.pointerDown(up, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_DELAY_MS + HOLD_REPEAT_MS + 1);
    });
    fireEvent.pointerLeave(up);
    const after = box().value;
    act(() => {
      vi.advanceTimersByTime(HOLD_REPEAT_MS * 10);
    });
    expect(box().value).toBe(after);
  });
});
