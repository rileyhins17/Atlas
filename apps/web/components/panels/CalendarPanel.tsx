'use client';

import { useMemo, useState } from 'react';
import type { EventDTO } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useCreateEvent, useDeleteEvent, useEvents } from '@/lib/hooks/events';
import { CalendarDays, MapPin, X } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, IconButton, Input, ListSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { formatClock, formatDayHeading, localDayKey } from '@/lib/dates';

/** Events grouped by local calendar day, upcoming first (past days last). */
export function groupEventsByDay(events: EventDTO[]): Array<[string, EventDTO[]]> {
  const byDay = new Map<string, EventDTO[]>();
  const sorted = [...events].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  const today = localDayKey(new Date());
  for (const e of sorted) {
    const key = localDayKey(new Date(e.startAt));
    if (key < today) continue; // agenda looks forward
    const arr = byDay.get(key) ?? [];
    arr.push(e);
    byDay.set(key, arr);
  }
  return [...byDay.entries()];
}

export function CalendarPanel() {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const eventsQuery = useEvents();
  const create = useCreateEvent();
  const remove = useDeleteEvent();

  const events = eventsQuery.data ?? [];
  const grouped = useMemo(() => groupEventsByDay(events), [events]);
  const error =
    clientError ??
    (create.error
      ? errorMessage(create.error, 'Failed to add event')
      : remove.error
        ? errorMessage(remove.error, 'Failed to delete event')
        : null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !start || !end || create.isPending) return;
    if (new Date(end) < new Date(start)) {
      setClientError('End must be at or after start.');
      return;
    }
    setClientError(null);
    create.mutate(
      {
        title: title.trim(),
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
        location: location.trim() || undefined,
      },
      {
        onSuccess: () => {
          setTitle('');
          setStart('');
          setEnd('');
          setLocation('');
        },
      },
    );
  }

  return (
    <>
      <PageHeader title="Calendar" subtitle="What's coming up." />
      <Card stack>
        <form className="stack" onSubmit={save}>
          <Input
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <div className="row">
            <label className="stack" style={{ flex: 1, gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Start</span>
              <Input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <label className="stack" style={{ flex: 1, gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>End</span>
              <Input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>
          </div>
          <Input
            placeholder="Location (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending}>
            Add event
          </Button>
          {error && <div className="error">{error}</div>}
        </form>
      </Card>

      <Card style={{ marginTop: 14 }}>
        {eventsQuery.isPending ? (
          <ListSkeleton rows={3} circle={false} />
        ) : eventsQuery.isError ? (
          <ErrorState
            message={errorMessage(eventsQuery.error, 'Failed to load events')}
            onRetry={() => void eventsQuery.refetch()}
          />
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No upcoming events"
            hint="Add an event above, or connect Google Calendar in Settings to sync yours."
          />
        ) : (
          <div className="stack" style={{ gap: 18 }}>
            {grouped.map(([day, dayEvents]) => (
              <section key={day} aria-label={formatDayHeading(new Date(`${day}T12:00:00`))}>
                <h3 className="focus-group-title" style={{ marginBottom: 4 }}>
                  {formatDayHeading(new Date(`${day}T12:00:00`))}
                </h3>
                {dayEvents.map((ev) => (
                  <div className="task" key={ev.id}>
                    <span className="agenda-time">
                      {ev.allDay ? 'all day' : formatClock(new Date(ev.startAt))}
                    </span>
                    <div className="title">
                      <div>{ev.title}</div>
                      <div className="muted row" style={{ fontSize: 12, gap: 4 }}>
                        {!ev.allDay && `until ${formatClock(new Date(ev.endAt))}`}
                        {ev.location ? (
                          <>
                            <MapPin size={11} aria-hidden /> {ev.location}
                          </>
                        ) : null}
                        {ev.source !== 'atlas' && ' · Google'}
                      </div>
                    </div>
                    <IconButton label={`Delete "${ev.title}"`} onClick={() => remove.mutate(ev.id)}>
                      <X size={16} aria-hidden />
                    </IconButton>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
