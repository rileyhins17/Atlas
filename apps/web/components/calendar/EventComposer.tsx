'use client';

import { useMemo, useState } from 'react';
import type { EventDTO } from '@atlas/shared';
import { Trash2 } from 'lucide-react';
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from '@/lib/hooks/events';
import { Button, Dialog, Input, RecurrencePicker, useToast } from '@/components/ui';
import { useSubmitLatch } from '@/lib/hooks/submit-latch';
import { formatClock } from '@/lib/dates';
import { DURATION_PRESETS, combineLocal, findOverlaps, formatDuration } from '@/lib/calendar-view';
import { draftToPayload, type Draft } from '@/lib/event-draft';

/**
 * Create, edit and delete one event.
 *
 * Split out of CalendarPanel, which was a 600-line file doing two unrelated
 * jobs: showing a range of days, and editing a single event. Everything the
 * form needs — the write mutations, the inline error, the overlap warning, the
 * submit latch — lives here, so the panel is only ever concerned with which
 * days are on screen.
 *
 * Controlled rather than self-opening: the panel raises a draft from three
 * places (the New button, an event row, an empty slot in the week grid), so the
 * draft stays its state and this owns everything that happens afterwards.
 */
export function EventComposer({
  draft,
  onDraftChange,
  events,
  onCreated,
}: {
  /** The event being composed, or null when the dialog is closed. */
  draft: Draft | null;
  onDraftChange: (draft: Draft | null) => void;
  /** The loaded range, for the overlap warning and to resolve a delete target. */
  events: EventDTO[];
  /** A new event landed on this day — the panel selects it. */
  onCreated: (dayKey: string) => void;
}) {
  const [clientError, setClientError] = useState<string | null>(null);
  const { toast } = useToast();
  const latch = useSubmitLatch();
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const remove = useDeleteEvent();

  const busy = create.isPending || update.isPending;

  const overlaps = useMemo(() => {
    if (!draft || draft.allDay || !draft.title.trim()) return [];
    const start = combineLocal(draft.day, draft.startTime);
    const end = new Date(start.getTime() + draft.durationMin * 60_000);
    return findOverlaps(events, start, end, draft.id ?? undefined);
  }, [draft, events]);

  function save() {
    if (!draft || busy) return;
    const payload = draftToPayload(draft);
    if (!payload) {
      setClientError('Give the event a name.');
      return;
    }
    setClientError(null);

    if (draft.id) {
      latch((release) =>
        update.mutate(
          {
            id: draft.id!,
            // null clears a rule server-side; undefined would leave it untouched.
            patch: { ...payload, recurrence: draft.recurrence ?? null },
          },
          { onSuccess: () => onDraftChange(null), onSettled: release },
        ),
      );
      return;
    }

    latch((release) =>
      create.mutate(
        { ...payload, ...(draft.recurrence ? { recurrence: draft.recurrence } : {}) },
        {
          onSuccess: () => {
            onDraftChange(null);
            onCreated(draft.day);
          },
          onSettled: release,
        },
      ),
    );
  }

  /** Delete, then offer to put it back — the row is gone before you can regret it. */
  function destroy(event: EventDTO) {
    const restore = {
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
      ...(event.location ? { location: event.location } : {}),
      ...(event.recurrence ? { recurrence: event.recurrence } : {}),
    };
    remove.mutate(event.id, {
      onSuccess: () => {
        onDraftChange(null);
        toast(`Deleted "${event.title}"`, 'success', {
          label: 'Undo',
          onClick: () => create.mutate(restore),
        });
      },
    });
  }

  return (
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => !open && onDraftChange(null)}
        title={draft?.id ? 'Edit event' : 'New event'}
      >
        {draft ? (
          <form
            className="stack"
            // `noValidate` so the inline error slot is the single source of
            // truth. Native bubbles look different in every browser and cannot
            // be styled, and having both means one of them is always dead code.
            noValidate
            onSubmit={(e) => {
            e.preventDefault();
            save();
            }}
          >
            <label className="cal-field">
            <span className="cal-label">What</span>
            <Input
              value={draft.title}
              onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
              placeholder="Dentist, standup, gym…"
              autoFocus
              required
            />
            </label>

            <label className="cal-field">
            <span className="cal-label">Date</span>
            <Input
              type="date"
              value={draft.day}
              onChange={(e) => e.target.value && onDraftChange({ ...draft, day: e.target.value })}
            />
            </label>

            <label className="cal-allday">
            <input
              type="checkbox"
              checked={draft.allDay}
              onChange={(e) => onDraftChange({ ...draft, allDay: e.target.checked })}
            />
            <span>All day</span>
            </label>

            {!draft.allDay && (
            <>
              <label className="cal-field">
                <span className="cal-label">Starts</span>
                <Input
                  type="time"
                  value={draft.startTime}
                  onChange={(e) =>
                    e.target.value && onDraftChange({ ...draft, startTime: e.target.value })
                  }
                />
              </label>

              <div className="cal-field">
                <span className="cal-label">
                  For{' '}
                  <em className="cal-ends">
                    · ends{' '}
                    {formatClock(
                      new Date(
                        combineLocal(draft.day, draft.startTime).getTime() +
                        draft.durationMin * 60_000,
                      ),
                    )}
                  </em>
                </span>
                <div className="cal-durations" role="group" aria-label="Duration">
                  {DURATION_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`cal-dur ${draft.durationMin === m ? 'on' : ''}`}
                      aria-pressed={draft.durationMin === m}
                      onClick={() => onDraftChange({ ...draft, durationMin: m })}
                    >
                      {formatDuration(m)}
                    </button>
                  ))}
                </div>
              </div>
            </>
            )}

            <label className="cal-field">
            <span className="cal-label">Where</span>
            <Input
              value={draft.location}
              onChange={(e) => onDraftChange({ ...draft, location: e.target.value })}
              placeholder="Optional"
            />
            </label>

            <RecurrencePicker
            value={draft.recurrence}
            onChange={(r) => onDraftChange({ ...draft, recurrence: r })}
            />

            {overlaps.length > 0 && (
            <p className="cal-warn" role="status">
              Overlaps {overlaps.map((o) => `"${o.title}"`).join(', ')}. That is allowed — just
              so you know.
            </p>
            )}

            {clientError && <div className="error">{clientError}</div>}

            <div className="cal-actions">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Add event'}
            </Button>
            {draft.id ? (
              <Button
                type="button"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => {
                  const target = events.find((e) => e.id === draft.id);
                  if (target) destroy(target);
                }}
              >
                <Trash2 size={15} aria-hidden /> Delete
              </Button>
            ) : null}
            </div>
          </form>
        ) : null}
      </Dialog>
  );
}
