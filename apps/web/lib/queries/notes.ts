import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateNoteInput, NoteDTO } from '@atlas/shared';
import { NotesApi } from '@/lib/api';

export const noteKeys = {
  list: ['notes'] as const,
};

export function useNotes() {
  return useQuery({ queryKey: noteKeys.list, queryFn: NotesApi.list });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateNoteInput> & { body: string }) => NotesApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.list }),
  });
}

export function useRemoveNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: NoteDTO) => NotesApi.remove(note.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.list }),
  });
}
