'use client';

import type { ReactNode } from 'react';
import type { WeightUnit } from '@atlas/shared';
import { ErrorState } from '@/components/ui';

interface WeightQuery {
  data?: { weightUnit: WeightUnit };
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
}

export function WeightPreferenceStatus({ query }: { query: WeightQuery }) {
  if (query.isError) return <ErrorState message="Weight units could not be loaded." onRetry={() => void query.refetch()} />;
  if (query.isPending || query.data === undefined) return <p className="prog-muted" role="status">Loading weight units…</p>;
  return null;
}

/** Keep unit-dependent readouts behind the preference they describe. */
export function WeightPreference({ query, children }: { query: WeightQuery; children: (unit: WeightUnit) => ReactNode }) {
  if (query.isPending || query.isError || query.data === undefined) return <WeightPreferenceStatus query={query} />;
  return <>{children(query.data.weightUnit)}</>;
}
