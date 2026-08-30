'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateJournalInput } from '@atlas/shared';
import { JournalApi } from '@/lib/api';
import { qk } from './keys';
import { useInvalidatingMutation } from './mutation';

export function useJournal() {
  return useQuery({ queryKey: qk.journal, queryFn: JournalApi.list });
}

export function useCreateJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: JournalApi.create,
    meta: { success: 'Entry saved', errorFallback: 'Failed to save entry' },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.journal });
      // A new entry can seed an ai_question (thin/low-mood heuristic server-side).
      void qc.invalidateQueries({ queryKey: qk.aiQuestions });
    },
  });
}

export function useUpdateJournalEntry() {
  return useInvalidatingMutation({
    mutationFn: ({ id, ...input }: UpdateJournalInput & { id: string }) =>
      JournalApi.update(id, input),
    invalidates: qk.journal,
    success: 'Entry updated',
    errorFallback: 'Failed to update entry',
  });
}
