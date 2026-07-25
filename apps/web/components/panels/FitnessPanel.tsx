'use client';

import { useMemo, useState } from 'react';
import {
  bestWeightGrams,
  describeSet,
  gramsToKg,
  groupSetsByExercise,
  isPersonalRecord,
  kgToGrams,
  type ExerciseDTO,
  type WorkoutDTO,
} from '@atlas/shared';
import { Check, Dumbbell, Plus, Search, Trophy, X } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import {
  useActiveWorkout,
  useCreateExercise,
  useDeleteSet,
  useExercises,
  useFinishWorkout,
  useLastPerformance,
  useLogSet,
  useStartWorkout,
  useWorkoutHistory,
} from '@/lib/hooks/fitness';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  ListSkeleton,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { formatDayHeading } from '@/lib/dates';
import { RestTimer } from '@/components/fitness/RestTimer';

/** Minutes elapsed, rendered as the running clock a session needs. */
function elapsed(startedAt: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

/**
 * Pick a movement. Search-first because the catalog is long and scrolling a
 * list mid-workout is the slowest possible interaction.
 */
function ExercisePicker({
  onPick,
  onClose,
}: {
  onPick: (exercise: ExerciseDTO) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const exercises = useExercises();
  const create = useCreateExercise();

  const q = query.trim().toLowerCase();
  const list = (exercises.data ?? []).filter((e) => e.name.toLowerCase().includes(q));
  // Offer to create only when the search genuinely matches nothing.
  const canCreate =
    q.length > 1 && !list.some((e) => e.name.toLowerCase() === q);

  return (
    <div className="fit-picker">
      <div className="fit-picker-search">
        <Search size={14} aria-hidden />
        <input
          autoFocus
          className="task-search-input"
          type="search"
          placeholder="Search exercises…"
          aria-label="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        />
        <IconButton label="Close exercise picker" onClick={onClose}>
          <X size={15} aria-hidden />
        </IconButton>
      </div>

      {exercises.isPending ? (
        <ListSkeleton rows={4} circle={false} />
      ) : (
        <div className="fit-picker-list" role="listbox" aria-label="Exercises">
          {list.slice(0, 40).map((e) => (
            <button
              key={e.id}
              type="button"
              role="option"
              aria-selected={false}
              className="fit-picker-row"
              onClick={() => onPick(e)}
            >
              <span className="fit-picker-name">{e.name}</span>
              <span className="fit-picker-muscle">{e.muscle}</span>
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              className="fit-picker-row create"
              disabled={create.isPending}
              onClick={() =>
                create.mutate(
                  { name: query.trim(), muscle: 'other', kind: 'weight_reps' },
                  { onSuccess: (created) => onPick(created) },
                )
              }
            >
              <Plus size={13} aria-hidden />
              Add &ldquo;{query.trim()}&rdquo;
            </button>
          )}
          {list.length === 0 && !canCreate && (
            <p className="prog-muted" style={{ padding: '10px 2px' }}>
              No exercises match that.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One exercise inside the open session: what you did last time, the sets logged
 * so far, and the entry row. The entry row is PRE-FILLED from your last set —
 * the overwhelmingly common case is repeating or slightly beating it, so the
 * default action is one tap with no typing at all.
 */
function ExerciseBlock({
  workoutId,
  exerciseId,
  exerciseName,
  kind,
  sets,
  onLogged,
}: {
  workoutId: string;
  exerciseId: string;
  exerciseName: string;
  kind: ExerciseDTO['kind'];
  sets: WorkoutDTO['sets'];
  onLogged: () => void;
}) {
  const last = useLastPerformance(exerciseId);
  const log = useLogSet(workoutId);
  const removeSet = useDeleteSet(workoutId);

  // Seed from this session's most recent set, else last session's, else blank.
  const seed = sets.at(-1) ?? last.data?.sets.at(-1) ?? null;
  const [weight, setWeight] = useState(
    seed?.weightGrams != null ? String(gramsToKg(seed.weightGrams)) : '',
  );
  const [reps, setReps] = useState(seed?.reps != null ? String(seed.reps) : '');
  const [warmup, setWarmup] = useState(false);

  const previousBest = last.data?.bestWeightGrams ?? null;
  const lastLine =
    last.data && last.data.sets.length > 0
      ? last.data.sets
          .map((s) =>
            describeSet(
              {
                ...s,
                id: '',
                exerciseId,
                exerciseName,
                kind,
                position: 0,
                warmup: false,
                completedAt: '',
              },
              kind,
            ),
          )
          .join(' · ')
      : null;

  const needsWeight = kind === 'weight_reps';
  const parsedWeight = weight.trim() === '' ? null : Number(weight);
  const parsedReps = reps.trim() === '' ? null : Number(reps);
  const valid =
    (!needsWeight || (parsedWeight !== null && Number.isFinite(parsedWeight) && parsedWeight >= 0)) &&
    parsedReps !== null &&
    Number.isFinite(parsedReps) &&
    parsedReps > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || log.isPending) return;
    log.mutate(
      {
        exerciseId,
        ...(needsWeight && parsedWeight !== null ? { weightGrams: kgToGrams(parsedWeight) } : {}),
        reps: parsedReps!,
        warmup,
      },
      { onSuccess: onLogged },
    );
  }

  return (
    <section className="fit-block" aria-label={exerciseName}>
      <header className="fit-block-head">
        <h3 className="fit-block-title">{exerciseName}</h3>
        {lastLine && <span className="fit-last">Last: {lastLine}</span>}
      </header>

      {sets.length > 0 && (
        <ol className="fit-sets">
          {sets.map((s, i) => {
            // Compare against everything before it — previous SESSIONS (which
            // is all `previousBest` knows about) *and* the earlier sets of this
            // one. Without the in-session part, a first-ever exercise badges
            // every ascending set as a PR, which is exactly the noise that
            // teaches people to ignore the word.
            const best = bestWeightGrams([...sets.slice(0, i), ...(previousBest === null ? [] : [{ weightGrams: previousBest, reps: 1 }])]);
            const pr = isPersonalRecord(s, best);
            return (
              <li key={s.id} className={`fit-set ${s.warmup ? 'warmup' : ''}`}>
                <span className="fit-set-n">{s.warmup ? 'W' : i + 1}</span>
                <span className="fit-set-body">{describeSet(s, kind)}</span>
                {pr && (
                  <span className="fit-pr" title="Personal record">
                    <Trophy size={11} aria-hidden /> PR
                  </span>
                )}
                <IconButton
                  label={`Remove set ${i + 1} of ${exerciseName}`}
                  onClick={() => removeSet.mutate(s.id)}
                  disabled={removeSet.isPending}
                >
                  <X size={14} aria-hidden />
                </IconButton>
              </li>
            );
          })}
        </ol>
      )}

      <form className="fit-entry" onSubmit={submit}>
        {needsWeight && (
          <label className="fit-field">
            <span>kg</span>
            <Input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              aria-label={`Weight in kg for ${exerciseName}`}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
        )}
        <label className="fit-field">
          <span>reps</span>
          <Input
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            aria-label={`Reps for ${exerciseName}`}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={`fit-warmup ${warmup ? 'on' : ''}`}
          aria-pressed={warmup}
          onClick={() => setWarmup((v) => !v)}
          title="Warm-up sets are excluded from volume and records"
        >
          Warm-up
        </button>
        <Button type="submit" disabled={!valid || log.isPending}>
          <Check size={14} aria-hidden /> Log set
        </Button>
      </form>
    </section>
  );
}

/** The open session. */
function ActiveWorkout({ workout }: { workout: WorkoutDTO }) {
  const [picking, setPicking] = useState(false);
  const [added, setAdded] = useState<ExerciseDTO[]>([]);
  const [restKey, setRestKey] = useState(0);
  const finish = useFinishWorkout(workout.id);

  const groups = useMemo(() => groupSetsByExercise(workout.sets), [workout.sets]);
  // Exercises chosen this session but not yet logged into still need a block,
  // otherwise picking one appears to do nothing.
  const emptyBlocks = added.filter((e) => !groups.some((g) => g.exerciseId === e.id));

  return (
    <>
      <Card className="fit-active" stack>
        <header className="fit-active-head">
          <div>
            <h2 className="fit-active-title">{workout.title}</h2>
            <p className="fit-active-sub">
              {elapsed(workout.startedAt)} · {workout.workingSets} sets ·{' '}
              {gramsToKg(workout.volumeGrams)} kg volume
            </p>
          </div>
          <Button
            variant="ghost"
            disabled={finish.isPending}
            onClick={() => finish.mutate({})}
          >
            Finish
          </Button>
        </header>
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
        />
      ))}

      {picking ? (
        <Card style={{ marginTop: 12 }}>
          <ExercisePicker
            onClose={() => setPicking(false)}
            onPick={(e) => {
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

/** Finished sessions, newest first. */
function WorkoutHistory() {
  const history = useWorkoutHistory();
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
                {gramsToKg(w.volumeGrams)} kg
              </span>
            </header>
            <ul className="fit-history-list">
              {groups.map((g) => (
                <li key={g.exerciseId}>
                  <span className="fit-history-ex">{g.exerciseName}</span>
                  <span className="fit-history-sets">
                    {g.sets
                      .filter((s) => !s.warmup)
                      .map((s) => describeSet(s, g.kind))
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

/** The names people actually use. Tapping one starts the session immediately. */
const QUICK_STARTS = ['Push', 'Pull', 'Legs', 'Upper', 'Full body'];

export function FitnessPanel() {
  const active = useActiveWorkout();
  const start = useStartWorkout();
  const history = useWorkoutHistory();
  const [title, setTitle] = useState('');

  const workout = active.data ?? null;

  return (
    <>
      <PageHeader
        title="Training"
        subtitle={
          workout
            ? 'Session in progress — log each set as you finish it.'
            : 'Log a workout. Atlas keeps every set so you always know what to beat.'
        }
      />

      {active.isPending ? (
        <ListSkeleton rows={3} circle={false} />
      ) : active.isError ? (
        <ErrorState
          message={errorMessage(active.error, 'Failed to load your session')}
          onRetry={() => void active.refetch()}
        />
      ) : workout ? (
        <ActiveWorkout workout={workout} />
      ) : (
        <Card stack className="fit-start">
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (start.isPending) return;
              start.mutate({ title: title.trim() || undefined }, { onSuccess: () => setTitle('') });
            }}
          >
            <Input
              placeholder="Name it (optional)"
              aria-label="Workout name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button type="submit" disabled={start.isPending}>
              <Dumbbell size={15} aria-hidden /> Start
            </Button>
          </form>

          {/* Naming a session is the only decision here, so offer the usual
              answers rather than an empty field and a blinking cursor. */}
          <div className="fit-quick" role="group" aria-label="Quick start">
            {QUICK_STARTS.map((name) => (
              <button
                key={name}
                type="button"
                className="fit-quick-chip"
                disabled={start.isPending}
                onClick={() => start.mutate({ title: name })}
              >
                {name}
              </button>
            ))}
          </div>
        </Card>
      )}

      {!workout && (history.data?.length ?? 0) === 0 && !history.isPending && (
        <section className="fit-pitch" aria-label="What Atlas tracks">
          <h2 className="section-title" style={{ marginTop: 20 }}>
            What you get once you log one
          </h2>
          <ul className="fit-pitch-list">
            <li>
              <strong>Last time, on screen.</strong> Every exercise shows what you
              lifted before, so you are never guessing at the weight.
            </li>
            <li>
              <strong>Sets pre-filled.</strong> The entry row starts from your last
              set — repeating or adding 2.5&nbsp;kg is one tap, no typing.
            </li>
            <li>
              <strong>Records that mean something.</strong> A PR only counts when you
              actually beat your best, and warm-ups never inflate it.
            </li>
            <li>
              <strong>Volume in your Progress.</strong> Sessions and kilograms lifted
              join the rest of your life stats.
            </li>
          </ul>
        </section>
      )}

      {!workout && ((history.data?.length ?? 0) > 0 || history.isPending) && (
        <>
          <h2 className="section-title" style={{ marginTop: 22 }}>
            Recent sessions
          </h2>
          <WorkoutHistory />
        </>
      )}
    </>
  );
}
