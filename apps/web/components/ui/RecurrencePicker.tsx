'use client';

import { RECURRENCE_PRESETS } from '@atlas/shared';

export interface RecurrencePickerProps {
  /** Current RRULE, or null for a one-off. */
  value: string | null;
  onChange: (rule: string | null) => void;
  label?: string;
}

/**
 * Repeat as a row of taps, never typed. The presets are the rules the engine
 * expands and the ones people actually want; anything more exotic arrives from
 * a calendar sync, is stored verbatim, and is edited on the other end.
 */
export function RecurrencePicker({
  value,
  onChange,
  label = 'Repeat',
}: RecurrencePickerProps) {
  return (
    <div className="repeat-picker" role="group" aria-label={label}>
      <span className="repeat-picker-label">{label}</span>
      {RECURRENCE_PRESETS.map((p) => {
        const on = (p.rule ?? null) === value;
        return (
          <button
            key={p.key}
            type="button"
            className={`repeat-chip ${on ? 'on' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(p.rule ?? null)}
          >
            {p.key === 'none' ? 'Never' : p.label}
          </button>
        );
      })}
    </div>
  );
}
