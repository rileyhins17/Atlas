'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EventDTO } from '@atlas/shared';
import { formatClock, localDayKey } from '@/lib/dates';
import { placeDayEvents, visibleHourRange, weekdayShort } from '@/lib/calendar-view';

/** "9 AM" / "14:00", following the locale, without the minutes on the hour. */
function hourLabel(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric' });
}

/**
 * The week, as a shape.
 *
 * "Week" used to be a reverse-chronological agenda grouped by day — which
 * answers "what is next", the question Today already answers, and never
 * answers the only one worth opening seven days for: where is this week
 * packed, where is it empty, and what collides.
 *
 * Two things keep it honest. The visible hour window comes from the week's own
 * events rather than being fixed at midnight–midnight, so an ordinary week does
 * not spend most of its height on empty small hours. And clashing events split
 * the column between them (see `placeDayEvents`) instead of stacking on top of
 * each other, because hiding a double-booking is the one thing a calendar must
 * never do.
 */
export function WeekGrid({
  days,
  events,
  selectedDay,
  onPickDay,
  onOpenEvent,
}: {
  days: Date[];
  events: EventDTO[];
  selectedDay: string;
  onPickDay: (key: string) => void;
  onOpenEvent: (event: EventDTO) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const window = useMemo(() => visibleHourRange(events), [events]);
  const hours = useMemo(
    () => Array.from({ length: window.endHour - window.startHour }, (_, i) => window.startHour + i),
    [window],
  );
  const placed = useMemo(
    () => days.map((d) => placeDayEvents(events, d, window)),
    [days, events, window],
  );

  const todayKey = localDayKey(now);
  const winStart = window.startHour * 60;
  const winSpan = (window.endHour - window.startHour) * 60;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowFraction = (nowMin - winStart) / winSpan;
  const showNow = nowFraction >= 0 && nowFraction <= 1;

  const allDay = useMemo(
    () => days.map((d) => events.filter((e) => e.allDay && localDayKey(new Date(e.startAt)) === localDayKey(d))),
    [days, events],
  );
  const hasAllDay = allDay.some((list) => list.length > 0);

  // Open on the working day, not on whatever hour the window happens to start.
  //
  // The window widens to whatever the week contains, so a single 2am event
  // drags it open to twenty-two rows — and with a fixed row height the grid
  // becomes a thousand pixels of mostly-empty early morning that you have to
  // scroll past before seeing anything. The body scrolls instead, and lands on
  // now (or on 8am for a week that is not this one).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = showNow ? nowFraction : Math.max(0, (8 * 60 - winStart) / winSpan);
    // Put the target a third of the way down rather than at the very top, so
    // there is visible context above it.
    el.scrollTop = Math.max(0, target * el.scrollHeight - el.clientHeight / 3);

    // Sideways too. Seven readable columns do not fit a phone, so the grid
    // scrolls — and left at zero it opens on Monday, which on a Friday means
    // the useful half of the week is off-screen with nothing saying so.
    const dayIndex = days.findIndex((d) => localDayKey(d) === selectedDay);
    if (dayIndex >= 0 && el.scrollWidth > el.clientWidth) {
      const gutter = 52;
      const colWidth = (el.scrollWidth - gutter) / days.length;
      el.scrollLeft = Math.max(
        0,
        gutter + dayIndex * colWidth - (el.clientWidth - colWidth) / 2,
      );
    }
    // Only on a change of week, window or selected day — not every minute, or
    // it would yank the view back while someone is reading another part of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.startHour, window.endHour, days[0]?.getTime(), selectedDay]);

  return (
    <div className="wk" role="group" aria-label="Week grid">
      <div className="wk-scroll" ref={scrollRef}>
        <div className="wk-inner">
          <div className="wk-head">
            <div className="wk-gutter-cell" aria-hidden />
            {days.map((d) => {
              const key = localDayKey(d);
              return (
                <button
                  key={key}
                  type="button"
                  className={`wk-day ${key === selectedDay ? 'on' : ''} ${key === todayKey ? 'is-today' : ''}`}
                  onClick={() => onPickDay(key)}
                  aria-pressed={key === selectedDay}
                >
                  <span className="wk-day-name">{weekdayShort(d)}</span>
                  <span className="wk-day-num">{d.getDate()}</span>
                </button>
              );
            })}
          </div>

          {/* All-day events have no position in an hour grid, so they get their
              own band rather than being forced to the top of the first hour. */}
          {hasAllDay && (
            <div className="wk-allday">
              <div className="wk-gutter-cell" aria-hidden />
              {allDay.map((list, i) => (
                <div className="wk-allday-cell" key={localDayKey(days[i]!)}>
                  {list.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="wk-chip"
                      onClick={() => onOpenEvent(e)}
                      title={e.title}
                    >
                      {e.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="wk-body">
            <div className="wk-gutter">
              {hours.map((h) => (
                <div className="wk-hour-label" key={h}>
                  <span>{hourLabel(h)}</span>
                </div>
              ))}
            </div>

            {days.map((d, i) => {
              const key = localDayKey(d);
              return (
                <div
                  key={key}
                  className={`wk-col ${key === todayKey ? 'is-today' : ''}`}
                  aria-label={d.toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                >
                  {hours.map((h) => (
                    <div className="wk-hour" key={h} />
                  ))}

                  {key === todayKey && showNow && (
                    <div
                      className="wk-now"
                      style={{ top: `${nowFraction * 100}%` }}
                      aria-label={`Now, ${formatClock(now)}`}
                    />
                  )}

                  {placed[i]!.map((p) => (
                    <button
                      key={p.event.id}
                      type="button"
                      className="wk-event"
                      onClick={() => onOpenEvent(p.event)}
                      style={{
                        top: `${p.top * 100}%`,
                        height: `${p.height * 100}%`,
                        left: `${(p.col / p.cols) * 100}%`,
                        width: `${(1 / p.cols) * 100}%`,
                      }}
                      title={`${formatClock(new Date(p.event.startAt))} ${p.event.title}`}
                    >
                      <span className="wk-event-title">{p.event.title}</span>
                      <span className="wk-event-time">
                        {formatClock(new Date(p.event.startAt))}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
