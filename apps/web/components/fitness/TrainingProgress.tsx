'use client';

import { useMemo, useState } from 'react';
import {
  exerciseProgress,
  formatWeight,
  muscleLoad,
  strengthSeries,
  trainingTotals,
  weeklyVolume,
  type ExerciseDTO,
  type WeightUnit,
  type WorkoutDTO,
} from '@atlas/shared';
import { Dumbbell, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { Card, EmptyState, Sparkline } from '@/components/ui';

/** "Jul 21" for a week-of key. */
function weekLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Training progress in the terms a lifter asks about: am I training enough,
 * am I training everything, and is anything going up.
 *
 * All of it is computed from workout history already in the cache, so there is
 * no second source of truth about what you lifted and no extra round-trip.
 */
export function TrainingProgress({
  workouts,
  exercises,
  unit,
}: {
  workouts: WorkoutDTO[];
  exercises: ExerciseDTO[];
  unit: WeightUnit;
}) {
  const [openExercise, setOpenExercise] = useState<string | null>(null);

  const totals = useMemo(() => trainingTotals(workouts), [workouts]);
  const weeks = useMemo(() => weeklyVolume(workouts, 8), [workouts]);
  const muscleOf = useMemo(() => {
    const map = new Map(exercises.map((e) => [e.id, e.muscle]));
    return (id: string) => map.get(id);
  }, [exercises]);
  const muscles = useMemo(() => muscleLoad(workouts, muscleOf, 7), [workouts, muscleOf]);
  const progress = useMemo(() => exerciseProgress(workouts), [workouts]);

  if (totals.sessions === 0) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No finished sessions yet"
        hint="Log one workout and this fills in — volume, muscle balance, and whether each lift is going up."
      />
    );
  }

  const thisWeek = weeks[weeks.length - 1]!;
  const lastWeek = weeks[weeks.length - 2];
  const maxMuscle = muscles[0]?.sets ?? 1;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card stack>
        <div className="wo-stats">
          <div className="wo-stat">
            <span className="wo-stat-n">{totals.sessions}</span>
            <span className="wo-stat-l">sessions</span>
          </div>
          <div className="wo-stat">
            <span className="wo-stat-n">{formatWeight(totals.volumeGrams, unit)}</span>
            <span className="wo-stat-l">lifted</span>
          </div>
          <div className="wo-stat">
            <span className="wo-stat-n">{totals.avgMinutes === null ? '—' : `${totals.avgMinutes}m`}</span>
            <span className="wo-stat-l">avg length</span>
          </div>
        </div>
      </Card>

      <Card stack>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Weekly volume</strong>
          <span className="prog-muted" style={{ fontSize: 12 }}>
            {thisWeek.sessions} {thisWeek.sessions === 1 ? 'session' : 'sessions'} this week
            {lastWeek ? ` · ${lastWeek.sessions} last week` : ''}
          </span>
        </div>
        {/* Empty weeks are real zeroes, not skipped — a chart that hides the
            weeks you missed makes a broken streak look continuous. */}
        <Sparkline
          points={weeks.map((w) => w.volumeGrams)}
          label="Total weight lifted per week over the last eight weeks"
        />
        <div className="tp-weeks" aria-hidden>
          <span>{weekLabel(weeks[0]!.weekOf)}</span>
          <span>{weekLabel(thisWeek.weekOf)}</span>
        </div>
      </Card>

      <Card stack>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Muscles trained</strong>
          <span className="prog-muted" style={{ fontSize: 12 }}>last 7 days</span>
        </div>
        {muscles.length === 0 ? (
          <p className="prog-muted" style={{ margin: 0, fontSize: 13 }}>
            Nothing logged in the last week.
          </p>
        ) : (
          <ul className="tp-muscles">
            {muscles.map((m) => (
              <li key={m.muscle} className="tp-muscle">
                <span className="tp-muscle-name">{m.muscle}</span>
                <span className="tp-muscle-bar" aria-hidden>
                  <span style={{ width: `${Math.round((m.sets / maxMuscle) * 100)}%` }} />
                </span>
                {/* Sets, not volume: volume is dominated by whichever movement
                    is heaviest and would call one deadlift a full leg day. */}
                <span className="tp-muscle-n">{m.sets} sets</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card stack>
        <strong>Every lift</strong>
        <ul className="tp-lifts">
          {progress.map((p) => {
            const open = openExercise === p.exerciseId;
            const series = open ? strengthSeries(workouts, p.exerciseId) : [];
            return (
              <li key={p.exerciseId} className="tp-lift">
                <button
                  type="button"
                  className="tp-lift-head"
                  aria-expanded={open}
                  onClick={() => setOpenExercise(open ? null : p.exerciseId)}
                >
                  <span className="tp-lift-name">
                    {p.name}
                    {p.atBest && p.sessions > 1 && (
                      <Trophy size={11} aria-label="At your best" className="tp-best" />
                    )}
                  </span>
                  <span className="tp-lift-now">
                    {formatWeight(p.latestWeightGrams, unit)} × {p.latestReps}
                  </span>
                  {p.changePct !== null && (
                    <span className={`strength-trend ${p.changePct >= 0 ? 'up' : 'down'}`}>
                      {p.changePct >= 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
                      {p.changePct >= 0 ? '+' : ''}
                      {p.changePct}%
                    </span>
                  )}
                </button>

                {open && (
                  <div className="tp-lift-detail">
                    {series.length >= 2 ? (
                      <>
                        <Sparkline
                          points={series.map((s) => s.e1RM)}
                          label={`Estimated one-rep max for ${p.name}`}
                        />
                        <p className="prog-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                          Best {formatWeight(p.bestE1RM, unit)} estimated max over {p.sessions}{' '}
                          sessions. Estimated from your top set each time, not a max you tested.
                        </p>
                      </>
                    ) : (
                      <p className="prog-muted" style={{ margin: 0, fontSize: 12 }}>
                        One session so far — train it again and the trend appears.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
