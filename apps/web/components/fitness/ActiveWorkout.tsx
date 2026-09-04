'use client';

import { useMemo, useState } from 'react';
import {
  formatVolume,
  groupSetsByExercise,
  summarizeWorkout,
  type ExerciseDTO,
  type WorkoutDTO,
  type WorkoutSummaryDTO,
} from '@atlas/shared';
import { Plus } from 'lucide-react';
import { useExercises, useFinishWorkout, useWorkoutHistory, useWorkoutTemplates } from '@/lib/hooks/fitness';
import { useWeightUnit } from '@/lib/hooks/settings';
import { Button, Card } from '@/components/ui';
import { RestTimer } from '@/components/fitness/RestTimer';
import { elapsed } from './helpers';
import { ExercisePicker } from './ExercisePicker';
import { ExerciseBlock } from './ExerciseBlock';

/** The open session. */
export function ActiveWorkout({
  workout,
  onFinished,
}: {
  workout: WorkoutDTO;
  /** Reported upward: this component unmounts the moment the session ends, so
   *  it cannot be the one holding the summary dialog. */
  onFinished: (summary: WorkoutSummaryDTO, title: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [added, setAdded] = useState<ExerciseDTO[]>([]);
  const [restKey, setRestKey] = useState(0);
  const [skipped, setSkipped] = useState<string[]>([]);
  const finish = useFinishWorkout(workout.id);
  // `Workout.notes` has had a column, a DTO and a place in the finish input
  // since fitness shipped, and no field anywhere ever set it — the same shape
  // as displayName. How a session felt is the part you cannot reconstruct from
  // the numbers, and it was the one thing there was nowhere to put.
  const [notes, setNotes] = useState('');
  const history = useWorkoutHistory();
  const unit = useWeightUnit();
  const templates = useWorkoutTemplates();
  const exercises = useExercises();

  const template =
    templates.data?.find((t) => t.id === workout.templateId) ?? null;

  const groups = useMemo(() => groupSetsByExercise(workout.sets), [workout.sets]);

  /**
   * Blocks that need rendering but have no sets yet: the saved day's movements
   * (so a templated session opens ready to log, not empty), plus anything
   * picked manually. Without this, starting "Push" would show a blank screen
   * and picking an exercise would appear to do nothing.
   */
  const emptyBlocks = useMemo(() => {
    const byId = new Map((exercises.data ?? []).map((e) => [e.id, e]));
    const fromTemplate = (template?.exercises ?? [])
      .map((te) => byId.get(te.exerciseId))
      .filter((e): e is ExerciseDTO => Boolean(e));
    const merged = [...fromTemplate, ...added];
    const seen = new Set<string>();
    return merged.filter((e) => {
      if (seen.has(e.id) || skipped.includes(e.id)) return false;
      if (groups.some((g) => g.exerciseId === e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }, [template, exercises.data, added, groups, skipped]);

  return (
    <>
      <Card className="fit-active" stack>
        <header className="fit-active-head">
          <div>
            <h2 className="fit-active-title">{workout.title}</h2>
            <p className="fit-active-sub">
              {elapsed(workout.startedAt)} · {workout.workingSets} sets ·{' '}
              {formatVolume(workout.volumeGrams, unit)} volume
            </p>
          </div>
          <Button
            variant="ghost"
            disabled={finish.isPending}
            onClick={() => {
              // Snapshot BEFORE finishing: the mutation clears the active
              // workout, and the summary needs the session that just ended.
              const done = { ...workout };
              const past = history.data ?? [];
              finish.mutate(
                notes.trim() ? { notes: notes.trim() } : {},
                {
                  onSuccess: () =>
                    onFinished(
                      summarizeWorkout({ ...done, endedAt: new Date().toISOString() }, past),
                      done.title,
                    ),
                },
              );
            }}
          >
            Finish
          </Button>
        </header>

        <label className="fit-notes">
          <span className="fit-notes-label">How did it go?</span>
          <textarea
            className="fit-notes-input"
            rows={2}
            maxLength={5_000}
            placeholder="Felt heavy, left knee grumbling, bar speed good on the last two…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <RestTimer key={restKey} />
      </Card>

      {groups.map((g) => (
        <ExerciseBlock
          key={g.exerciseId}
          workoutId={workout.id}
          exerciseId={g.exerciseId}
          exerciseName={g.exerciseName}
          kind={g.kind}
          sets={g.sets}
          onLogged={() => setRestKey((k) => k + 1)}
        />
      ))}
      {emptyBlocks.map((e) => (
        <ExerciseBlock
          key={e.id}
          workoutId={workout.id}
          exerciseId={e.id}
          exerciseName={e.name}
          kind={e.kind}
          sets={[]}
          onLogged={() => setRestKey((k) => k + 1)}
          onSkip={() => setSkipped((prev) => [...prev, e.id])}
        />
      ))}

      {picking ? (
        <Card style={{ marginTop: 12 }}>
          <ExercisePicker
            template={template}
            alreadyInWorkout={[
              ...groups.map((g) => g.exerciseId),
              ...emptyBlocks.map((e) => e.id),
            ]}
            onClose={() => setPicking(false)}
            onPick={(e) => {
              setSkipped((prev) => prev.filter((id) => id !== e.id));
              setAdded((prev) => (prev.some((p) => p.id === e.id) ? prev : [...prev, e]));
              setPicking(false);
            }}
          />
        </Card>
      ) : (
        <button type="button" className="fit-add-exercise" onClick={() => setPicking(true)}>
          <Plus size={15} aria-hidden /> Add exercise
        </button>
      )}
    </>
  );
}
