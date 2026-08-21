'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoutineBlockInput } from '@atlas/shared';
import { RoutineApi } from '@/lib/api';
import { qk } from './keys';
import { useInvalidatingMutation } from './mutation';

export function useRoutine() {
  return useQuery({ queryKey: qk.routine, queryFn: RoutineApi.list });
}

export function useReplaceRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blocks: RoutineBlockInput[]) => RoutineApi.replace(blocks),
    onSuccess: (data) => qc.setQueryData(qk.routine, data),
  });
}

/**
 * Per-block mutations back the editor. The editor deliberately does NOT use
 * `replace` — that wipes and rewrites the whole weekly pattern, which would
 * churn every row's id on each keystroke and (before the service was split)
 * silently delete date-specific blocks.
 */
function useBlockMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>, errorFallback: string) {
  // The shared helper, not a private copy of it. This function was the original
  // handwritten version of that idea; keeping the wrapper is still worth it,
  // because every caller here invalidates the same key and passes only a
  // message, and spelling that out three times says nothing.
  return useInvalidatingMutation({ mutationFn: fn, invalidates: qk.routine, errorFallback });
}

export function useAddRoutineBlock() {
  return useBlockMutation(RoutineApi.addBlock, 'Failed to add that block');
}

export function useUpdateRoutineBlock() {
  return useBlockMutation(
    (args: { id: string; patch: Partial<RoutineBlockInput> }) =>
      RoutineApi.updateBlock(args.id, args.patch),
    'Failed to save that block',
  );
}

export function useRemoveRoutineBlock() {
  return useBlockMutation(RoutineApi.removeBlock, 'Failed to remove that block');
}
