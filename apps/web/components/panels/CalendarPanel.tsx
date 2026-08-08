'use client';

import { useEffect, useMemo, useState } from 'react';
import { describeRrule, type EventDTO } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import {
  useCreateEvent,
  useDeleteEvent,
  useEventsRange,
  useUpdateEvent,
} from '@/lib/hooks/events';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  ListSkeleton,
  RecurrencePicker,
  useToast,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { GoogleCalendarCard } from '@/components/connectors/GoogleCalendarCard';
import { useSubmitLatch } from '@/lib/hooks/submit-latch';
import { formatClock, localDayKey } from '@/lib/dates';
import {
  DURATION_PRESETS,
  addDays,
  bucketByDay,
  combineLocal,
  countsByDay,
  dateFromDayKey,
  findOverlaps,
  formatDuration,
  isLive,
  minutesBetween,
  nextSlot,
  rangeLabel,
  startOfWeek,
  toTimeValue,
  weekDays,
  weekdayShort,
} from '@/lib/calendar-view';

/** Weeks of slack fetched either side of the visible one (stays under the API's 62-day cap). */
const PAST_WEEKS = 3;
const FUTURE_WEEKS = 4;

const NO_EVENTS: EventDTO[] = [];

type Draft = {
  id: string | null;
  title: string;
  day: string;
  startTime: string;
  durationMin: number;
  location: string;
  allDay: boolean;
  recurrence: string | null;
};

function draftFor(event: EventDTO): Draft {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  return {
    id: event.id,
    title: event.title,
    day: localDayKey(start),
    startTime: toTimeValue(start),
    durationMin: Math.max(5, minutesBetween(start, end)),
    location: event.location ?? '',
    allDay: event.allDay,
    recurrence: event.recurrence,
  };
}

function blankDraft(dayKey: string, now: Date): Draft {
  const slot = nextSlot(now);
  return {
    id: null,
    title: '',
    day: dayKey,
    // A day in the future has no "next slot" — 9am is the sane default.
    startTime: dayKey === localDayKey(now) ? toTimeValue(slot) : '09:00',
    durationMin: 60,
    location: '',
    allDay: false,
    recurrence: null,
  };
}

