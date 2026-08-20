'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EventsApi } from '@/lib/api';
import { addDays, DAY_MS } from '@/lib/dates';
import { qk } from './keys';

/** How far ahead the agenda looks. Under the API's 62-day window cap. */
const AGENDA_DAYS = 60;

export function useEvents() {
  // Wrapped: EventsApi.list takes an options object now, and TanStack would
  // otherwise pass its QueryFunctionContext into it.
  //
  // The window is not optional: the server can only expand a recurring series
  // inside a bounded range (an open-ended list has no point to stop generating
  // at), so an unwindowed agenda would show a weekly event exactly once.
  return useQuery({
    queryKey: qk.events,
    queryFn: () => {
      // Deliberately elapsed time, not calendar days: this is a rolling fetch
      // window sized against the API's 62-day cap, not a range of dates.
      const from = new Date(Date.now() - DAY_MS);
      const to = new Date(from.getTime() + AGENDA_DAYS * DAY_MS);
      return EventsApi.list({ from: from.toISOString(), to: to.toISOString(), limit: 100 });
    },
  });
}

/** Events for one local day (Day Canvas) — [dayStart, dayStart+24h). */
export function useDayEvents(dayStart: Date) {
  const from = dayStart.toISOString();
  // The window has to be the real length of THIS local day. A fixed 24h is an
  // hour short on the autumn transition, which silently drops that day's last
  // hour of events from the canvas.
  const to = addDays(dayStart, 1).toISOString();
  return useQuery({
    queryKey: qk.dayEvents(from),
    queryFn: () => EventsApi.list({ from, to, limit: 100 }),
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: EventsApi.create,
    meta: { success: 'Event added', errorFallback: 'Failed to add event' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.events }),
  });
}

/**
 * Events across an explicit window — what the calendar navigates with.
 *
 * The window must stay under the API's 62-day cap, and it deliberately spans
 * several weeks either side of the visible one so paging to the next or
 * previous week is instant instead of a fresh round-trip.
 */
export function useEventsRange(from: Date, to: Date) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  return useQuery({
    queryKey: qk.eventsRange(fromIso, toIso),
    queryFn: () => EventsApi.list({ from: fromIso, to: toIso, limit: 100 }),
    placeholderData: (prev) => prev,
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof EventsApi.update>[1] }) =>
      EventsApi.update(id, patch),
    meta: { success: 'Event updated', errorFallback: 'Failed to update event' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.events }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: EventsApi.remove,
    // No `meta.success`: the calendar raises its own toast so it can attach an
    // Undo action, and two toasts for one delete reads as a bug.
    meta: { errorFallback: 'Failed to delete event' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.events }),
  });
}
