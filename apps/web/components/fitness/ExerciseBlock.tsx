'use client';

import { useState } from 'react';
import {
  RPE_CHOICES,
  SET_MEASURES,
  SET_MEASURE_LABELS,
  SET_TYPES,
  SET_TYPE_LABELS,
  SET_TYPE_MARKS,
  describeEffort,
  describePlates,
  describeRecord,
  formatRpe,
  measuresIn,
  metersToKm,
  platesFor,
  primaryMeasures,
  describeSet,
  exerciseRecords,
  gramsToUnit,
  recordsBrokenBy,
  secondsToClock,
  stepFor,
  type ExerciseDTO,
  type SetMeasure,
  type SetType,
  type WeightUnit,
  type WorkoutDTO,
} from '@atlas/shared';
import { Check, ChevronDown, Trophy, X } from 'lucide-react';
import { useDeleteSet, useLastPerformance, useLogSet } from '@/lib/hooks/fitness';
import { useWeightUnit } from '@/lib/hooks/settings';
import { resolveSetEntry } from '@/lib/set-entry';
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
  // `kind` picks the boxes the form opens with; every other measure is one tap away under "Also log".
  const primary = primaryMeasures(kind);
  const offered = kind === 'weight_reps' ? [] : SET_MEASURES.filter((m) => !primary.includes(m));
  const [weight, setWeight] = useState(
    seed?.weightGrams != null ? String(gramsToUnit(seed.weightGrams, unit)) : '',
  );
  const [reps, setReps] = useState(seed?.reps != null ? String(seed.reps) : '');
  const seedClock = seed?.durationSec != null ? secondsToClock(seed.durationSec) : null;
  const [durMin, setDurMin] = useState(seedClock ? String(seedClock.min) : '');
  const [durSec, setDurSec] = useState(seedClock ? String(seedClock.sec) : '');
  const [distanceKm, setDistanceKm] = useState(
    seed?.distanceM != null ? String(metersToKm(seed.distanceM)) : '',
  );
  // Seeded from the last set, so a weighted pull-up stays weighted.
  const [extras, setExtras] = useState<SetMeasure[]>(() =>
    seed ? measuresIn(seed).filter((m) => !primary.includes(m)) : [],
  );
  // What KIND of set, rather than a warm-up boolean. A drop set and a set taken
  // to failure are both work and both different from an ordinary one, and a
  // tracker that cannot say which knows less than the person using it.
  const [setType, setSetType] = useState<SetType>('normal');
  // How hard it was. Two sets of 100kg x 5 are not the same session if one was
  // comfortable and the other was everything you had — that difference is the
  // signal a programme is steered by, and Atlas recorded none of it.
  const [rpe, setRpe] = useState<number | null>(null);
  const [showPlates, setShowPlates] = useState(false);
  // Set type and effort are optional and used on a minority of sets, so they
  // fold behind one line instead of putting sixteen chips under every
  // exercise. Anything chosen keeps them open: an armed control is never
  // hidden.
  const [showOpts, setShowOpts] = useState(false);
  const optsChosen = setType !== 'normal' || rpe !== null;
  const optsOpen = showOpts || optsChosen;

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

  const shown = SET_MEASURES.filter((m) => primary.includes(m) || extras.includes(m));
  const has = (m: SetMeasure) => shown.includes(m);

  const { valid, measurements } = resolveSetEntry(
    kind,
    shown,
    { weight, reps, minutes: durMin, seconds: durSec, km: distanceKm },
    unit,
  );

  // Plate arithmetic is for a loaded bar, so only a weight-and-reps lift gets it.
  const plateTarget =
    kind === 'weight_reps' && weight.trim() !== '' && Number(weight) > 0 ? Number(weight) : null;

  function toggleExtra(measure: SetMeasure) {
    setExtras((prev) => (prev.includes(measure) ? prev.filter((m) => m !== measure) : [...prev, measure]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || log.isPending) return;
    log.mutate(
      {
        exerciseId,
        ...measurements,
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

      {/* noValidate: native step checks silently refused real values (187 lb on a 2.5 step); resolveSetEntry decides. */}
      <form className="fit-entry" onSubmit={submit} noValidate>
        {/* Steppers, not just a keypad. Logging mid-set with one thumb and
            chalky hands is the real context: a plate-sized bump is one tap,
            and the field is still there to type into when the jump is odd. */}
        {/* Deliberately a div, NOT a label. A <label> forwards a click anywhere
            inside it to its first labelable descendant — which here was the
            "−" button, not the input. So tapping the weight field to type in it
            fired a decrement instead: the box filled with "0" and your digits
            landed after it, giving 0185 for 185. The inputs carry their own
            aria-label, so nothing is lost by dropping the wrapper. */}
        {has('weight') && (
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
        {has('reps') && (
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
        )}
        {/* Duration is two fields, not a clock string; clockToSeconds recombines them and tolerates seconds past 59. */}
        {has('time') && (
          <>
            <div className="fit-field">
              <span aria-hidden>min</span>
              <div className="fit-stepper">
                <button
                  type="button"
                  aria-label={`Fewer minutes for ${exerciseName}`}
                  onClick={() => setDurMin(bump(durMin, -1, 0))}
                >
                  −
                </button>
                <Input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  aria-label={`Minutes for ${exerciseName}`}
                  value={durMin}
                  onChange={(e) => setDurMin(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={`More minutes for ${exerciseName}`}
                  onClick={() => setDurMin(bump(durMin, 1, 0))}
                >
                  +
                </button>
              </div>
            </div>
            <div className="fit-field">
              <span aria-hidden>sec</span>
              <div className="fit-stepper">
                <button
                  type="button"
                  aria-label={`Fewer seconds for ${exerciseName}`}
                  onClick={() => setDurSec(bump(durSec, -15, 0))}
                >
                  −
                </button>
                <Input
                  type="number"
                  inputMode="numeric"
                  step="15"
                  min="0"
                  aria-label={`Seconds for ${exerciseName}`}
                  value={durSec}
                  onChange={(e) => setDurSec(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={`More seconds for ${exerciseName}`}
                  onClick={() => setDurSec(bump(durSec, 15, 0))}
                >
                  +
                </button>
              </div>
            </div>
          </>
        )}
        {/* Distance is entered in km and stored in whole metres (kmToMeters); 0.1 km is the useful step. */}
        {has('distance') && (
          <div className="fit-field">
            <span aria-hidden>km</span>
            <div className="fit-stepper">
              <button
                type="button"
                aria-label={`Less distance for ${exerciseName}`}
                onClick={() => setDistanceKm(bump(distanceKm, -0.1, 0))}
              >
                −
              </button>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                aria-label={`Distance in km for ${exerciseName}`}
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
              />
              <button
                type="button"
                aria-label={`More distance for ${exerciseName}`}
                onClick={() => setDistanceKm(bump(distanceKm, 0.1, 0))}
              >
                +
              </button>
            </div>
          </div>
        )}
        <Button type="submit" disabled={!valid || log.isPending}>
          <Check size={14} aria-hidden /> Log set
        </Button>
      </form>

      <div className="fit-opts">
        {/* The measures this movement is not filed under; absent on a weight × reps lift. */}
        {offered.length > 0 && (
          <div className="fit-chips" role="group" aria-label={`Also log for ${exerciseName}`}>
            <span className="fit-opts-label">Also log</span>
            {offered.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${extras.includes(m) ? 'active' : ''}`}
                aria-pressed={extras.includes(m)}
                onClick={() => toggleExtra(m)}
              >
                {SET_MEASURE_LABELS[m]}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="fit-opts-toggle"
          aria-expanded={optsOpen}
          // Cannot be closed while a choice is armed — see optsOpen.
          disabled={optsChosen}
          onClick={() => setShowOpts((v) => !v)}
        >
          <ChevronDown size={15} aria-hidden className={optsOpen ? 'open' : ''} />
          {optsChosen
            ? [setType !== 'normal' ? SET_TYPE_LABELS[setType] : null, rpe !== null ? `RPE ${formatRpe(rpe)}` : null]
                .filter(Boolean)
                .join(' · ')
            : 'Set type & effort'}
        </button>
        {optsOpen && (
        <>
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
        </>
        )}

        {plateTarget !== null && (
          <div className="fit-plates">
            <button
              type="button"
              className="fit-plates-toggle"
              aria-expanded={showPlates}
              onClick={() => setShowPlates((v) => !v)}
            >
              What goes on the bar?
            </button>
            {showPlates && <PlateHint target={plateTarget} unit={unit} />}
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
