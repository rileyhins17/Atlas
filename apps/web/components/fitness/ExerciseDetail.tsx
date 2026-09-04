'use client';

import { Trophy } from 'lucide-react';
import {
  describeExercise,
  describeSet,
  estimatedOneRepMax,
  formatVolume,
  formatWeight,
  type ExerciseSessionDTO,
} from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useExerciseHistory } from '@/lib/hooks/fitness';
import { useWeightUnit } from '@/lib/hooks/settings';
import { Dialog, EmptyState, ErrorState, ListSkeleton, Sparkline } from '@/components/ui';
import { formatDayHeading } from '@/lib/dates';

/**
 * One movement, and everything you have done with it.
 *
 * This is the screen a paid workout tracker is actually lived in, and Atlas had
 * no equivalent. The only way to find last week's squat was to scroll a wall of
 * twenty identical session cards, and the strength maths that makes this
 * worth opening — estimated one-rep max, records, the trend — has been sitting
 * in packages/shared since fitness shipped without ever reaching a screen.
 *
 * Four records rather than one headline number, because they answer different
 * questions: the heaviest bar is what you brag about, the best estimated 1RM is
 * what actually tracks strength (100kg x 5 beats 105kg x 1), session volume
 * tracks work done, and most reps is the only one that means anything for
 * chin-ups. A single "personal best" would hide three of them.
 */
export function ExerciseDetail({
  exerciseId,
  fallbackName,
  onClose,
}: {
  exerciseId: string;
  /** Shown as the dialog title until the record arrives, so it never reads "Exercise". */
  fallbackName?: string;
  onClose: () => void;
}) {
  const history = useExerciseHistory(exerciseId);
  const unit = useWeightUnit();

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={history.data?.exercise.name ?? fallbackName ?? 'Exercise'}
      description={history.data ? describeExercise(history.data.exercise) : undefined}
    >
      {history.isPending ? (
        <ListSkeleton rows={4} circle={false} />
      ) : history.isError ? (
        <ErrorState
          message={errorMessage(history.error, 'Could not load this exercise')}
          onRetry={() => void history.refetch()}
        />
      ) : history.data.sessions.length === 0 ? (
        <EmptyState
          title="You have not logged this yet"
          hint="Add it to a session and Atlas starts keeping the record from the first set."
        />
      ) : (
        <>
          <Records data={history.data.records} unit={unit} />
          <StrengthTrend sessions={history.data.sessions} unit={unit} />
          <SessionLog sessions={history.data.sessions} unit={unit} />
        </>
      )}
    </Dialog>
  );
}

function Records({
  data,
  unit,
}: {
  data: NonNullable<ReturnType<typeof useExerciseHistory>['data']>['records'];
  unit: ReturnType<typeof useWeightUnit>;
}) {
  const tiles: { label: string; value: string; hint?: string }[] = [];

  if (data.heaviestGrams !== null) {
    tiles.push({
      label: 'Heaviest',
      value: formatWeight(data.heaviestGrams, unit),
      hint: data.heaviestReps ? `for ${data.heaviestReps}` : undefined,
    });
  }
  if (data.bestE1rmGrams !== null) {
    // Said as an estimate, every time. It is arithmetic on a set you did, not a
    // number you have lifted, and a tracker that blurs the two is lying.
    tiles.push({ label: 'Best est. 1RM', value: formatWeight(data.bestE1rmGrams, unit) });
  }
  if (data.bestSessionVolumeGrams !== null) {
    // Volume, not a weight. Labelled as such and formatted as tonnage, because
    // formatWeight rendered it "83830.8 lb" — which reads as one absurd lift.
    tiles.push({
      label: 'Best session',
      value: formatVolume(data.bestSessionVolumeGrams, unit),
      hint: 'volume',
    });
  }
  if (data.mostReps !== null && data.heaviestGrams === null) {
    // Only for unweighted work: on a barbell "most reps" is a record you set by
    // going lighter, which is not a record.
    tiles.push({ label: 'Most reps', value: String(data.mostReps) });
  }
  tiles.push({ label: 'Sets logged', value: data.totalSets.toLocaleString() });

  return (
    <section className="exd-records" aria-label="Your records">
      {tiles.map((t) => (
        <div key={t.label} className="exd-record">
          <span className="exd-record-v">{t.value}</span>
          <span className="exd-record-l">
            {t.label}
            {t.hint ? ` · ${t.hint}` : ''}
          </span>
        </div>
      ))}
    </section>
  );
}

