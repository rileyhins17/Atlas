/**
 * The composer's working copy of an event, and the pure conversions either side
 * of it. No React and no fetching, so the interesting part — turning what the
 * form holds into what the API is sent — is unit-tested rather than eyeballed
 * through a dialog.
 *
 * That conversion is not clerical. It decides an all-day event's end, which is
 * the one place in this app where a fixed 24 hours produces a wrong answer
 * twice a year.
 */
import type { EventDTO } from '@atlas/shared';
import { addDays, localDayKey } from './dates';
import { combineLocal, minutesBetween, nextSlot, toTimeValue } from './calendar-view';

export type Draft = {
  id: string | null;
  title: string;
  day: string;
  startTime: string;
  durationMin: number;
  location: string;
  allDay: boolean;
  recurrence: string | null;
};

/** Shortest block the composer will produce, in minutes. */
const MIN_DURATION = 5;

export function draftFor(event: EventDTO): Draft {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  return {
    id: event.id,
    title: event.title,
    day: localDayKey(start),
    startTime: toTimeValue(start),
    durationMin: Math.max(MIN_DURATION, minutesBetween(start, end)),
    location: event.location ?? '',
    allDay: event.allDay,
    recurrence: event.recurrence,
  };
}

export function blankDraft(dayKey: string, now: Date): Draft {
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

/** Clicked an empty slot in the week grid: start there, not at "next slot". */
export function draftAtSlot(day: Date, minuteOfDay: number, now: Date): Draft {
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const mm = String(minuteOfDay % 60).padStart(2, '0');
  return { ...blankDraft(localDayKey(day), now), startTime: `${hh}:${mm}` };
}

/**
 * The real interval a draft describes.
 *
 * An all-day event ends one minute before the NEXT CALENDAR DAY, not 24 hours
 * after midnight. On the autumn transition a fixed day ends it at 22:59, and in
 * spring it spills past midnight into the following day — so an "all day" event
 * would show up on two days.
 */
export function draftInterval(draft: Draft): { start: Date; end: Date } {
  if (draft.allDay) {
    const start = combineLocal(draft.day, '00:00');
    return { start, end: new Date(addDays(start, 1).getTime() - 60_000) };
  }
  const start = combineLocal(draft.day, draft.startTime);
  return { start, end: new Date(start.getTime() + draft.durationMin * 60_000) };
}

export type EventPayload = {
  title: string;
  startAt: string;
  endAt: string;
  location?: string;
  allDay: boolean;
};

/**
 * What the API is sent, or null when the draft is not sendable yet. Returning
 * null rather than throwing keeps the caller's error slot in charge of what the
 * user is told.
 */
export function draftToPayload(draft: Draft): EventPayload | null {
  const title = draft.title.trim();
  if (!title) return null;
  const { start, end } = draftInterval(draft);
  return {
    title,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    location: draft.location.trim() || undefined,
    allDay: draft.allDay,
  };
}
