'use client';

import { useMemo, useState } from 'react';
import {
  bestWeightGrams,
  describeSet,
  formatWeight,
  groupSetsByExercise,
  gramsToUnit,
  isPersonalRecord,
  stepFor,
  summarizeWorkout,
  unitToGrams,
  type ExerciseDTO,
  type WorkoutDTO,
  type WorkoutSummaryDTO,
  type WorkoutTemplateDTO,
} from '@atlas/shared';
import { Check, Dumbbell, Plus, Search, Sparkles, Trophy, X } from 'lucide-react';
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
  useWorkoutTemplates,
} from '@/lib/hooks/fitness';
import { useWeightUnit } from '@/lib/hooks/settings';
import { pickerSections, recentExerciseIds } from '@/lib/exercise-order';
import { SplitSetup } from '@/components/fitness/SplitSetup';
import { WorkoutSummaryDialog } from '@/components/fitness/WorkoutSummaryDialog';
import { TrainingProgress } from '@/components/fitness/TrainingProgress';
import { DayBuilder } from '@/components/fitness/DayBuilder';
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

/** Stable "no data yet" identity — see the note in CalendarPanel. */
const NO_EXERCISES: ExerciseDTO[] = [];

/**
 * Nudge a numeric field by `delta`, tolerating an empty or half-typed value.
 * Returns a string because the input is controlled by one.
 */
