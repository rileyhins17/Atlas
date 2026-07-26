'use client';

import { WeightUnitPref } from '@atlas/shared';
import { useSettings, useUpdateSettings } from '@/lib/hooks/settings';
import { Spinner } from '@/components/ui';

const OPTIONS = WeightUnitPref.options;

/**
 * Weight unit. Purely a display preference — every set is stored as integer
 * grams, so switching this re-renders history in the other unit rather than
 * converting (and therefore rounding) anything that was already logged.
 */
export function TrainingSettingsCard() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const current = settings.data?.weightUnit ?? 'lb';

  if (settings.isPending) return <Spinner />;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="prog-muted" style={{ margin: 0, fontSize: 13 }}>
        How weights are shown and typed. Your logged sets are never converted — they are stored
        exactly and displayed in whichever unit you pick.
      </p>
      <div className="cal-scope" role="group" aria-label="Weight unit">
        {OPTIONS.map((unit) => (
          <button
            key={unit}
            type="button"
            className={`cal-scope-btn ${current === unit ? 'on' : ''}`}
            aria-pressed={current === unit}
            disabled={update.isPending}
            onClick={() => current !== unit && update.mutate({ weightUnit: unit })}
          >
            {unit === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}
          </button>
        ))}
      </div>
    </div>
  );
}
