'use client';

import { useMemo } from 'react';
import type { StatsDTO } from '@atlas/shared';
import { deriveProgress, formatMinorCompact } from '@/lib/progress';
import { Heatmap, Sparkline } from '@/components/ui';
import { HabitConsistency } from './HabitConsistency';
import { ProgressCard } from './ProgressCard';
import { ProgressSummary } from './ProgressSummary';
import { WeeklyReviewCard } from './WeeklyReviewCard';

/**
 * The Progress page once there is something to show. Takes the resolved stats
 * response, so every value below is non-null without a guard: the panel decides
 * whether there is a window worth plotting, and this decides what it looks like.
 */
export function ProgressOverview({ data, days }: { data: StatsDTO; days: number }) {
  const derived = useMemo(() => deriveProgress(data), [data]);

  return (
    <>
      <ProgressSummary data={data} derived={derived} />

      <div className="prog-grid">
        {/* Full width only when there is enough history to fill it. Thirty days
            is five columns, and a five-column grid stranded in a 700px card
            looked like a chart that had failed to render. */}
        <ProgressCard title="Everything, at a glance" hint={`last ${days} days`} wide={days >= 90}>
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
        </ProgressCard>

        {/* min={0} because the domain defaults to the series' own minimum: a
            week of zeros drew a straight line through the MIDDLE of the card,
            which reads as a steady nonzero rate. Anchored at zero, a flat line
            sits on the floor and says what it means. */}
        <ProgressCard title="Task rhythm" hint="completed per week">
          <Sparkline
            points={derived.tasksWeekly}
            label="Tasks completed per week"
            width={320}
            height={88}
            min={0}
            fill
          />
        </ProgressCard>

        <ProgressCard title="Habit rhythm" hint="check-ins per week">
          <Sparkline
            points={derived.habitsWeekly}
            label="Habit check-ins per week"
            width={320}
            height={88}
            min={0}
            fill
          />
        </ProgressCard>

        {/* Mood pairs with Habit rhythm rather than trailing the wide
            consistency card. The half-width cards have to come in twos or one
            of them ends a row alone next to a hole. */}
        <ProgressCard title="Mood" hint="over time">
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
        </ProgressCard>

        <ProgressCard title="Habit consistency" hint={`last ${days} days`} wide>
          <HabitConsistency days={days} />
        </ProgressCard>

        {/* Training, like money, only earns a card once it has real data. */}
        {derived.hasTraining && (
          <ProgressCard title="Training volume" hint="kg per week">
            <Sparkline
              points={derived.volumeWeekly}
              label="Training volume per week, in kilograms"
              width={320}
              height={64}
              min={0}
              fill
            />
            <p className="prog-muted">
              {data.totals.current.workouts} session
              {data.totals.current.workouts === 1 ? '' : 's'} ·{' '}
              {Math.round(data.totals.current.volumeGrams / 1000).toLocaleString()} kg lifted
            </p>
          </ProgressCard>
        )}

        {/* Money only earns a card once there IS money data — no zero-filled noise. */}
        {derived.hasMoney && (
          <ProgressCard title="Net cash flow" hint="per week">
            {/* Zero is kept in frame from BOTH ends, rather than pinned as the
                floor: this is the one signed series here, and a week you spent
                more than you earned has to be able to sit below the line it is
                being judged against. Without it, a steady +$400 and a steady
                -$400 draw the identical flat line. */}
            <Sparkline
              points={derived.netWeekly}
              label="Net cash flow per week"
              width={320}
              height={64}
              min={Math.min(0, ...derived.netWeekly)}
              max={Math.max(0, ...derived.netWeekly)}
            />
            <p className="prog-muted">
              Spent {formatMinorCompact(data.totals.current.spentMinor)} · earned{' '}
              {formatMinorCompact(data.totals.current.earnedMinor)}
            </p>
          </ProgressCard>
        )}

        <WeeklyReviewCard />
      </div>
    </>
  );
}