/**
 * Estimated 1RM over time, oldest to newest.
 *
 * e1RM rather than the weight on the bar, because the bar alone cannot tell a
 * deload from a bad week: 80kg x 8 is stronger than 100kg x 1 and the raw
 * weight says the opposite. Sessions with no weighted work draw nothing rather
 * than a zero, which would put a cliff in the line every time you did a set of
 * chin-ups.
 */
function StrengthTrend({
  sessions,
  unit,
}: {
  sessions: ExerciseSessionDTO[];
  unit: ReturnType<typeof useWeightUnit>;
}) {
  const points = sessions
    .slice()
    .reverse()
    .map((s) => s.bestE1rmGrams)
    .filter((g): g is number => g !== null);

  if (points.length < 2) return null;

  const latest = points[points.length - 1]!;
  const first = points[0]!;
  const change = Math.round(((latest - first) / first) * 100);

  return (
    <section className="exd-trend" aria-label="Estimated one-rep max over time">
      <div className="exd-trend-head">
        <span className="exd-trend-label">Estimated 1RM</span>
        <span className="exd-trend-now">
          {formatWeight(latest, unit)}
          {points.length > 2 && (
            <span className={`exd-trend-delta ${change >= 0 ? 'up' : 'down'}`}>
              {change >= 0 ? '+' : ''}
              {change}%
            </span>
          )}
        </span>
      </div>
      <Sparkline
        points={points}
        label="Estimated one-rep max per session"
        width={320}
        height={72}
        min={0}
        fill
      />
      <p className="exd-trend-foot">
        Across {points.length} sessions · an estimate from your best set each time, not a lift you
        have made.
      </p>
    </section>
  );
}

function SessionLog({
  sessions,
  unit,
}: {
  sessions: ExerciseSessionDTO[];
  unit: ReturnType<typeof useWeightUnit>;
}) {
  return (
    <section className="exd-log" aria-label="Every session">
      {sessions.map((s) => {
        const working = s.sets.filter((set) => !set.warmup);
        const top = working.reduce<{ e1rm: number; label: string } | null>((best, set) => {
          if (set.weightGrams === null || set.reps === null) return best;
          const e1rm = estimatedOneRepMax(set.weightGrams, set.reps);
          if (e1rm === null) return best;
          return !best || e1rm > best.e1rm
            ? { e1rm, label: describeSet(set, set.kind, unit) }
            : best;
        }, null);

        return (
          <article key={s.workoutId} className="exd-session">
            <header className="exd-session-head">
              <span className="exd-session-when">{formatDayHeading(new Date(s.performedAt))}</span>
              <span className="exd-session-meta">
                {working.length} {working.length === 1 ? 'set' : 'sets'}
                {s.volumeGrams > 0 && ` · ${formatVolume(s.volumeGrams, unit)} volume`}
              </span>
            </header>
            <ul className="exd-session-sets">
              {s.sets.map((set) => (
                <li key={set.id} className={set.warmup ? 'warmup' : undefined}>
                  {describeSet(set, set.kind, unit)}
                  {/* The best set of the day, marked. Scanning six numbers for
                      the one that mattered is work the screen should do. */}
                  {top && !set.warmup && describeSet(set, set.kind, unit) === top.label && (
                    <Trophy size={11} aria-label="Best set this session" className="exd-top" />
                  )}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </section>
  );
}
