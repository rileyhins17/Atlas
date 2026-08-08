'use client';

import Link from 'next/link';
import { Sparkles, Sun } from 'lucide-react';
import type { DayOverview } from '@/lib/canvas';
import { formatClock } from '@/lib/dates';

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * The windows still open today, and the one button that fills them.
 *
 * This is the answer to "the timeline says I'm free when I'm at work": free
 * time is computed from the routine, so work, school and sleep are never
 * offered here. If this block looks wrong, the routine is wrong — hence the
 * link straight to the editor rather than a dead end.
 */
export function FreeTime({
  overview,
  onPlan,
  onPlanDay,
  planning,
}: {
  overview: DayOverview;
  /** Fill one window — opens capture with that time window attached. */
  onPlan: (gap: { start: Date; end: Date }) => void;
  /** Ask Atlas to propose what goes where. */
  onPlanDay?: () => void;
  planning?: boolean;
}) {
  const { gaps } = overview;
  if (gaps.length === 0) return null;

  const total = gaps.reduce((sum, g) => sum + g.minutes, 0);

  return (
    <section className="ov-block freetime" aria-label="Free time">
      <header className="freetime-head">
        <h2 className="ov-title">
          <Sun size={14} aria-hidden /> Free time
        </h2>
        <span className="freetime-total">{duration(total)} left today</span>
      </header>

      <div className="freetime-gaps">
        {gaps.map((g) => (
          <button
            key={g.start.toISOString()}
            type="button"
            className="freetime-gap"
            onClick={() => onPlan(g)}
          >
            <span className="freetime-gap-when">
              {formatClock(g.start)} – {formatClock(g.end)}
            </span>
            <span className="freetime-gap-len">{duration(g.minutes)}</span>
          </button>
        ))}
      </div>

      {/* One footer row: the action and the escape hatch, rather than a filled
          button and a bare underlined link stacked as two separate afterthoughts.
          If this block is wrong, the routine is wrong — so send people straight
          to the fix instead of leaving them to work out where it lives. */}
      <div className="freetime-foot">
        {onPlanDay && (
          <button type="button" className="freetime-plan" onClick={onPlanDay} disabled={planning}>
            <Sparkles size={14} aria-hidden />
            {planning ? 'Working out your day…' : 'Plan my day'}
          </button>
        )}
        <Link href="/settings#routine" className="freetime-fix">
          Wrong? Fix your work &amp; sleep hours
        </Link>
      </div>
    </section>
  );
}
