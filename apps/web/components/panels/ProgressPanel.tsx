'use client';

import { useMemo, useState } from 'react';
import type { StatsDayDTO } from '@atlas/shared';
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react';
import { useStats } from '@/lib/hooks/stats';
import { delta, formatMinorCompact, moodSeries, weeklyBuckets, type Delta } from '@/lib/progress';
import { EmptyState, ErrorState, Heatmap, ListSkeleton, Sparkline } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'Year' },
] as const;

function DeltaChip({ d, invert = false }: { d: Delta; invert?: boolean }) {
  if (d.direction === 'flat') {
    return (
      <span className="prog-delta flat">
        <Minus size={11} aria-hidden /> same
      </span>
    );
  }
  if (d.direction === 'new') {
    return (
      <span className="prog-delta up">
        <Sparkles size={11} aria-hidden /> new
      </span>
    );
  }
  // For spend, "down" is the good direction.
  const good = invert ? d.direction === 'down' : d.direction === 'up';
  const Icon = d.direction === 'up' ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`prog-delta ${good ? 'up' : 'down'}`}>
      <Icon size={11} aria-hidden /> {Math.abs(d.pct ?? 0)}%
    </span>
  );
}

function Tile({
  label,
  value,
  d,
  invert,
  children,
}: {
  label: string;
  value: string;
  d: Delta;
  invert?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="prog-tile">
      <span className="prog-tile-label">{label}</span>
      <span className="prog-tile-value">{value}</span>
      <DeltaChip d={d} invert={invert} />
      {children}
    </div>
  );
}

/**
 * Progress — the long arc across every domain: headline tiles with deltas vs
 * the previous window, an overall-activity heatmap, and weekly trend lines.
 * Scannable numbers, no walls of text.
 */
export function ProgressPanel() {
  const [days, setDays] = useState<number>(30);
  const stats = useStats(days);

  const data = stats.data;
  const derived = useMemo(() => {
    if (!data) return null;
    const counts = new Map<string, number>(data.days.map((d: StatsDayDTO) => [d.day, d.events]));
    return {
      counts,
      tasksWeekly: weeklyBuckets(data.days, (d) => d.tasksCompleted),
      habitsWeekly: weeklyBuckets(data.days, (d) => d.habitChecks),
      netWeekly: weeklyBuckets(data.days, (d) => d.earnedMinor - d.spentMinor),
      mood: moodSeries(data.days),
      anyActivity: data.days.some((d) => d.events > 0),
    };
  }, [data]);

  return (
    <div className="stream">
      <PageHeader title="Progress" subtitle="How your life is trending, across everything." />

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

      {stats.isPending ? (
        <ListSkeleton rows={4} circle={false} />
      ) : stats.isError ? (
        <ErrorState message="Couldn't load your progress." onRetry={() => stats.refetch()} />
      ) : !data || !derived || !derived.anyActivity ? (
        <EmptyState
          title="Your long arc starts now"
          hint="As you complete tasks, check in habits, journal and spend, the trends chart themselves here."
        />
      ) : (
        <>
          <div className="prog-tiles">
            <Tile
              label="Tasks done"
              value={String(data.totals.current.tasksCompleted)}
              d={delta(data.totals.current.tasksCompleted, data.totals.previous.tasksCompleted)}
            >
              <Sparkline points={derived.tasksWeekly} label="Tasks completed per week" width={120} height={28} fill />
            </Tile>
            <Tile
              label="Habit check-ins"
              value={String(data.totals.current.habitChecks)}
              d={delta(data.totals.current.habitChecks, data.totals.previous.habitChecks)}
            >
              <Sparkline points={derived.habitsWeekly} label="Habit check-ins per week" width={120} height={28} fill />
            </Tile>
            <Tile
              label="Average mood"
              value={data.totals.current.moodAvg === null ? '—' : data.totals.current.moodAvg.toFixed(1)}
              d={delta(
                Math.round((data.totals.current.moodAvg ?? 0) * 10),
                Math.round((data.totals.previous.moodAvg ?? 0) * 10),
              )}
            >
              {derived.mood.length >= 2 && (
                <Sparkline points={derived.mood} min={1} max={5} label="Mood over time" width={120} height={28} />
              )}
            </Tile>
            <Tile
              label="Spent"
              value={formatMinorCompact(data.totals.current.spentMinor)}
              d={delta(data.totals.current.spentMinor, data.totals.previous.spentMinor)}
              invert
            >
              <Sparkline points={derived.netWeekly} label="Net cash flow per week" width={120} height={28} />
            </Tile>
          </div>

          <section className="prog-section" aria-label="Overall activity">
            <h2 className="section-title" style={{ marginTop: 4 }}>
              Everything, at a glance
            </h2>
            <Heatmap
              counts={derived.counts}
              weeks={Math.min(Math.ceil(days / 7), 52)}
              target={5}
              label={`Life activity per day, last ${days} days`}
            />
          </section>
        </>
      )}
    </div>
  );
}
