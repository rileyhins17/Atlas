'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EventDTO } from '@atlas/shared';
import { ApiError, EventsApi } from '@/lib/api';

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
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEvents(await EventsApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load events');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !start || !end) return;
    setBusy(true);
    setError(null);
    try {
      await EventsApi.create({
        title: title.trim(),
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
        location: location.trim() || undefined,
      });
      setTitle('');
      setStart('');
      setEnd('');
      setLocation('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add event');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-title">Calendar</div>
      <form className="card stack" onSubmit={save}>
        <input
          className="input"
          placeholder="Event title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="row">
          <label className="stack" style={{ flex: 1, gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Start</span>
            <input
              className="input"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="stack" style={{ flex: 1, gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>End</span>
            <input
              className="input"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <input
          className="input"
          placeholder="Location (optional)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy}>
          Add event
        </button>
        {error && <div className="error">{error}</div>}
      </form>

      <div className="card" style={{ marginTop: 14 }}>
        {events.length === 0 ? (
          <span className="muted">No upcoming events.</span>
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
              <button
                className="btn ghost"
                onClick={() => EventsApi.remove(ev.id).then(load)}
                aria-label="delete"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
