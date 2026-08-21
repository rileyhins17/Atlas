'use client';

import { useState } from 'react';
import { useStats } from '@/lib/hooks/stats';
import { hasActivity } from '@/lib/progress';
import { EmptyState, ListSkeleton, QueryState } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { ProgressOverview } from '@/components/progress/ProgressOverview';

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'Year' },
] as const;

/**
 * Progress — the long arc across every domain. This owns the range and the four
 * states; the numbers themselves are `deriveProgress` (pure, tested) and the
 * page they make is `ProgressOverview`, which only ever sees a resolved window.
 */
export function ProgressPanel() {
  const [days, setDays] = useState<number>(30);
  const stats = useStats(days);

  return (
    <div className="stream">
      {/* The nav says "Looking back" and /progress redirects here, so the page
          must say it too — a destination whose heading disagrees with the item
          you clicked reads as having navigated somewhere else. */}
      <PageHeader title="Looking back" subtitle="How your life is actually trending." />

      <div className="filter-chips" role="group" aria-label="Range">
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            className={`chip ${days === r.days ? 'active' : ''}`}
            aria-pressed={days === r.days}
            onClick={() => setDays(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* "Empty" here is a question about the response, not a row count the
          caller already has — hence the function form, which hands the same
          resolved window to both branches. */}
      <QueryState
        query={stats}
        errorFallback="Couldn't load your progress."
        skeleton={<ListSkeleton rows={4} circle={false} />}
        empty={(d) =>
          !hasActivity(d.days) && (
            <EmptyState
              title="Your long arc starts now"
              hint="As you complete tasks, check in habits, journal and spend, the trends chart themselves here."
            />
          )
        }
      >
        {(d) => <ProgressOverview data={d} days={days} />}
      </QueryState>
    </div>
  );
}
