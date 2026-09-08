'use client';

import { useMemo, useState, useSyncExternalStore, type ComponentProps } from 'react';
import { agendaDays } from '@atlas/shared';
import { fmt, formatClock } from '@/lib/dates';
import { Button } from '@/components/ui';
import { WeekGrid } from './WeekGrid';

const PHONE_QUERY = '(max-width: 700px)';
function subscribePhone(callback: () => void) {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
function phoneSnapshot() { return window.matchMedia(PHONE_QUERY).matches; }
function serverSnapshot() { return false; }

/** Same dates and editing actions, presented at a readable phone width. */
export function WeekPresentation(props: ComponentProps<typeof WeekGrid>) {
  const phone = useSyncExternalStore(subscribePhone, phoneSnapshot, serverSnapshot);
  const [choice, setChoice] = useState<'agenda' | 'grid' | null>(null);
  const view = choice ?? (phone ? 'agenda' : 'grid');
  const agenda = useMemo(() => agendaDays(props.events, props.days), [props.events, props.days]);
  return (
    <div className="week-presentation">
      <div className="week-view-picker" role="group" aria-label="Week layout">
        <Button variant="secondary" aria-pressed={view === 'agenda'} onClick={() => setChoice('agenda')}>Agenda</Button>
        <Button variant="secondary" aria-pressed={view === 'grid'} onClick={() => setChoice('grid')}>Time grid</Button>
      </div>
      {view === 'grid' ? <WeekGrid {...props} /> : (
        <div className="week-agenda" aria-label="Seven-day agenda">
          {agenda.map(({ date: day, key, segments }) => {
            const heading = day.toLocaleDateString(undefined, fmt({ weekday: 'long', month: 'short', day: 'numeric' }));
            return (
              <section className="week-agenda-day" key={key} aria-label={heading}>
                <div className="week-agenda-head">
                  <h2>{heading}</h2>
                  {props.onCreateAt && <Button variant="ghost" aria-label={`Add event on ${heading}`} onClick={() => props.onCreateAt?.(day, 9 * 60)}>+ Add</Button>}
                </div>
                {segments.length === 0 ? <p className="muted">No events scheduled</p> : (
                  <div className="stack">
                    {segments.map(({ event, continuesBefore, continuesAfter }) => (
                      <button type="button" className="week-agenda-event" key={event.id} onClick={() => props.onOpenEvent(event)}>
                        <span className="week-agenda-time">{event.allDay || (continuesBefore && continuesAfter) ? 'All day' : continuesBefore ? `Until ${formatClock(new Date(event.endAt))}` : continuesAfter ? `From ${formatClock(new Date(event.startAt))}` : `${formatClock(new Date(event.startAt))}–${formatClock(new Date(event.endAt))}`}</span>
                        <span className="week-agenda-title">{event.title}</span>
                        {continuesBefore && <span className="muted">Continued from the previous day</span>}
                        {continuesAfter && <span className="muted">Continues into the next day</span>}
                        {event.location && <span className="muted">{event.location}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