function bump(value: string, delta: number, min = 0): string {
  const n = Number(value);
  const base = Number.isFinite(n) && value.trim() !== '' ? n : 0;
  const next = Math.max(min, Math.round((base + delta) * 100) / 100);
  return String(next);
}

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
  template,
  alreadyInWorkout,
}: {
  onPick: (exercise: ExerciseDTO) => void;
  onClose: () => void;
  /** The saved day this session came from — its movements go to the top. */
  template: WorkoutTemplateDTO | null;
  alreadyInWorkout: string[];
}) {
  const [query, setQuery] = useState('');
  const exercises = useExercises();
  const history = useWorkoutHistory();
  const create = useCreateExercise();

  const q = query.trim().toLowerCase();
  // A fresh `[]` fallback would change identity on every render and re-run the
  // section memo below, so keep it stable.
  const all = useMemo(() => exercises.data ?? NO_EXERCISES, [exercises.data]);
  const recent = useMemo(() => recentExerciseIds(history.data ?? []), [history.data]);
  const sections = useMemo(
    () =>
      pickerSections({
        exercises: all,
        template,
        recentExerciseIds: recent,
        alreadyInWorkout,
        query,
      }),
    [all, template, recent, alreadyInWorkout, query],
  );
  // Offer to create only when the search genuinely matches nothing.
  const canCreate = q.length > 1 && !all.some((e) => e.name.toLowerCase() === q);

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
          {sections.map((section) => (
            <div key={section.title ?? '_'} className="fit-picker-section">
              {section.title && (
                <p className="fit-picker-heading" role="presentation">
                  {section.title}
                </p>
              )}
              {section.exercises.slice(0, 40).map((e) => (
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
            </div>
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
          {sections.length === 0 && !canCreate && (
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
  onSkip,
}: {
  workoutId: string;
  exerciseId: string;
  exerciseName: string;
  kind: ExerciseDTO['kind'];
  sets: WorkoutDTO['sets'];
  onLogged: () => void;
  /** Present only on a not-yet-started block — lets you drop a movement you
   *  are not doing today without editing the saved day. */
  onSkip?: () => void;
}) {
  const last = useLastPerformance(exerciseId);
  const log = useLogSet(workoutId);
  const removeSet = useDeleteSet(workoutId);
  const unit = useWeightUnit();

  // Seed from this session's most recent set, else last session's, else blank.
  const seed = sets.at(-1) ?? last.data?.sets.at(-1) ?? null;
  const [weight, setWeight] = useState(
    seed?.weightGrams != null ? String(gramsToUnit(seed.weightGrams, unit)) : '',
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
              unit,
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
        ...(needsWeight && parsedWeight !== null
          ? { weightGrams: unitToGrams(parsedWeight, unit) }
          : {}),
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
        {onSkip && sets.length === 0 && (
          <IconButton label={`Skip ${exerciseName} today`} onClick={onSkip}>
            <X size={14} aria-hidden />
          </IconButton>
        )}
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
                <span className="fit-set-body">{describeSet(s, kind, unit)}</span>
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
        {/* Steppers, not just a keypad. Logging mid-set with one thumb and
            chalky hands is the real context: a plate-sized bump is one tap,
            and the field is still there to type into when the jump is odd. */}
        {needsWeight && (
          <label className="fit-field">
            <span>{unit}</span>
            <div className="fit-stepper">
              <button
                type="button"
                aria-label={`Less weight for ${exerciseName}`}
                onClick={() => setWeight(bump(weight, -stepFor(unit)))}
              >
                −
              </button>
              <Input
                type="number"
                inputMode="decimal"
                step={stepFor(unit) / 2}
                min="0"
                aria-label={`Weight in ${unit} for ${exerciseName}`}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <button
                type="button"
                aria-label={`More weight for ${exerciseName}`}
                onClick={() => setWeight(bump(weight, stepFor(unit)))}
              >
                +
              </button>
            </div>
          </label>
        )}
        <label className="fit-field">
          <span>reps</span>
          <div className="fit-stepper">
            <button
              type="button"
              aria-label={`Fewer reps for ${exerciseName}`}
              onClick={() => setReps(bump(reps, -1, 1))}
            >
              −
            </button>
            <Input
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              aria-label={`Reps for ${exerciseName}`}
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />
            <button
              type="button"
              aria-label={`More reps for ${exerciseName}`}
              onClick={() => setReps(bump(reps, 1, 1))}
            >
              +
            </button>
          </div>
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
function ActiveWorkout({
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
              {formatWeight(workout.volumeGrams, unit)} volume
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
                {},
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

/** Finished sessions, newest first. */
function WorkoutHistory() {
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

/** Fallback names, used only until the user has saved days of their own. */
const QUICK_STARTS = ['Push', 'Pull', 'Legs', 'Upper', 'Full body'];

/** "3 days ago" / "today" — how long since a saved day was last trained. */
function sinceLabel(iso: string | null): string {
  if (!iso) return 'not done yet';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return `${Math.floor(days / 7)} weeks ago`;
}

export function FitnessPanel() {
  const active = useActiveWorkout();
  const start = useStartWorkout();
  const history = useWorkoutHistory();
  const templates = useWorkoutTemplates();
  const unit = useWeightUnit();
  // Warm the catalog while the start screen is on show. ActiveWorkout needs it
  // to render a template's movements as blocks, and fetching only on mount
  // meant a templated session appeared empty for a beat before filling in.
  const [title, setTitle] = useState('');
  // Lives here, not in ActiveWorkout: that component unmounts the instant the
  // workout is finished, which would take the summary down with it.
  const [summary, setSummary] = useState<WorkoutSummaryDTO | null>(null);
  const [finishedTitle, setFinishedTitle] = useState('');
  // null = closed; { editing } = the tap-to-build editor; 'paste' = the
  // whole-program text path, kept as the secondary route.
  const [builder, setBuilder] = useState<{ editing: WorkoutTemplateDTO | null } | 'paste' | null>(null);
  const [tab, setTab] = useState<'train' | 'progress'>('train');
  const exercisesQuery = useExercises();

  const workout = active.data ?? null;
  const days = templates.data ?? [];
  // Longest-since-trained first: the useful answer to "what should I do today"
  // is the day you have left the longest, and one never done outranks all.
  const suggested = [...days].sort((a, b) => {
    const at = a.lastPerformedAt ? new Date(a.lastPerformedAt).getTime() : 0;
    const bt = b.lastPerformedAt ? new Date(b.lastPerformedAt).getTime() : 0;
    return at - bt;
  });

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
        <ActiveWorkout
          workout={workout}
          onFinished={(s, t) => {
            setFinishedTitle(t);
            setSummary(s);
          }}
        />
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

          {/* Saved days first: starting one loads its movements as blocks, so
              the session opens ready to log instead of empty. */}
          {suggested.length > 0 ? (
            <div className="fit-quick" role="group" aria-label="Start a saved day">
              {suggested.map((t) => (
                <span key={t.id} className="fit-day-wrap">
                  <button
                    type="button"
                    className="fit-day-chip"
                    disabled={start.isPending}
                    onClick={() => start.mutate({ templateId: t.id })}
                  >
                    <span className="fit-day-name">{t.name}</span>
                    <span className="fit-day-meta">
                      {t.exercises.length} moves · {sinceLabel(t.lastPerformedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="fit-day-edit"
                    aria-label={`Edit ${t.name}`}
                    onClick={() => setBuilder({ editing: t })}
                  >
                    Edit
                  </button>
                </span>
              ))}
            </div>
          ) : (
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
          )}

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="fit-setup-link"
              onClick={() => setBuilder({ editing: null })}
            >
              <Plus size={13} aria-hidden /> New workout day
            </button>
            {/* Secondary: paste a whole program at once. Powerful, but not the
                thing to lead with — nothing on screen teaches the format. */}
            <button type="button" className="fit-setup-link" onClick={() => setBuilder('paste')}>
              <Sparkles size={13} aria-hidden /> Paste a whole split
            </button>
          </div>
        </Card>
      )}

      {!workout && builder !== null && (
        <div style={{ marginTop: 14 }}>
          {builder === 'paste' ? (
            <SplitSetup onDone={() => setBuilder(null)} onCancel={() => setBuilder(null)} />
          ) : (
            <DayBuilder
              editing={builder.editing}
              onDone={() => setBuilder(null)}
              onCancel={() => setBuilder(null)}
            />
          )}
        </div>
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
              set — repeating it or adding a plate is one tap, no typing.
            </li>
            <li>
              <strong>Records that mean something.</strong> A PR only counts when you
              actually beat your best, and warm-ups never inflate it.
            </li>
            <li>
              <strong>Volume in your Progress.</strong> Sessions and total weight
              lifted join the rest of your life stats.
            </li>
          </ul>
        </section>
      )}

      <WorkoutSummaryDialog
        summary={summary}
        title={finishedTitle}
        unit={unit}
        onClose={() => setSummary(null)}
      />

      {!workout && ((history.data?.length ?? 0) > 0 || history.isPending) && (
        <>
          <div className="cal-scope" role="group" aria-label="Training view" style={{ marginTop: 22 }}>
            <button
              type="button"
              className={`cal-scope-btn ${tab === 'train' ? 'on' : ''}`}
              aria-pressed={tab === 'train'}
              onClick={() => setTab('train')}
            >
              Recent sessions
            </button>
            <button
              type="button"
              className={`cal-scope-btn ${tab === 'progress' ? 'on' : ''}`}
              aria-pressed={tab === 'progress'}
              onClick={() => setTab('progress')}
            >
              Progress
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            {tab === 'train' ? (
              <WorkoutHistory />
            ) : (
              <TrainingProgress
                workouts={history.data ?? []}
                exercises={exercisesQuery.data ?? NO_EXERCISES}
                unit={unit}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
