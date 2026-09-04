'use client';

import { useState } from 'react';
import {
  RPE_CHOICES,
  SET_TYPES,
  SET_TYPE_LABELS,
  SET_TYPE_MARKS,
  describeEffort,
  describePlates,
  describeRecord,
  formatRpe,
  platesFor,
  describeSet,
  exerciseRecords,
  gramsToUnit,
  recordsBrokenBy,
  stepFor,
  unitToGrams,
  type ExerciseDTO,
  type SetType,
  type WeightUnit,
  type WorkoutDTO,
} from '@atlas/shared';
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
  // What KIND of set, rather than a warm-up boolean. A drop set and a set taken
  // to failure are both work and both different from an ordinary one, and a
  // tracker that cannot say which knows less than the person using it.
  const [setType, setSetType] = useState<SetType>('normal');
  // How hard it was. Two sets of 100kg x 5 are not the same session if one was
  // comfortable and the other was everything you had — that difference is the
  // signal a programme is steered by, and Atlas recorded none of it.
  const [rpe, setRpe] = useState<number | null>(null);
  const [showPlates, setShowPlates] = useState(false);

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
                setType: 'normal',
                rpe: null,
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
        setType,
        warmup: setType === 'warmup',
        rpe,
      },
      {
        onSuccess: () => {
          // Both reset. Effort and kind belong to the set they were logged
          // with, and a control left armed writes a value nobody chose onto the
          // next one — a set silently recorded as "to failure" because it was
          // tapped three sets ago is wrong data, and wrong data is worse than
          // one more tap. Carrying the type would suit drop sets, which come in
          // runs; it is not worth the class of error it opens.
          setRpe(null);
          setSetType('normal');
          onLogged();
        },
      },
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
            // Compared against everything BEFORE this set — previous sessions
            // (all `previousBest` knows) plus the earlier sets of this one.
            // Without the in-session half, a first-ever exercise badges every
            // ascending set, which is the noise that teaches people to ignore
            // the word.
            //
            // Four records rather than one, so the badge can say WHICH: the
            // heaviest bar and the best estimated 1RM are different
            // achievements, and 100kg x 5 beating 105kg x 1 is the whole reason
            // to estimate at all.
            const before = exerciseRecords([
              { sets: previousBest === null ? [] : [{ weightGrams: previousBest, reps: 1, warmup: false }] },
              { sets: sets.slice(0, i) },
            ]);
            const claim = describeRecord(recordsBrokenBy(s, before));
            return (
              <li key={s.id} className={`fit-set ${s.warmup ? 'warmup' : ''}`}>
                <span className="fit-set-n" title={SET_TYPE_LABELS[s.setType]}>
                  {SET_TYPE_MARKS[s.setType] || i + 1}
                </span>
                <span className="fit-set-body">
                  {describeSet(s, kind, unit)}
                  {s.rpe !== null && (
                    <span className="fit-set-rpe">{describeEffort(s.rpe)}</span>
                  )}
                </span>
                {claim && (
                  <span className="fit-pr" title={claim}>
                    <Trophy size={11} aria-hidden /> {claim === 'Heaviest ever' ? 'PR' : claim}
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
        <Button type="submit" disabled={!valid || log.isPending}>
          <Check size={14} aria-hidden /> Log set
        </Button>
      </form>

      <div className="fit-opts">
        <div className="fit-chips" role="group" aria-label={`Set type for ${exerciseName}`}>
          {SET_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${setType === t ? 'active' : ''}`}
              aria-pressed={setType === t}
              title={
                t === 'warmup' ? 'Warm-ups are excluded from volume and records' : undefined
              }
              onClick={() => setSetType(setType === t && t !== 'normal' ? 'normal' : t)}
            >
              {SET_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Optional, and silent when unused. A required effort field turns every
            set into a small exam; a null RPE means "not recorded", which is not
            the same as easy. */}
        <div className="fit-chips" role="group" aria-label={`How hard for ${exerciseName}`}>
          <span className="fit-opts-label">RPE</span>
          {RPE_CHOICES.map((r) => (
            <button
              key={r}
              type="button"
              className={`chip ${rpe === r ? 'active' : ''}`}
              aria-pressed={rpe === r}
              title={describeEffort(r)}
              onClick={() => setRpe(rpe === r ? null : r)}
            >
              {formatRpe(r)}
            </button>
          ))}
        </div>

        {needsWeight && parsedWeight !== null && parsedWeight > 0 && (
          <div className="fit-plates">
            <button
              type="button"
              className="fit-plates-toggle"
              aria-expanded={showPlates}
              onClick={() => setShowPlates((v) => !v)}
            >
              What goes on the bar?
            </button>
            {showPlates && <PlateHint target={parsedWeight} unit={unit} />}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * What to actually put on the bar.
 *
 * The one piece of arithmetic a lifter does under fatigue, and getting it wrong
 * means a set logged at a weight that was never on the bar — which quietly
 * poisons every record and trend built on it. It reports a weight the gym
 * cannot make rather than rounding to one that never existed.
 */
function PlateHint({ target, unit }: { target: number; unit: WeightUnit }) {
  const load = platesFor(target, unit);

  if (load.belowBar) {
    return <p className="fit-plates-out">That is under an empty {unit === 'kg' ? '20kg' : '45lb'} bar.</p>;
  }

  return (
    <p className="fit-plates-out">
      <strong>{describePlates(load.perSide, unit)}</strong> per side
      {load.shortfallBy !== 0 && (
        <span className="fit-plates-short">
          {' '}
          — makes {load.achievable}
          {unit}, {load.shortfallBy > 0 ? `${load.shortfallBy}${unit} short` : 'over'}
        </span>
      )}
    </p>
  );
}
