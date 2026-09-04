'use client';

import { useState } from 'react';
import {
  describeSet,
  formatVolume,
  groupSetsByExercise,
} from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useWorkoutHistory } from '@/lib/hooks/fitness';
import { useWeightUnit } from '@/lib/hooks/settings';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { formatDayHeading } from '@/lib/dates';
import { ExerciseDetail } from './ExerciseDetail';

/** Finished sessions, newest first. */
export function WorkoutHistory() {
  // Which movement's whole history is open. Tapping a name here is the only
  // route into it — before this, the twenty session cards below were the entire
  // record, and "what have I ever squatted" had no answer on any screen.
  const [openExercise, setOpenExercise] = useState<{ id: string; name: string } | null>(null);
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
      {openExercise && (
        <ExerciseDetail
          exerciseId={openExercise.id}
          fallbackName={openExercise.name}
          onClose={() => setOpenExercise(null)}
        />
      )}
      {workouts.map((w) => {
        const groups = groupSetsByExercise(w.sets);
        return (
          <section key={w.id} className="fit-history-row" aria-label={w.title}>
            <header className="fit-history-head">
              <h3 className="fit-block-title">{w.title}</h3>
              <span className="fit-history-when">
                {formatDayHeading(new Date(w.startedAt))} · {w.workingSets} sets ·{' '}
                {formatVolume(w.volumeGrams, unit)}
              </span>
            </header>
            <ul className="fit-history-list">
              {groups.map((g) => (
                <li key={g.exerciseId}>
                  <button
                    type="button"
                    className="fit-history-ex"
                    onClick={() => setOpenExercise({ id: g.exerciseId, name: g.exerciseName })}
                  >
                    {g.exerciseName}
                  </button>
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
