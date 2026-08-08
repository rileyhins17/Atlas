'use client';

import { useMemo, useState } from 'react';
import type { StatsDayDTO } from '@atlas/shared';
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react';
import { useStats } from '@/lib/hooks/stats';
import { useHabits, useHabitHistory } from '@/lib/hooks/habits';
import { useGenerateWeeklyReview, useInsights } from '@/lib/hooks/ai';
import {
  bestDay,
  delta,
  formatMinorCompact,
  habitConsistency,
  habitRhythm,
  moodSeries,
  reviewBullets,
  weeklyBuckets,
  type Delta,
} from '@/lib/progress';
import {
  Button,
  EmptyState,
  ErrorState,
  Heatmap,
  ListSkeleton,
  ProgressRing,
  Sparkline,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { WeeklyDecisions } from '@/components/panels/WeeklyDecisions';
import { formatDayHeading } from '@/lib/dates';

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'Year' },
] as const;

/**
 * Render the `**bold**` lead the review prompt asks for. Deliberately the only
 * markdown we honour — a full parser is a dependency and an XSS surface for one
 * emphasis rule.
 */
function renderBold(line: string): React.ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

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

/**
 * Per-habit consistency. A grid of squares showed that a habit exists; a hit
 * rate, the live streak and a weekly pulse show whether it is actually holding
 * — which is the only question this card is asked.
 */
