'use client';

import { useState } from 'react';
import { useStats } from '@/lib/hooks/stats';
import { hasRealActivity } from '@/lib/what-changed';
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
      {/* The heading has to match the nav item that got you here, or the page
          reads as having navigated somewhere else. The subtitle promises only
          what the page delivers: it used to say "how your life is actually
          trending" above six charts with no axis. */}
      <PageHeader title="Progress" subtitle={`What changed in the last ${days} days.`} />

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
        // Gated on what the PERSON did, not on `d.events` — which counts rows
        // Atlas wrote to its own timeline. An account with ninety days of real
        // history was shown "your long arc starts now" because its timeline
        // happened to be empty, and a sync that writes one row instead of two
        // hundred makes a busy month look like a blank one.
        empty={(d) =>
          !hasRealActivity(d.days) && (
            <EmptyState
              title="Nothing to compare yet"
              hint="Finish a task, check in a habit or log how you feel. As soon as there are two periods to put side by side, this page says what changed."
            />
          )
        }
      >
        {(d) => <ProgressOverview data={d} days={days} />}
      </QueryState>
    </div>
  );
}
