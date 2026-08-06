'use client';

import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { formatDuration } from '@atlas/shared';
import type { CanvasSection, DayFlavor } from '@/lib/canvas';
import { formatClock } from '@/lib/dates';

function clockOrMidnight(d: Date): string {
  return d.getHours() === 0 && d.getMinutes() === 0 ? 'midnight' : formatClock(d);
}

function spanLabel(s: CanvasSection): string {
  return `${clockOrMidnight(s.start)} – ${clockOrMidnight(s.end)}`;
}

/**
 * One block of the day, on a time spine.
 *
 * This used to be a flat stack of same-sized grey slabs: Sleep, Work and a free
 * hour were rendered identically, so a day read as a list of rows rather than
 * as a shape. Three things fix that without inventing wall-clock scaling —
 * which fails badly when a nine-hour sleep would push everything else off the
 * screen:
 *
 *   the RAIL   — start time in tabular figures with a coloured node, so the eye
 *                can run down one column and see the day's rhythm;
 *   COLOUR     — each kind gets its own hue, so sleep, work, training and food
 *                are told apart before a single word is read;
 *   WEIGHT     — a duration chip and a thicker accent on longer blocks, so a
 *                nine-hour stretch reads as bigger than a fifteen-minute one.
 *
 * Open gaps stay deliberately quiet and dashed: they are an invitation, not an
 * event, and on today or a future day they carry the button that fills them.
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
    section.kind === 'routine'
      ? `canvas-kind-${section.routineKind ?? 'custom'}`
      : 'canvas-kind-open';

  const minutes = Math.max(
    0,
    Math.round((section.end.getTime() - section.start.getTime()) / 60_000),
  );
  // Long blocks earn a heavier accent. Three bands, not a continuous scale:
  // the point is a glanceable difference, not a measurement.
  const weight = minutes >= 180 ? 'long' : minutes >= 60 ? 'mid' : 'short';

  return (
    <section
      className={`canvas-sec ${kindClass} w-${weight} ${flavor === 'past' ? 'is-past' : ''} ${
        section.isNow ? 'is-now' : ''
      }`}
      aria-label={`${section.label}, ${spanLabel(section)}`}
    >
      <div className="canvas-rail" aria-hidden>
        <span className="canvas-rail-time">{clockOrMidnight(section.start)}</span>
        <span className="canvas-rail-node" />
      </div>

      <div className="canvas-body">
        <header className="canvas-sec-head">
          <span className="canvas-sec-label">{section.label}</span>
          <span className="canvas-sec-len">{formatDuration(minutes)}</span>
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
      </div>
    </section>
  );
}
