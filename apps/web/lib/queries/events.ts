import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EventDTO } from '@atlas/shared';
import { EventsApi, type NewEvent } from '@/lib/api';

export const eventKeys = {
  list: ['events'] as const,
};

export function useEvents() {
  return useQuery({ queryKey: eventKeys.list, queryFn: EventsApi.list });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewEvent) => EventsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventKeys.list }),
  });
}

export function useRemoveEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (event: EventDTO) => EventsApi.remove(event.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventKeys.list }),
  });
}
