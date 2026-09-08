'use client';

import { canvasDayTitle } from '@atlas/shared';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { displayTimezone } from '@/lib/dates';

function dayTitle(day: Date, now: Date): string {
  return canvasDayTitle(day, now, displayTimezone());
}

/**
 * Day navigation for the canvas (v1 of time travel — continuous scroll is
 * Phase D). Arrows page one day; tapping the title snaps back to today.
 */
export function DayPager({
  day,
  isToday,
  onPage,
  onToday,
}: {
  day: Date;
  isToday: boolean;
  onPage: (delta: 1 | -1) => void;
  onToday: () => void;
}) {
  return (
    <div className="day-pager">
      <button type="button" className="day-pager-arrow" aria-label="Previous day" onClick={() => onPage(-1)}>
        <ChevronLeft size={18} aria-hidden />
      </button>
      <button
        type="button"
        className={`day-pager-title ${isToday ? 'is-today' : ''}`}
        onClick={onToday}
        title={isToday ? undefined : 'Back to today'}
      >
        {dayTitle(day, new Date())}
      </button>
      <button type="button" className="day-pager-arrow" aria-label="Next day" onClick={() => onPage(1)}>
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  );
}
