'use client';

import { useEffect, useMemo, useState } from 'react';
import { describeRrule, type EventDTO } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import {
  useEventsRange,
} from '@/lib/hooks/events';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  Repeat,
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListSkeleton,
  useToast,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { WeekGrid } from '@/components/calendar/WeekGrid';
import { EventComposer } from '@/components/calendar/EventComposer';
import { blankDraft, draftAtSlot, draftFor, type Draft } from '@/lib/event-draft';
import { GoogleCalendarCard } from '@/components/connectors/GoogleCalendarCard';
import { formatClock, localDayKey } from '@/lib/dates';
import {
  addDays,
  bucketByDay,
  countsByDay,
  dateFromDayKey,
  formatDuration,
  isLive,
  minutesBetween,
  rangeLabel,
  startOfWeek,
  weekDays,
  weekdayShort,
} from '@/lib/calendar-view';

/** Weeks of slack fetched either side of the visible one (stays under the API's 62-day cap). */
const PAST_WEEKS = 3;
const FUTURE_WEEKS = 4;

const NO_EVENTS: EventDTO[] = [];

export function CalendarPanel({ initialScope = 'day' }: { initialScope?: 'day' | 'week' } = {}) {
  const [now, setNow] = useState(() => new Date());
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string>(() => localDayKey(new Date()));
  const [scope, setScope] = useState<'day' | 'week'>(initialScope);
  const [draft, setDraft] = useState<Draft | null>(null);
  const { toast } = useToast();

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

  const events = eventsQuery.data ?? NO_EVENTS;
  const counts = useMemo(() => countsByDay(events), [events]);

  const visible = useMemo(() => {
    if (scope === 'week') return bucketByDay(events, days[0], days[6]);
    const d = dateFromDayKey(selectedDay);
    return bucketByDay(events, d, d);
  }, [events, scope, days, selectedDay]);


  function openCreate(dayKey = selectedDay) {
    setDraft(blankDraft(dayKey, now));
  }

  /** Clicked an empty slot in the week grid: start there, not at "next slot". */
  function openCreateAt(day: Date, minuteOfDay: number) {
    setDraft(draftAtSlot(day, minuteOfDay, now));
  }

  function openEdit(event: EventDTO) {
    // Expanded occurrences carry a synthetic id the API will not accept.
    if (event.isOccurrence) {
      toast('Edit the series from its first date.', 'info');
      return;
    }
    setDraft(draftFor(event));
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

        {/* Day scope only. In week scope the grid's own header IS this strip —
            the same seven days, the same numbers, the same selection — and two
            of them stacked is just two of them stacked. */}
        {scope === 'day' && (
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
        )}
      </div>

      {/* Connecting Google is something you think of while looking at your
          calendar, not while hunting through Settings — but it is setup, so it
          gets one line under the strip rather than a card above the events. */}
      <GoogleCalendarCard inline />

      {/* Week is a GRID, not a list.
          Grouped by day in reverse-chronological order, "week" answered "what
          is next" — which is Today's job — and never answered the only question
          worth opening seven days for: where the week is packed, where it is
          empty, and what collides. Day scope stays a list, because one day in a
          column is just a list with worse density. */}
      {scope === 'week' && !eventsQuery.isPending && !listError ? (
        <Card style={{ marginTop: 12 }} className="wk-card">
          <WeekGrid
            days={days}
            events={events}
            selectedDay={selectedDay}
            onPickDay={(key) => {
              setSelectedDay(key);
              setScope('day');
            }}
            onOpenEvent={openEdit}
            onCreate={() => openCreate()}
            onCreateAt={openCreateAt}
          />
        </Card>
      ) : (
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
      )}

      {/* One field per row. The old form put two datetime-local inputs side by
          side, which cannot shrink below ~260px each and pushed the page to
          537px wide on a 390px phone. */}
      <EventComposer
        draft={draft}
        onDraftChange={setDraft}
        events={events}
        onCreated={setSelectedDay}
      />
    </>
  );
}
