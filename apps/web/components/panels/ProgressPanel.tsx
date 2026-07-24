'use client';

import { useMemo, useState } from 'react';
import type { StatsDayDTO } from '@atlas/shared';
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react';
import { useStats } from '@/lib/hooks/stats';
import { useHabits, useHabitHistory } from '@/lib/hooks/habits';
import { useInsights } from '@/lib/hooks/ai';
import {
  bestDay,
  delta,
  formatMinorCompact,
  habitConsistency,
  moodDistribution,
  moodSeries,
  weeklyBuckets,
  type Delta,
} from '@/lib/progress';
import { EmptyState, ErrorState, Heatmap, ListSkeleton, Sparkline } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { formatDayHeading } from '@/lib/dates';

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'Year' },
] as const;

const MOOD_LABELS = ['Rough', 'Low', 'OK', 'Good', 'Great'];

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
}: {
  label: string;
  value: string;
  d: Delta;
  invert?: boolean;
}) {
  return (
    <div className="prog-tile">
      <span className="prog-tile-label">{label}</span>
      <span className="prog-tile-value">{value}</span>
      <DeltaChip d={d} invert={invert} />
    </div>
  );
}

function Card({
  title,
  hint,
  wide,
  children,
}: {
  title: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`prog-card ${wide ? 'wide' : ''}`} aria-label={title}>
      <header className="prog-card-head">
        <h2 className="prog-card-title">{title}</h2>
        {hint && <span className="prog-card-hint">{hint}</span>}
      </header>
      {children}
    </section>
  );
}

