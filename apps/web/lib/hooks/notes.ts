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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notes }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: NotesApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notes }),
  });
}
