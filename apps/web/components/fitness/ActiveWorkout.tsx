'use client';

import { useMemo, useState } from 'react';
import {
  formatVolume,
  groupIntoRounds,
  groupSetsByExercise,
  restStartsAfter,
  summarizeWorkout,
  supersetLabel,
  type ExerciseDTO,
  type ExerciseKind,
  type WorkoutDTO,
  type WorkoutSetDTO,
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

/** One movement on screen, with its place in the day and its logged sets. */
interface Block {
  exerciseId: string;
  exerciseName: string;
  kind: ExerciseKind;
  /** Shared with its neighbours when they are a superset. */
  supersetGroup: number | null;
  sets: WorkoutSetDTO[];
  /** From the saved day, rather than added mid-session. */
  planned: boolean;
}

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
   * Every block this session shows, in the order it is meant to be done.
   *
   * The saved day leads, so a templated session opens in its planned order and
   * STAYS there — building the list out of logged sets first meant the screen
   * quietly reshuffled itself as you worked, which also made a superset
   * impossible to draw. Anything logged or picked that the day does not know
   * about follows, ungrouped, because it was decided mid-session.
   */
  const blocks = useMemo<Block[]>(() => {
    const byId = new Map((exercises.data ?? []).map((e) => [e.id, e]));
    const setsFor = new Map(groups.map((g) => [g.exerciseId, g]));
    const out: Block[] = [];
    const seen = new Set<string>();

    const push = (
      exerciseId: string,
      name: string,
      kind: ExerciseKind,
      supersetGroup: number | null,
      planned: boolean,
    ) => {
      if (seen.has(exerciseId) || skipped.includes(exerciseId)) return;
      seen.add(exerciseId);
      out.push({
        exerciseId,
        exerciseName: name,
        kind,
        supersetGroup,
        sets: setsFor.get(exerciseId)?.sets ?? [],
        planned,
      });
    };

    for (const te of template?.exercises ?? []) {
      const ex = byId.get(te.exerciseId);
      if (ex) push(ex.id, ex.name, ex.kind, te.supersetGroup, true);
    }
    // Logged but not planned — the exercise name comes off the set itself, so
    // this still renders while the catalog query is in flight.
    for (const g of groups) push(g.exerciseId, g.exerciseName, g.kind, null, false);
    for (const e of added) push(e.id, e.name, e.kind, null, false);
    return out;
  }, [template, exercises.data, added, groups, skipped]);

  /** Supersets: consecutive blocks sharing a group are one round. */
  const rounds = useMemo(() => groupIntoRounds(blocks), [blocks]);

  /**
   * Rest begins after the ROUND, not after every set. Inside a superset the
   * whole point is that you do not rest between the movements, so a timer
   * counting down while you are still working is worse than none.
   */
  const logged = (exerciseId: string) => {
    if (restStartsAfter(rounds, exerciseId)) setRestKey((k) => k + 1);
  };

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

      {rounds.map((round) => {
        const body = round.members.map((b) => (
          <ExerciseBlock
            key={b.exerciseId}
            workoutId={workout.id}
            exerciseId={b.exerciseId}
            exerciseName={b.exerciseName}
            kind={b.kind}
            sets={b.sets}
            onLogged={() => logged(b.exerciseId)}
            {...(b.sets.length === 0 ? { onSkip: () => setSkipped((p) => [...p, b.exerciseId]) } : {})}
          />
        ));
        if (round.group === null) return body;
        return (
          <section
            key={`ss-${round.group}`}
            className="fit-superset"
            aria-label={supersetLabel(round.group)}
          >
            <p className="fit-superset-head">
              {supersetLabel(round.group)}
              <span className="fit-superset-hint">no rest between these</span>
            </p>
            {body}
          </section>
        );
      })}

      {picking ? (
        <Card style={{ marginTop: 12 }}>
          <ExercisePicker
            template={template}
            alreadyInWorkout={blocks.map((b) => b.exerciseId)}
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
