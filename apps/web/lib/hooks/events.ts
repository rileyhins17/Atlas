'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EventsApi } from '@/lib/api';
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
      const from = new Date(Date.now() - 86_400_000);
      const to = new Date(from.getTime() + AGENDA_DAYS * 86_400_000);
      return EventsApi.list({ from: from.toISOString(), to: to.toISOString(), limit: 100 });
    },
  });
}

/** Events for one local day (Day Canvas) — [dayStart, dayStart+24h). */
export function useDayEvents(dayStart: Date) {
  const from = dayStart.toISOString();
  const to = new Date(dayStart.getTime() + 86_400_000).toISOString();
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

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: EventsApi.remove,
    meta: { success: 'Event deleted', errorFallback: 'Failed to delete event' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.events }),
  });
}
