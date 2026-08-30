'use client';

import { useQuery } from '@tanstack/react-query';
import type { UpdateNoteInput } from '@atlas/shared';
import { NotesApi } from '@/lib/api';
import { qk } from './keys';
import { useInvalidatingMutation } from './mutation';

export function useNotes() {
  return useQuery({ queryKey: qk.notes, queryFn: NotesApi.list });
}

export function useCreateNote() {
  return useInvalidatingMutation({
    mutationFn: NotesApi.create,
    invalidates: qk.notes,
    success: 'Note saved',
    errorFallback: 'Failed to save note',
  });
}

export function useUpdateNote() {
  return useInvalidatingMutation({
    mutationFn: ({ id, ...input }: UpdateNoteInput & { id: string }) => NotesApi.update(id, input),
    invalidates: qk.notes,
    success: 'Note updated',
    errorFallback: 'Failed to update note',
  });
}

export function useDeleteNote() {
  return useInvalidatingMutation({
    mutationFn: NotesApi.remove,
    invalidates: qk.notes,
    success: 'Note deleted',
    errorFallback: 'Failed to delete note',
  });
}
