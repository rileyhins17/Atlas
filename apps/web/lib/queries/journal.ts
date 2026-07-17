import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateJournalInput } from '@atlas/shared';
import { JournalApi } from '@/lib/api';

export const journalKeys = {
  list: ['journal'] as const,
};

export function useJournalEntries() {
  return useQuery({ queryKey: journalKeys.list, queryFn: JournalApi.list });
}

export function useCreateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateJournalInput> & { body: string }) => JournalApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: journalKeys.list }),
  });
}
