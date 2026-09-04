'use client';

import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { useGoogleCalendars, useSetGoogleCalendars } from '@/lib/hooks/google';
import { Button, ErrorState, Skeleton } from '@/components/ui';

/**
 * Which Google calendars Atlas reads.
 *
 * Atlas used to see `primary` and nothing else, which is wrong for almost
 * everyone: the calendars people actually organise their lives with are the
 * ones they made — "Work", "Climbing", the shared family one. Those were
 * invisible, and the app looked like it had lost half your week.
 *
 * It is a picker rather than "sync everything" because a Google account is
 * usually subscribed to things nobody asked Atlas for: a national holidays
 * feed, a football fixture list, four colleagues' calendars. Dragging six
 * hundred fixtures into Today would make the app worse, not better. The default
 * is what Google itself shows — the calendars already ticked in their own UI —
 * so the first sync matches what the user sees when they look at Google.
 *
 * Unticking one removes the events it brought in. That is what "stop syncing
 * this" has to mean; leaving them behind and never updating them again would be
 * the worst of both. It says so before you press Save, because it is a delete.
 */
export function GoogleCalendarPicker({ connected }: { connected: boolean }) {
  const calendars = useGoogleCalendars(connected);
  const save = useSetGoogleCalendars();
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Adopt the server's answer once, and again after a save. Keyed on the data
  // itself so a background refetch never discards a half-made selection.
  const serverIds = calendars.data
    ?.filter((c) => c.syncing)
    .map((c) => c.id)
    .join(',');
  useEffect(() => {
    if (serverIds != null) setChosen(serverIds ? serverIds.split(',') : []);
  }, [serverIds]);

  if (!connected) return null;

  if (calendars.isPending) {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <Skeleton height={14} width="45%" />
        <Skeleton height={14} width="70%" />
      </div>
    );
  }

  if (calendars.isError) {
    // The likeliest cause by far is an older grant: everyone who connected
    // before Atlas asked to see the calendar LIST has a token that cannot.
    // Reconnecting fixes it, and saying so beats a retry button that will fail
    // identically every time.
    return (
      <ErrorState
        message={`${errorMessage(calendars.error, 'Could not read your calendars')} If you connected Google a while ago, disconnect and connect again — Atlas now asks for permission to see your other calendars.`}
        onRetry={() => void calendars.refetch()}
      />
    );
  }

  const all = calendars.data;
  const selected = chosen ?? [];
  const dirty =
    all.filter((c) => c.syncing).length !== selected.length ||
    all.some((c) => c.syncing !== selected.includes(c.id));
  const losing = all.filter((c) => c.syncing && !selected.includes(c.id));

  function toggle(id: string) {
    setNote(null);
    setChosen((prev) => {
      const next = prev ?? [];
      return next.includes(id) ? next.filter((x) => x !== id) : [...next, id];
    });
  }

  return (
    <div className="gcal-picker">
      <p className="gcal-picker-h">Calendars Atlas reads</p>
      <ul className="gcal-list">
        {all.map((c) => (
          <li key={c.id} className="gcal-item">
            <label className="gcal-row">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={() => toggle(c.id)}
              />
              <span
                className="gcal-swatch"
                aria-hidden
                style={c.colour ? { background: c.colour } : undefined}
              />
              <span className="gcal-name">{c.summary}</span>
              {c.primary && <span className="gcal-tag">main</span>}
            </label>
          </li>
        ))}
      </ul>

      {/* Named, not counted. "2 calendars will be removed" is not enough
          information to press a button that deletes events. */}
      {losing.length > 0 && (
        <p className="gcal-warn">
          Saving removes the events Atlas imported from{' '}
          {losing.map((c) => c.summary).join(', ')}. They stay in Google, and tick it again to
          bring them back.
        </p>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate(selected, {
              onSuccess: (res) =>
                setNote(
                  res.removed > 0
                    ? `Saved. ${res.removed} imported event${res.removed === 1 ? '' : 's'} removed.`
                    : 'Saved. Run a sync to pull the new calendars in.',
                ),
            })
          }
        >
          {save.isPending ? 'Saving…' : 'Save calendars'}
        </Button>
      </div>

      {note && (
        <p className="field-saved" role="status">
          {note}
        </p>
      )}
      {save.isError && <p className="error">{errorMessage(save.error, 'Could not save that')}</p>}
    </div>
  );
}
