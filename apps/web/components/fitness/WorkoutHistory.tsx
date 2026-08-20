'use client';

import { describeSet, formatWeight, groupSetsByExercise } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useWorkoutHistory } from '@/lib/hooks/fitness';
import { useWeightUnit } from '@/lib/hooks/settings';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { formatDayHeading } from '@/lib/dates';

/** Finished sessions, newest first. */
export function WorkoutHistory() {
  const history = useWorkoutHistory();
  const unit = useWeightUnit();
  const workouts = history.data ?? [];

  if (history.isPending) return <ListSkeleton rows={3} circle={false} />;
  if (history.isError) {
    return (
      <ErrorState
        message={errorMessage(history.error, 'Failed to load workouts')}
        onRetry={() => void history.refetch()}
      />
    );
  }
  if (workouts.length === 0) {
    return (
      <EmptyState
        title="No workouts yet"
        hint="Start one above — Atlas remembers what you lifted so you always know what to beat."
      />
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      {workouts.map((w) => {
        const groups = groupSetsByExercise(w.sets);
        return (
          <section key={w.id} className="fit-history-row" aria-label={w.title}>
            <header className="fit-history-head">
              <h3 className="fit-block-title">{w.title}</h3>
              <span className="fit-history-when">
                {formatDayHeading(new Date(w.startedAt))} · {w.workingSets} sets ·{' '}
                {formatWeight(w.volumeGrams, unit)}
              </span>
            </header>
            <ul className="fit-history-list">
              {groups.map((g) => (
                <li key={g.exerciseId}>
                  <span className="fit-history-ex">{g.exerciseName}</span>
                  <span className="fit-history-sets">
                    {g.sets
                      .filter((s) => !s.warmup)
                      .map((s) => describeSet(s, g.kind, unit))
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
