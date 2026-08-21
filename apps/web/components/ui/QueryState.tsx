'use client';

import type { ComponentType, ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import { ErrorState } from './ErrorState';

/** The parts of a TanStack query this needs. Structural, so it also accepts a fake in tests. */
export interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

export interface QueryStateProps {
  query: QueryLike;
  /** Shown when the API gives no message of its own. */
  errorFallback: string;
  /** Whatever this surface shows while loading — usually a ListSkeleton. */
  skeleton: ReactNode;
  /**
   * Rendered instead of children when the result is empty. Pass the condition
   * with it (`items.length === 0 && <EmptyState … />`) so each surface decides
   * what "empty" means — some have several lists, some show a composer beside
   * the empty state.
   */
  empty?: ReactNode;
  /** Wraps whichever state is shown, for panels whose states sit inside a Card. */
  wrapper?: ComponentType<{ children: ReactNode }>;
  children: ReactNode;
}

/**
 * Loading, error, empty, content — in that order, once.
 *
 * CLAUDE.md requires all four states of every feature, and fourteen components
 * were spelling the same four-branch ternary out by hand. Duplicating a rule is
 * how it gets partially applied: the retry button, the `errorMessage` fallback
 * and the ordering were re-derived every time, and a surface that quietly
 * skipped a branch looked exactly like one that did not.
 *
 * NOT for every surface. Where "empty" is a type guard rather than a count —
 * ProgressPanel's `!data || !derived` — the hand-written ternary is doing real
 * work: it narrows those values to non-null for the content branch. Moving the
 * condition into a prop throws that narrowing away, and the choice is then
 * between losing the type safety or restating the check inside the children.
 * Those surfaces keep the ternary; this is for the common `items.length === 0`
 * case, which is most of them.
 *
 * Order matters and is fixed here deliberately. Error is checked before empty
 * because a failed query has no data, and asking "is it empty" of a result that
 * never arrived reports "nothing here" for what is actually a broken request —
 * the same mistake the first-run wizard made on Today, where it cost an
 * established account its working week.
 */
export function QueryState({
  query,
  errorFallback,
  skeleton,
  empty,
  wrapper: Wrapper,
  children,
}: QueryStateProps) {
  const wrap = (node: ReactNode) => (Wrapper ? <Wrapper>{node}</Wrapper> : <>{node}</>);

  if (query.isPending) return wrap(skeleton);
  if (query.isError) {
    return wrap(
      <ErrorState
        message={errorMessage(query.error, errorFallback)}
        onRetry={() => void query.refetch()}
      />,
    );
  }
  if (empty) return wrap(empty);
  return <>{children}</>;
}
