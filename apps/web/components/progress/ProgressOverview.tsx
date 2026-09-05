'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { StatsDTO } from '@atlas/shared';
import { deriveProgress, formatMinorCompact } from '@/lib/progress';
import { Sparkline } from '@/components/ui';
import { ActivityCalendar } from './ActivityCalendar';
import { HabitConsistency } from './HabitConsistency';
import { MoodPatterns } from './MoodPatterns';
import { NothingYet, ProgressCard, hasNothing } from './ProgressCard';
import { TrackerTrends } from './TrackerTrends';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { WhatChanged } from './WhatChanged';

/**
 * Progress, once there is something to show.
 *
 * This used to be a grid of eight widgets: four headline tiles, a heatmap with
 * no labels, and six sparklines with no axis, no numbers and no baseline — all
 * drawn in the same up-and-right shape, none of which you could read a value
 * off. It answered "how much did you do?". Nobody opens this page with that
 * question; they open it with "am I doing better or worse, and what should I
 * change?".
 *
 * So it reads top to bottom as an answer:
 *
 *   1. What changed — sentences with numbers, the actionable one first.
 *   2. The calendar — every axis labelled, so a shape becomes information.
 *   3. What your better days have in common — the one thing Atlas can say that
 *      a single-purpose app cannot. It was at the very bottom, under the
 *      decoration.
 *   4. Habits, by name, with their real percentages.
 *   5. The charts, folded away. They are evidence for the sentences above, not
 *      the point of the page, and they only earn their space if asked for.
 */
export function ProgressOverview({ data, days }: { data: StatsDTO; days: number }) {
  const derived = useMemo(() => deriveProgress(data), [data]);
  const [showCharts, setShowCharts] = useState(false);

  return (
    <>
      <WhatChanged data={data} days={days} />

      <ProgressCard title="Your last few weeks" hint={`${days} days`} wide>
        <ActivityCalendar days={data.days} />
      </ProgressCard>

      {/* Unaffected by the range chips on purpose: the server decides how far
          back a correlation may look, so switching to "30 days" must not be
          able to shrink the sample until a coincidence clears the threshold. */}
      <MoodPatterns />

      <ProgressCard title="Habits, one by one" hint={`last ${days} days`} wide>
        <HabitConsistency days={days} />
      </ProgressCard>

      <WeeklyReviewCard />

      <section className="lb-feed" aria-label="Charts">
        <button
          type="button"
          className="ov-disclose"
          aria-expanded={showCharts}
          onClick={() => setShowCharts((v) => !v)}
        >
          <ChevronDown size={14} aria-hidden className={showCharts ? 'open' : undefined} />
          Charts
        </button>

        {showCharts && (
          <div className="prog-grid">
            {/* Every one of these now states its own latest value, because a
                line with no axis is a shape, not a number. */}
            <ProgressCard title="Tasks finished" hint="per week">
              {hasNothing(derived.tasksWeekly) ? (
                <NothingYet>
                  Nothing finished in the last {days} days. Tick one off and this fills in.
                </NothingYet>
              ) : (
                <>
                  <Sparkline
                    points={derived.tasksWeekly}
                    label="Tasks completed per week"
                    width={320}
                    height={88}
                    min={0}
                    fill
                  />
                  <p className="prog-muted">
                    {data.totals.current.tasksCompleted} in {days} days · peak{' '}
                    {Math.max(0, ...derived.tasksWeekly)} in a week
                  </p>
                </>
              )}
            </ProgressCard>

            <ProgressCard title="Habit check-ins" hint="per week">
              {hasNothing(derived.habitsWeekly) ? (
                <NothingYet>
                  No check-ins in the last {days} days. Check one in and this fills in.
                </NothingYet>
              ) : (
                <>
                  <Sparkline
                    points={derived.habitsWeekly}
                    label="Habit check-ins per week"
                    width={320}
                    height={88}
                    min={0}
                    fill
                  />
                  <p className="prog-muted">
                    {data.totals.current.habitChecks} in {days} days · peak{' '}
                    {Math.max(0, ...derived.habitsWeekly)} in a week
                  </p>
                </>
              )}
            </ProgressCard>

            <TrackerTrends />

            <ProgressCard title="Mood" hint="1 to 5, over time">
              {derived.mood.length >= 2 ? (
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
                // Says DAYS, not times: a trend needs two points and the points
                // are days, so three entries this afternoon still make one.
                <p className="prog-muted">Journal on a couple of days to see your mood trend.</p>
              )}
            </ProgressCard>

            {derived.hasTraining && (
              <ProgressCard title="Training volume" hint="kg per week">
                <Sparkline
                  points={derived.volumeWeekly}
                  label="Training volume per week, in kilograms"
                  width={320}
                  height={88}
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

            {derived.hasMoney && (
              <ProgressCard title="Net cash flow" hint="per week">
                {/* Zero kept in frame from BOTH ends: this is the one signed
                    series here, and a week you spent more than you earned has
                    to sit below the line it is judged against. Without it a
                    steady +$400 and a steady -$400 draw the same flat line. */}
                <Sparkline
                  points={derived.netWeekly}
                  label="Net cash flow per week"
                  width={320}
                  height={88}
                  min={Math.min(0, ...derived.netWeekly)}
                  max={Math.max(0, ...derived.netWeekly)}
                />
                <p className="prog-muted">
                  Spent {formatMinorCompact(data.totals.current.spentMinor)} · earned{' '}
                  {formatMinorCompact(data.totals.current.earnedMinor)}
                </p>
              </ProgressCard>
            )}
          </div>
        )}
      </section>
    </>
  );
}
