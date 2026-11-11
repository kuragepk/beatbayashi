// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0

import { AlignedIconLabel } from './LabelIcon';
import React, { useEffect, useId, useRef, useState } from 'react';
import { PixelIcon, type PixelIconName } from '../pixel-icons';
import { fsPx } from '../theme/themeStore';
import { useT } from '../i18n/i18n';

/** Clamps to min..max and snaps to the step grid that starts at min. */
export function clampToStep(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min;
  const snapped = min + Math.round((value - min) / step) * step;
  // Round off float noise (0.1 + 0.2) at the step's own precision.
  const digits = Math.max(0, (String(step).split('.')[1] ?? '').length);
  const fixed = Number(snapped.toFixed(digits));
  return Math.min(max, Math.max(min, fixed));
}

/** Parses what was typed; null when it is not a number. A comma decimal
 *  separator is accepted, so "0,5" works in locales that write it so. */
export function parseTyped(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
}

export const HOLD_DELAY_MS = 400;
export const HOLD_REPEAT_MS = 80;

/**
 * A 24 px step button that repeats while held (owner 2026-10-06: for people
 * who find dragging a slider hard). One step per click; after HOLD_DELAY_MS
 * of holding it repeats every HOLD_REPEAT_MS; it stops on release, leave,
 * cancel or blur. Shift = 10 steps.
 */
export const StepButton: React.FC<{
  direction: -1 | 1;
  label: string;
  disabled?: boolean;
  onStep: (steps: number) => void;
}> = ({ direction, label, disabled = false, onStep }) => {
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({});
  const pointerStarted = useRef(false);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  const stop = () => {
    if (timers.current.delay) clearTimeout(timers.current.delay);
    if (timers.current.repeat) clearInterval(timers.current.repeat);
    timers.current = {};
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-testid={direction < 0 ? 'step-down' : 'step-up'}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        pointerStarted.current = true;
        const steps = direction * (e.shiftKey ? 10 : 1);
        onStepRef.current(steps);
        stop();
        timers.current.delay = setTimeout(() => {
          timers.current.repeat = setInterval(() => onStepRef.current(steps), HOLD_REPEAT_MS);
        }, HOLD_DELAY_MS);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onClick={(e) => {
        // A pointer press already stepped; a keyboard Enter/Space click did not.
        if (pointerStarted.current) {
          pointerStarted.current = false;
          return;
        }
        onStepRef.current(direction * (e.shiftKey ? 10 : 1));
      }}
      style={{
        flex: '0 0 auto',
        minWidth: 24,
        minHeight: 24,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--app-control, #2a2a2a)',
        color: 'var(--app-muted, #ddd)',
        border: '1px solid var(--app-border-strong, #3d3d3d)',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        touchAction: 'manipulation',
      }}
    >
      <PixelIcon name={direction < 0 ? 'arrow-left' : 'arrow-right'} />
    </button>
  );
};

/**
 * A typed number box: commits on Enter or blur, Escape puts the last value
 * back, and anything that is not a number shows the previous value again.
 */
export const NumberBox: React.FC<{
  value: number;
  min: number;
  max: number;
  step: number;
  digits: number;
  label: string;
  disabled?: boolean;
  id?: string;
  onCommit: (value: number) => void;
}> = ({ value, min, max, step, digits, label, disabled = false, id, onCommit }) => {
  const shown = value.toFixed(digits);
  const [draft, setDraft] = useState(shown);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(shown);
  }, [shown]);

  const commit = () => {
    editing.current = false;
    const typed = parseTyped(draft);
    if (typed === null) {
      setDraft(shown);
      return;
    }
    const next = clampToStep(typed, min, max, step);
    setDraft(next.toFixed(digits));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      role="spinbutton"
      data-testid="number-box"
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(e) => {
        editing.current = true;
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          editing.current = false;
          setDraft(shown);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const steps = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
          editing.current = false;
          onCommit(clampToStep(value + steps * step, min, max, step));
        }
      }}
      style={{
        flex: '0 0 auto',
        width: `${Math.max(3, String(Math.round(max)).length + digits + (min < 0 ? 2 : 1))}em`,
        minWidth: 0,
        minHeight: 24,
        boxSizing: 'border-box',
        padding: '1px 4px',
        fontSize: fsPx(12),
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'end',
        backgroundColor: 'var(--app-control, #2a2a2a)',
        color: 'var(--app-text, #fff)',
        border: '1px solid var(--app-border-strong, #3d3d3d)',
        borderRadius: 4,
      }}
    />
  );
};

