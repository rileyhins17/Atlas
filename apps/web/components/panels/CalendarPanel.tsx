'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { useCreateEvent, useDeleteEvent, useEvents } from '@/lib/hooks/events';
import { Button, Card, EmptyState, ErrorState, Input, ListSkeleton } from '@/components/ui';

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
      <div className="section-title">Calendar</div>
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
        ) : events.length === 0 ? (
          <EmptyState
            title="No upcoming events"
            hint="Add an event above, or connect Google Calendar in Settings to sync the ones you already have."
          />
        ) : (
          events.map((ev) => (
            <div className="task" key={ev.id}>
              <div className="title">
                <div>{ev.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {fmtWhen(ev.startAt)}
                  {ev.location ? ` · ${ev.location}` : ''}
                </div>
              </div>
              <Button variant="ghost" onClick={() => remove.mutate(ev.id)} aria-label="delete">
                ✕
              </Button>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
