import type { StatsDTO } from '@atlas/shared';
import { delta, formatMinorCompact, type ProgressDerived } from '@/lib/progress';
import { formatDayHeading } from '@/lib/dates';
import { StatTile } from './StatTile';

/**
 * The period in four numbers, then the three that carry a change chip.
 *
 * Workouts and the busiest day are conditional because a zero is not a neutral
 * fact on a summary band: "0 workouts" in the same row as everything else reads
 * as a rebuke to someone who does not train at all.
 */
export function ProgressSummary({
  data,
  derived,
}: {
  data: StatsDTO;
  derived: ProgressDerived;
}) {
  const { current, previous } = data.totals;
  return (
    <>
      <section className="prog-hero" aria-label="Period summary">
        <div className="prog-hero-stat">
          <span className="prog-hero-value">{current.events}</span>
          <span className="prog-hero-label">things happened</span>
        </div>
        <div className="prog-hero-stat">
          <span className="prog-hero-value">{derived.consistency}%</span>
          <span className="prog-hero-label">of days with a habit</span>
        </div>
        {derived.hasTraining && (
          <div className="prog-hero-stat">
            <span className="prog-hero-value">{current.workouts}</span>
            <span className="prog-hero-label">workouts</span>
          </div>
        )}
        {derived.best && (
          <div className="prog-hero-stat">
            {/* Noon, so the date is read in local time. Parsing "2026-03-08" as
                a bare date makes it UTC midnight, which is the previous evening
                for everyone west of Greenwich — the busiest day would be
                labelled with the wrong one. */}
            <span className="prog-hero-value">
              {formatDayHeading(new Date(`${derived.best.day}T12:00:00`))}
            </span>
            <span className="prog-hero-label">busiest day</span>
          </div>
        )}
      </section>

      <div className="prog-tiles">
        <StatTile
          label="Tasks done"
          value={String(current.tasksCompleted)}
          d={delta(current.tasksCompleted, previous.tasksCompleted)}
        />
        <StatTile
          label="Average mood"
          value={current.moodAvg === null ? '—' : current.moodAvg.toFixed(1)}
          // Mood is a 1–5 average, so whole-number percent change on it would
          // round 3.4 → 3.6 down to nothing. Scaled by ten first, the chip
          // moves when the mood does.
          d={delta(
            Math.round((current.moodAvg ?? 0) * 10),
            Math.round((previous.moodAvg ?? 0) * 10),
          )}
        />
        <StatTile
          label="Spent"
          value={formatMinorCompact(current.spentMinor)}
          d={delta(current.spentMinor, previous.spentMinor)}
          invert
        />
      </div>
    </>
  );
}
