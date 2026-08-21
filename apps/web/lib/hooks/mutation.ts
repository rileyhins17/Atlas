'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

/**
 * A write that refreshes one slice of the cache when it succeeds.
 *
 * This shape — mutate, toast via `meta`, invalidate a single key — was written
 * out longhand twenty-three times across the hooks, and `routine.ts` had already
 * grown its own private copy of it (`useBlockMutation`). Two spellings of one
 * idea is how they drift: the interesting part of a write is its mutationFn and
 * which key goes stale, and that was buried in five lines of ceremony every
 * time.
 *
 * Deliberately narrow. Writes that touch several keys, seed the cache with
 * `setQueryData`, or roll back optimistically are left written out in full —
 * they are genuinely different and flattening them into an options bag would
 * hide the part worth reading. Twenty-four hooks still do exactly that.
 *
 * Invalidation matches on key PREFIX, which is load-bearing rather than
 * incidental: `qk.habits` is `['habits']` and `qk.habitHistory(n)` is
 * `['habits','history',n]`, so invalidating the list correctly takes the
 * heatmap with it.
 */
export function useInvalidatingMutation<TData, TVars = void>(options: {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** The query key to invalidate on success — prefix-matched. */
  invalidates: readonly unknown[];
  /** Toasted on success. Omit for writes whose own UI is the feedback. */
  success?: string;
  /** Toasted when the API gives no message of its own. */
  errorFallback?: string;
}): UseMutationResult<TData, Error, TVars> {
  const qc = useQueryClient();
  const { mutationFn, invalidates, success, errorFallback } = options;
  return useMutation({
    mutationFn,
    meta: success || errorFallback ? { success, errorFallback } : undefined,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: invalidates });
    },
  });
}
