'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EventsApi } from '@/lib/api';
import { qk } from './keys';

export function useEvents() {
  return useQuery({ queryKey: qk.events, queryFn: EventsApi.list });
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