function HabitConsistency({ days }: { days: number }) {
  const habits = useHabits();
  const history = useHabitHistory(Math.min(Math.max(days, 7), 366));

  const list = habits.data ?? [];
  if (list.length === 0) {
    return <p className="prog-muted">No habits yet — start one and its consistency charts here.</p>;
  }

  return (
    <div className="prog-habits">
      {list.slice(0, 6).map((h) => {
        const row = history.data?.find((r) => r.habitId === h.id);
        const { rate, weekly } = habitRhythm(row?.days ?? [], h.target || 1, days);
        const pct = Math.round(rate * 100);
        return (
          <div key={h.id} className="prog-habit-row">
            <ProgressRing value={rate} size={38} strokeWidth={4} label={`${h.name}: ${pct}% of days`}>
              <span className="prog-habit-pct">{pct}</span>
            </ProgressRing>
            <div className="prog-habit-meta">
              <span className="prog-habit-name">{h.name}</span>
              <span className="prog-habit-sub">
                {pct}% of days{h.streak > 0 ? ` · ${h.streak}-day streak` : ''}
              </span>
            </div>
            {weekly.length >= 2 && (
              <Sparkline
                points={weekly}
                label={`${h.name}: check-ins per week`}
                width={120}
                height={30}
                fill
              />
            )}
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
  const writeReview = useGenerateWeeklyReview();

  const data = stats.data;
  const derived = useMemo(() => {
    if (!data) return null;
    return {
      counts: new Map<string, number>(data.days.map((d: StatsDayDTO) => [d.day, d.events])),
      tasksWeekly: weeklyBuckets(data.days, (d) => d.tasksCompleted),
      volumeWeekly: weeklyBuckets(data.days, (d) => Math.round(d.volumeGrams / 1000)),
      habitsWeekly: weeklyBuckets(data.days, (d) => d.habitChecks),
      netWeekly: weeklyBuckets(data.days, (d) => d.earnedMinor - d.spentMinor),
      mood: moodSeries(data.days),
      best: bestDay(data.days),
      consistency: habitConsistency(data.days),
      hasMoney: data.days.some((d) => d.spentMinor > 0 || d.earnedMinor > 0),
      hasTraining: data.totals.current.workouts > 0 || data.totals.previous.workouts > 0,
      anyActivity: data.days.some((d) => d.events > 0),
    };
  }, [data]);

  const review = insights.data?.find((i) => i.kind === 'weekly_review') ?? null;

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
            {derived.hasTraining && (
              <div className="prog-hero-stat">
                <span className="prog-hero-value">{data.totals.current.workouts}</span>
                <span className="prog-hero-label">workouts</span>
              </div>
            )}
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
            {/* Full width only when there is enough history to fill it. Thirty
                days is five columns, and a five-column grid stranded in a
                700px card looked like a chart that had failed to render. */}
            <Card title="Everything, at a glance" hint={`last ${days} days`} wide={days >= 90}>
              <Heatmap
                counts={derived.counts}
                weeks={Math.min(Math.ceil(days / 7), 52)}
                target={5}
                label={`Life activity per day, last ${days} days`}
              />
              <div className="heatmap-key" aria-hidden>
                <span>Quieter</span>
                <i data-level="0" />
                <i data-level="1" />
                <i data-level="2" />
                <i data-level="3" />
                <span>Busier</span>
              </div>
            </Card>

            {/* min={0} because the domain defaults to the series' own minimum:
                a week of zeros drew a straight line through the MIDDLE of the
                card, which reads as a steady nonzero rate. Anchored at zero, a
                flat line sits on the floor and says what it means. */}
            <Card title="Task rhythm" hint="completed per week">
              <Sparkline
                points={derived.tasksWeekly}
                label="Tasks completed per week"
                width={320}
                height={88}
                min={0}
                fill
              />
            </Card>

            <Card title="Habit rhythm" hint="check-ins per week">
              <Sparkline
                points={derived.habitsWeekly}
                label="Habit check-ins per week"
                width={320}
                height={88}
                min={0}
                fill
              />
            </Card>

            {/* Mood pairs with Habit rhythm rather than trailing the wide
                consistency card. The half-width cards have to come in twos or
                one of them ends a row alone next to a hole. */}
            <Card title="Mood" hint="over time">
              {derived.mood.length >= 2 ? (
                // The axis is what makes the line readable: without it a flat
                // stretch at 4 and one at 2 draw identically.
                <div className="prog-mood-chart">
                  <div className="prog-mood-axis" aria-hidden>
                    <span>5</span>
                    <span>4</span>
                    <span>3</span>
                    <span>2</span>
                    <span>1</span>
                  </div>
                  <Sparkline
                    points={derived.mood}
                    min={1}
                    max={5}
                    label="Mood over time, 1 to 5"
                    width={286}
                    height={90}
                  />
                </div>
              ) : (
                <p className="prog-muted">Journal a couple of times to see your mood trend.</p>
              )}
            </Card>

            <Card title="Habit consistency" hint={`last ${days} days`} wide>
              <HabitConsistency days={days} />
            </Card>

            {/* Training, like money, only earns a card once it has real data. */}
            {derived.hasTraining && (
              <Card title="Training volume" hint="kg per week">
                <Sparkline
                  points={derived.volumeWeekly}
                  label="Training volume per week, in kilograms"
                  width={320}
                  height={64}
                  fill
                />
                <p className="prog-muted">
                  {data.totals.current.workouts} session
                  {data.totals.current.workouts === 1 ? '' : 's'} ·{' '}
                  {Math.round(data.totals.current.volumeGrams / 1000).toLocaleString()} kg lifted
                </p>
              </Card>
            )}

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

            {/* Written on a schedule by the proactive engine — but until there
                was a button, a new account (or one with proactive off) had no
                way to ask for one and just saw nothing here. */}
            <Card
              title="Atlas's weekly review"
              hint={review ? formatDayHeading(new Date(review.createdAt)) : undefined}
              wide
            >
              {/* The half you can act on comes FIRST. Atlas's prose is the
                  commentary; these are the decisions, and a review you only
                  read changes nothing. */}
              <WeeklyDecisions />
              {review ? (
                <ul className="prog-review-list">
                  {reviewBullets(review.body).map((line, i) => (
                    <li key={i}>{renderBold(line)}</li>
                  ))}
                </ul>
              ) : (
                <p className="prog-muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
                  Atlas writes one every week. Ask for one now to see where the last seven days
                  actually went.
                </p>
              )}
              <Button
                variant="ghost"
                disabled={writeReview.isPending}
                onClick={() => writeReview.mutate()}
              >
                {writeReview.isPending
                  ? 'Reading your week…'
                  : review
                    ? 'Write a fresh one'
                    : 'Write my weekly review'}
              </Button>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
