'use client';

import { Check } from 'lucide-react';
import { applyUiStyle, useUiStyle, type UiStyle } from '@/lib/theme/style';

const STYLES: { id: UiStyle; name: string; hint: string }[] = [
  {
    id: 'soft',
    name: 'Soft',
    hint: 'Rounded, warm and calm. Your plan, habits, check-ins and training on one screen.',
  },
  {
    id: 'classic',
    name: 'Classic',
    hint: 'Your whole day at once, hour by hour. Built for planning.',
  },
];

/**
 * Pick the app's style — see lib/theme/style.ts.
 *
 * Applied on tap, like the palette, because a look is judged by looking at it.
 */
export function StyleSettingsCard() {
  const style = useUiStyle();
  if (!style) return null;

  return (
    <ul className="pal-grid sty-grid" role="radiogroup" aria-label="Style">
      {STYLES.map((s) => {
        const active = s.id === style;
        return (
          <li key={s.id}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              className={`pal-card ${active ? 'on' : ''}`}
              onClick={() => applyUiStyle(s.id)}
            >
              <span className="pal-text">
                <span className="pal-name">
                  {s.name}
                  {active && <Check size={14} className="pal-check" aria-hidden />}
                </span>
                <span className="pal-hint">{s.hint}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
