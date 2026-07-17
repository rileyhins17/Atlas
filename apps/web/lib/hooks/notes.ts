'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotesApi } from '@/lib/api';
import { qk } from './keys';

export function useNotes() {
  return useQuery({ queryKey: qk.notes, queryFn: NotesApi.list });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: NotesApi.create,
    meta: { success: 'Note saved', errorFallback: 'Failed to save note' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notes }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: NotesApi.remove,
    meta: { success: 'Note deleted', errorFallback: 'Failed to delete note' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notes }),
  });
}