/** Per-habit consistency rows — the real "am I keeping this up?" picture. */
function HabitConsistency() {
  const habits = useHabits();
  const history = useHabitHistory(84); // 12 weeks, matching the heatmap width

  const list = habits.data ?? [];
  if (list.length === 0) {
    return <p className="prog-muted">No habits yet — start one and its consistency charts here.</p>;
  }

  return (
    <div className="prog-habits">
      {list.slice(0, 6).map((h) => {
        const row = history.data?.find((r) => r.habitId === h.id);
        const counts = new Map<string, number>((row?.days ?? []).map((d) => [d.day, d.count]));
        return (
          <div key={h.id} className="prog-habit-row">
            <span className="prog-habit-name">{h.name}</span>
            <Heatmap
              counts={counts}
              weeks={12}
              target={h.target || 1}
              label={`${h.name}: last 12 weeks`}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Progress — the long arc across every domain. Headline tiles with deltas vs
 * the previous window, then real per-domain cards in a two-column grid so the
 * page carries information instead of whitespace.
 */
export function ProgressPanel() {
  const [days, setDays] = useState<number>(30);
  const stats = useStats(days);
  const insights = useInsights();

  const data = stats.data;
  const derived = useMemo(() => {
    if (!data) return null;
    return {
      counts: new Map<string, number>(data.days.map((d: StatsDayDTO) => [d.day, d.events])),
      tasksWeekly: weeklyBuckets(data.days, (d) => d.tasksCompleted),
      habitsWeekly: weeklyBuckets(data.days, (d) => d.habitChecks),
      netWeekly: weeklyBuckets(data.days, (d) => d.earnedMinor - d.spentMinor),
      mood: moodSeries(data.days),
      moodDist: moodDistribution(data.days),
      best: bestDay(data.days),
      consistency: habitConsistency(data.days),
      hasMoney: data.days.some((d) => d.spentMinor > 0 || d.earnedMinor > 0),
      anyActivity: data.days.some((d) => d.events > 0),
    };
  }, [data]);

  const review = insights.data?.find((i) => i.kind === 'weekly_review') ?? null;
  const moodMax = derived ? Math.max(1, ...derived.moodDist) : 1;

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
          <section className="prog-hero" aria-label="Period summary">
            <div className="prog-hero-stat">
              <span className="prog-hero-value">{data.totals.current.events}</span>
              <span className="prog-hero-label">things happened</span>
            </div>
            <div className="prog-hero-stat">
              <span className="prog-hero-value">{derived.consistency}%</span>
              <span className="prog-hero-label">of days with a habit</span>
            </div>
            {derived.best && (
              <div className="prog-hero-stat">
                <span className="prog-hero-value">
                  {formatDayHeading(new Date(`${derived.best.day}T12:00:00`))}
                </span>
                <span className="prog-hero-label">busiest day</span>
              </div>
            )}
          </section>

          <div className="prog-tiles">
            <Tile
              label="Tasks done"
              value={String(data.totals.current.tasksCompleted)}
              d={delta(data.totals.current.tasksCompleted, data.totals.previous.tasksCompleted)}
            />
            <Tile
              label="Habit check-ins"
              value={String(data.totals.current.habitChecks)}
              d={delta(data.totals.current.habitChecks, data.totals.previous.habitChecks)}
            />
            <Tile
              label="Average mood"
              value={data.totals.current.moodAvg === null ? '—' : data.totals.current.moodAvg.toFixed(1)}
              d={delta(
                Math.round((data.totals.current.moodAvg ?? 0) * 10),
                Math.round((data.totals.previous.moodAvg ?? 0) * 10),
              )}
            />
            <Tile
              label="Spent"
              value={formatMinorCompact(data.totals.current.spentMinor)}
              d={delta(data.totals.current.spentMinor, data.totals.previous.spentMinor)}
              invert
            />
          </div>

          <div className="prog-grid">
            <Card title="Everything, at a glance" hint={`last ${days} days`} wide>
              <Heatmap
                counts={derived.counts}
                weeks={Math.min(Math.ceil(days / 7), 52)}
                target={5}
                label={`Life activity per day, last ${days} days`}
              />
            </Card>

            <Card title="Task rhythm" hint="completed per week">
              <Sparkline
                points={derived.tasksWeekly}
                label="Tasks completed per week"
                width={320}
                height={64}
                fill
              />
            </Card>

            <Card title="Habit rhythm" hint="check-ins per week">
              <Sparkline
                points={derived.habitsWeekly}
                label="Habit check-ins per week"
                width={320}
                height={64}
                fill
              />
            </Card>

            <Card title="Habit consistency" hint="last 12 weeks" wide>
              <HabitConsistency />
            </Card>

            <Card title="Mood" hint="1–5 over time">
              {derived.mood.length >= 2 ? (
                <Sparkline points={derived.mood} min={1} max={5} label="Mood over time" width={320} height={64} />
              ) : (
                <p className="prog-muted">Journal a couple of times to see your mood trend.</p>
              )}
              <div className="prog-mood-dist" aria-label="Mood distribution">
                {derived.moodDist.map((count, i) => (
                  <div key={MOOD_LABELS[i]} className="prog-mood-col">
                    <div
                      className="prog-mood-bar"
                      style={{ height: `${Math.round((count / moodMax) * 100)}%` }}
                      aria-hidden
                    />
                    <span className="prog-mood-label">{MOOD_LABELS[i]}</span>
                    <span className="prog-mood-count">{count}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Money only earns a card once there IS money data — no zero-filled noise. */}
            {derived.hasMoney && (
              <Card title="Net cash flow" hint="per week">
                <Sparkline points={derived.netWeekly} label="Net cash flow per week" width={320} height={64} />
                <p className="prog-muted">
                  Spent {formatMinorCompact(data.totals.current.spentMinor)} · earned{' '}
                  {formatMinorCompact(data.totals.current.earnedMinor)}
                </p>
              </Card>
            )}

            {/* The weekly review has been getting written all along and never shown. */}
            {review && (
              <Card title="Atlas's weekly review" hint={formatDayHeading(new Date(review.createdAt))} wide>
                <p className="prog-review">{review.body}</p>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
