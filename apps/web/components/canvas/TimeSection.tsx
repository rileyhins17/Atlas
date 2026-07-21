'use client';

import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { CanvasSection, DayFlavor } from '@/lib/canvas';
import { formatClock } from '@/lib/dates';

function spanLabel(s: CanvasSection): string {
  const end = s.end.getHours() === 0 && s.end.getMinutes() === 0 ? 'midnight' : formatClock(s.end);
  const start =
    s.start.getHours() === 0 && s.start.getMinutes() === 0 ? 'midnight' : formatClock(s.start);
  return `${start} – ${end}`;
}

/**
 * One time section of the Day Canvas: a routine block (kind-tinted wash) or an
 * Open gap. Open gaps on today/future days are tappable — "plan this window".
 * Sized by content, never by wall-clock scale (see design doc §3.1).
 */
export function TimeSection({
  section,
  flavor,
  onPlanGap,
  children,
}: {
  section: CanvasSection;
  flavor: DayFlavor;
  onPlanGap?: (section: CanvasSection) => void;
  children?: ReactNode;
}) {
  const plannable = section.kind === 'open' && flavor !== 'past' && onPlanGap;
  const kindClass =
    section.kind === 'routine' ? `canvas-kind-${section.routineKind ?? 'custom'}` : 'canvas-kind-open';

  return (
    <section
      className={`canvas-sec ${kindClass} ${flavor === 'past' ? 'is-past' : ''} ${section.isNow ? 'is-now' : ''}`}
      aria-label={`${section.label}, ${spanLabel(section)}`}
    >
      <header className="canvas-sec-head">
        <span className="canvas-sec-label">{section.label}</span>
        <span className="canvas-sec-span">{spanLabel(section)}</span>
        {section.isNow && section.kind === 'routine' && (
          <span className="canvas-sec-nowchip">now · until {formatClock(section.end)}</span>
        )}
        {plannable && (
          <button
            type="button"
            className="canvas-plan-btn"
            onClick={() => onPlanGap(section)}
            aria-label={`Plan ${spanLabel(section)}`}
          >
            <Plus size={13} aria-hidden /> Plan
          </button>
        )}
      </header>
      {children}
    </section>
  );
}
