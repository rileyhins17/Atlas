'use client';

import type { ComponentType, ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import { ErrorState } from './ErrorState';

/** The parts of a TanStack query this needs. Structural, so it also accepts a fake in tests. */
export interface QueryLike<TData = unknown> {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  /** Present once the query has resolved. Only read by the render-prop forms below. */
  data?: TData;
  refetch: () => unknown;
}

/**
 * A slot that is either a fixed node or one computed from the resolved data.
 * The function form is what lets a surface whose "empty" is a type guard use
 * this at all — see the note on the component.
 */
type Slot<TData> = ReactNode | ((data: TData) => ReactNode);

export interface QueryStateProps<TData> {
  query: QueryLike<TData>;
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
  empty?: Slot<TData>;
  /** Wraps whichever state is shown, for panels whose states sit inside a Card. */
  wrapper?: ComponentType<{ children: ReactNode }>;
  children: Slot<TData>;
}

/** ReactNode is never a function, so the two halves of `Slot` are safe to tell apart at runtime. */
function resolve<TData>(slot: Slot<TData>, data: TData): ReactNode {
  return typeof slot === 'function' ? slot(data) : slot;
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
 * `empty` and `children` also take a function of the resolved data. That form
 * exists for the surfaces where "empty" is a type guard rather than a count —
 * Progress asks `!data || !anyActivity` — because a plain node is evaluated by
 * the caller while `data` is still `T | undefined`, so hoisting the check into
 * a prop would throw away the narrowing the hand-written ternary was doing.
 * Given the data, the content branch gets it non-null and nothing is restated.
 *
 * Order matters and is fixed here deliberately. Error is checked before empty
 * because a failed query has no data, and asking "is it empty" of a result that
 * never arrived reports "nothing here" for what is actually a broken request —
 * the same mistake the first-run wizard made on Today, where it cost an
 * established account its working week.
 */
export function QueryState<TData>({
  query,
  errorFallback,
  skeleton,
  empty,
  wrapper: Wrapper,
  children,
}: QueryStateProps<TData>) {
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

  // Settled, not failed, and still nothing to hand over. TanStack's contract
  // says this cannot happen, so keep waiting rather than invent an answer:
  // claiming "empty" here would be the same lie the error branch above guards.
  const data = query.data;
  if (data === undefined) return wrap(skeleton);

  const emptyNode = resolve(empty, data);
  if (emptyNode) return wrap(emptyNode);
  return <>{resolve(children, data)}</>;
}
