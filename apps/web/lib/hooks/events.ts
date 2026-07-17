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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.events }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: EventsApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.events }),
  });
}
