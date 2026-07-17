'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { JournalApi } from '@/lib/api';
import { qk } from './keys';

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
