'use client';

import { useState } from 'react';
import { bestWeightGrams, describeSet, gramsToUnit, isPersonalRecord, stepFor, unitToGrams, type ExerciseDTO, type WorkoutDTO } from '@atlas/shared';
import { Check, Trophy, X } from 'lucide-react';
import { useDeleteSet, useLastPerformance, useLogSet } from '@/lib/hooks/fitness';
import { useWeightUnit } from '@/lib/hooks/settings';
import { Button, IconButton, Input } from '@/components/ui';

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


/**
 * One exercise inside the open session: what you did last time, the sets logged
 * so far, and the entry row. The entry row is PRE-FILLED from your last set —
 * the overwhelmingly common case is repeating or slightly beating it, so the
 * default action is one tap with no typing at all.
 */
export function ExerciseBlock({
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
        {/* Deliberately a div, NOT a label. A <label> forwards a click anywhere
            inside it to its first labelable descendant — which here was the
            "−" button, not the input. So tapping the weight field to type in it
            fired a decrement instead: the box filled with "0" and your digits
            landed after it, giving 0185 for 185. The inputs carry their own
            aria-label, so nothing is lost by dropping the wrapper. */}
        {needsWeight && (
          <div className="fit-field">
            <span aria-hidden>{unit}</span>
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
          </div>
        )}
        <div className="fit-field">
          <span aria-hidden>reps</span>
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
        </div>
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