export function CalendarPanel({ initialScope = 'day' }: { initialScope?: 'day' | 'week' } = {}) {
  const [now, setNow] = useState(() => new Date());
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string>(() => localDayKey(new Date()));
  const [scope, setScope] = useState<'day' | 'week'>(initialScope);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const { toast } = useToast();
  const latch = useSubmitLatch();

  // The "now" line and the live-event highlight are wrong the moment the clock
  // moves past them, so re-render on the minute rather than only on refetch.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const [from, to] = useMemo(() => {
    const weekStart = startOfWeek(anchor);
    return [addDays(weekStart, -7 * PAST_WEEKS), addDays(weekStart, 7 * FUTURE_WEEKS)];
  }, [anchor]);

  const eventsQuery = useEventsRange(from, to);
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const remove = useDeleteEvent();

  const events = eventsQuery.data ?? NO_EVENTS;
  const counts = useMemo(() => countsByDay(events), [events]);

  const visible = useMemo(() => {
    if (scope === 'week') return bucketByDay(events, days[0], days[6]);
    const d = dateFromDayKey(selectedDay);
    return bucketByDay(events, d, d);
  }, [events, scope, days, selectedDay]);

  const busy = create.isPending || update.isPending;
  const overlaps = useMemo(() => {
    if (!draft || draft.allDay || !draft.title.trim()) return [];
    const start = combineLocal(draft.day, draft.startTime);
    const end = new Date(start.getTime() + draft.durationMin * 60_000);
    return findOverlaps(events, start, end, draft.id ?? undefined);
  }, [draft, events]);

  function openCreate(dayKey = selectedDay) {
    setClientError(null);
    setDraft(blankDraft(dayKey, now));
  }

  function openEdit(event: EventDTO) {
    // Expanded occurrences carry a synthetic id the API will not accept.
    if (event.isOccurrence) {
      toast('Edit the series from its first date.', 'info');
      return;
    }
    setClientError(null);
    setDraft(draftFor(event));
  }

  function save() {
    if (!draft || busy) return;
    const title = draft.title.trim();
    if (!title) {
      setClientError('Give the event a name.');
      return;
    }
    const start = draft.allDay
      ? combineLocal(draft.day, '00:00')
      : combineLocal(draft.day, draft.startTime);
    const end = draft.allDay
      ? new Date(start.getTime() + 86_400_000 - 60_000)
      : new Date(start.getTime() + draft.durationMin * 60_000);

    setClientError(null);
    const payload = {
      title,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      location: draft.location.trim() || undefined,
      allDay: draft.allDay,
    };

    if (draft.id) {
      latch((release) =>
        update.mutate(
          {
            id: draft.id!,
            // null clears a rule server-side; undefined would leave it untouched.
            patch: { ...payload, recurrence: draft.recurrence ?? null },
          },
          { onSuccess: () => setDraft(null), onSettled: release },
        ),
      );
    } else {
      latch((release) =>
        create.mutate(
          { ...payload, ...(draft.recurrence ? { recurrence: draft.recurrence } : {}) },
          {
            onSuccess: () => {
              setDraft(null);
              setSelectedDay(draft.day);
            },
            onSettled: release,
          },
        ),
      );
    }
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
        setDraft(null);
        toast(`Deleted "${event.title}"`, 'success', {
          label: 'Undo',
          onClick: () => create.mutate(restore),
        });
      },
    });
  }

  const todayKey = localDayKey(now);
  const listError = eventsQuery.isError
    ? errorMessage(eventsQuery.error, 'Failed to load events')
    : null;

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={rangeLabel(days)}
        action={
          <Button onClick={() => openCreate()}>
            <Plus size={15} aria-hidden /> New
          </Button>
        }
      />

      {/* Week navigation. The strip is the whole control: swipeable by nature,
          one tap per day, and it shows where the busy days are before you go.
          It is navigation, so it is attached to the header rather than boxed in
          a card of its own — three stacked cards before the first event was the
          reason this page opened on chrome instead of a week. */}
      <div className="cal-head">
        <div className="cal-nav">
          <button
            type="button"
            className="cal-nav-btn"
            aria-label="Previous week"
            onClick={() => setAnchor((a) => addDays(a, -7))}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="cal-today-btn"
            onClick={() => {
              const t = new Date();
              setAnchor(t);
              setSelectedDay(localDayKey(t));
            }}
          >
            Today
          </button>
          <button
            type="button"
            className="cal-nav-btn"
            aria-label="Next week"
            onClick={() => setAnchor((a) => addDays(a, 7))}
          >
            <ChevronRight size={18} aria-hidden />
          </button>

          {/* On the same row as the pager: it is one question — which slice of
              time am I looking at — and it used to cost a third row on its own. */}
          <div className="cal-scope" role="group" aria-label="How much to show">
            <button
              type="button"
              className={`cal-scope-btn ${scope === 'day' ? 'on' : ''}`}
              aria-pressed={scope === 'day'}
              onClick={() => setScope('day')}
            >
              Day
            </button>
            <button
              type="button"
              className={`cal-scope-btn ${scope === 'week' ? 'on' : ''}`}
              aria-pressed={scope === 'week'}
              onClick={() => setScope('week')}
            >
              Week
            </button>
          </div>
        </div>

        <div className="cal-strip" role="group" aria-label="Pick a day">
          {days.map((d) => {
            const key = localDayKey(d);
            const count = counts.get(key) ?? 0;
            const classes = [
              'cal-day',
              key === selectedDay ? 'on' : '',
              key === todayKey ? 'is-today' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={key}
                type="button"
                className={classes}
                aria-pressed={key === selectedDay}
                aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${count} ${count === 1 ? 'event' : 'events'}`}
                onClick={() => {
                  setSelectedDay(key);
                  setScope('day');
                }}
              >
                <span className="cal-day-name">{weekdayShort(d)}</span>
                <span className="cal-day-num">{d.getDate()}</span>
                <span className="cal-day-dots" aria-hidden>
                  {count > 0
                    ? Array.from({ length: Math.min(count, 3) }, (_, i) => (
                        <i key={i} className="cal-dot" />
                      ))
                    : null}
                </span>
              </button>
            );
          })}
        </div>

      </div>

      {/* Connecting Google is something you think of while looking at your
          calendar, not while hunting through Settings — but it is setup, so it
          gets one line under the strip rather than a card above the events. */}
      <GoogleCalendarCard inline />

      <Card style={{ marginTop: 12 }}>
        {eventsQuery.isPending ? (
          <ListSkeleton rows={3} circle={false} />
        ) : listError ? (
          <ErrorState message={listError} onRetry={() => void eventsQuery.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={scope === 'week' ? 'Nothing this week' : 'Nothing on this day'}
            hint="Tap New to add something, or connect Google Calendar in Settings to sync yours."
          />
        ) : (
          <div className="stack" style={{ gap: 18 }}>
            {visible.map((bucket) => (
              <section key={bucket.key} aria-label={bucket.date.toLocaleDateString()}>
                <h3 className="focus-group-title" style={{ marginBottom: 6 }}>
                  {bucket.key === todayKey
                    ? 'Today'
                    : bucket.date.toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}
                </h3>
                {bucket.events.map((ev) => {
                  const start = new Date(ev.startAt);
                  const end = new Date(ev.endAt);
                  const live = isLive(ev, now);
                  const repeat = describeRrule(ev.recurrence);
                  return (
                    <button
                      type="button"
                      className={`cal-event ${live ? 'live' : ''}`}
                      key={ev.id}
                      onClick={() => openEdit(ev)}
                    >
                      <span className="cal-event-time">
                        <span className="cal-event-start">
                          {ev.allDay ? 'all day' : formatClock(start)}
                        </span>
                        {!ev.allDay && (
                          <span className="cal-event-dur">
                            {formatDuration(minutesBetween(start, end))}
                          </span>
                        )}
                      </span>
                      <span className="cal-event-body">
                        <span className="cal-event-title">{ev.title}</span>
                        <span className="cal-event-meta">
                          {live ? <em className="cal-live">now</em> : null}
                          {ev.location ? (
                            <>
                              <MapPin size={11} aria-hidden />
                              {ev.location}
                            </>
                          ) : null}
                          {ev.source !== 'atlas' ? <span>Google</span> : null}
                          {repeat ? (
                            <>
                              <Repeat size={11} aria-hidden />
                              {repeat}
                            </>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </Card>

      {/* One field per row. The old form put two datetime-local inputs side by
          side, which cannot shrink below ~260px each and pushed the page to
          537px wide on a 390px phone. */}
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
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
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
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
                onChange={(e) => e.target.value && setDraft({ ...draft, day: e.target.value })}
              />
            </label>

            <label className="cal-allday">
              <input
                type="checkbox"
                checked={draft.allDay}
                onChange={(e) => setDraft({ ...draft, allDay: e.target.checked })}
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
                      e.target.value && setDraft({ ...draft, startTime: e.target.value })
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
                        onClick={() => setDraft({ ...draft, durationMin: m })}
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
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                placeholder="Optional"
              />
            </label>

            <RecurrencePicker
              value={draft.recurrence}
              onChange={(r) => setDraft({ ...draft, recurrence: r })}
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
    </>
  );
}