/**
 * Slider, then ◀ ▶, then a typed number box, then the unit (owner
 * 2026-10-06, one order everywhere). The label sits tight above. The range
 * also takes PageUp/PageDown (10 steps) and Home/End (min/max).
 */
export const SliderField: React.FC<{
  label: React.ReactNode;
  /** Decorative mark before the label. */
  icon?: PixelIconName;
  /** Plain-text name for aria-labels ("Decrease <name>"). */
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  digits?: number;
  unit?: string;
  disabled?: boolean;
  /** Extra controls after the unit (for example a Mute button). */
  trailing?: React.ReactNode;
  title?: string;
  labelColor?: string;
  onChange: (value: number) => void;
  /** Called once a change is finished (slider released, box committed, step). */
  onCommitted?: () => void;
  testId?: string;
  /** Fixed id for the range input (default: generated). */
  rangeId?: string;
  /** Overrides the range's aria-valuetext (e.g. "Muted"). */
  valueText?: string;
}> = ({
  label,
  icon,
  name,
  value,
  min,
  max,
  step,
  digits = 0,
  unit,
  disabled = false,
  trailing,
  title,
  labelColor,
  onChange,
  onCommitted,
  testId,
  rangeId,
  valueText,
}) => {
  const t = useT();
  const generated = useId();
  const id = rangeId ?? `${generated}-range`;
  // Latest value, updated as soon as a change is sent: a held ◀ ▶ can fire
  // again before React has re-rendered with the new value.
  const valueRef = useRef(value);
  valueRef.current = value;
  const set = (next: number) => {
    const clamped = clampToStep(next, min, max, step);
    if (clamped !== valueRef.current) {
      valueRef.current = clamped;
      onChange(clamped);
    }
  };
  const stepBy = (steps: number) => {
    set(valueRef.current + steps * step);
    onCommitted?.();
  };

  return (
    <div data-testid={testId} style={{ minWidth: 0 }}>
      <label
        htmlFor={id}
        style={{
          display: 'block',
          marginBottom: 1,
          fontSize: fsPx(12),
          fontWeight: 600,
          color: labelColor ?? 'var(--app-text, #ffffff)',
          overflowWrap: 'anywhere',
        }}
      >
        {icon ? <AlignedIconLabel icon={icon}>{label}</AlignedIconLabel> : label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', minWidth: 0 }}>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          title={title}
          aria-valuetext={
            valueText ?? `${value.toFixed(digits)}${unit ? (unit === '%' ? '%' : ` ${unit}`) : ''}`
          }
          onChange={(e) => set(parseFloat(e.target.value))}
          onPointerUp={() => onCommitted?.()}
          onKeyDown={(e) => {
            const big = 10 * step;
            let next: number | null = null;
            if (e.key === 'PageUp') next = value + big;
            else if (e.key === 'PageDown') next = value - big;
            else if (e.key === 'Home') next = min;
            else if (e.key === 'End') next = max;
            if (next !== null) {
              e.preventDefault();
              set(next);
              onCommitted?.();
            }
          }}
          style={{ flex: `1 1 ${fsPx(90)}`, minWidth: 0, accentColor: 'var(--app-accent, #0f8a80)' }}
        />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flex: '0 0 auto' }}>
          <StepButton
            direction={-1}
            label={t('decrease', { name })}
            disabled={disabled || value <= min}
            onStep={stepBy}
          />
          <StepButton
            direction={1}
            label={t('increase', { name })}
            disabled={disabled || value >= max}
            onStep={stepBy}
          />
          <NumberBox
            value={value}
            min={min}
            max={max}
            step={step}
            digits={digits}
            label={name}
            disabled={disabled}
            onCommit={(v) => {
              onChange(v);
              onCommitted?.();
            }}
          />
          {unit && (
            <span style={{ fontSize: fsPx(11), color: 'var(--app-muted, #aaa)', whiteSpace: 'nowrap' }}>
              {unit}
            </span>
          )}
          {trailing}
        </span>
      </div>
    </div>
  );
};
