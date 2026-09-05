'use client';

import { MIN_DAYS_FOR_TREND } from '@atlas/shared';
import { useTrackerOverview, useTrackerPatterns } from '@/lib/hooks/trackers';
import { Sparkline } from '@/components/ui';
import { NothingYet, ProgressCard } from './ProgressCard';

/**
 * What the things you rate have been doing.
 *
 * The reason this feature is worth building rather than pointing someone at a
 * symptom-diary app: the ratings sit next to the training, sleep and mood that
 * a standalone tracker never sees. This card is the first half of that — the
 * series itself — and it says nothing beyond what it can count.
 */
export function TrackerTrends() {
  const overview = useTrackerOverview(60);
  const patterns = useTrackerPatterns();
  const rows = overview.data ?? [];
  const linesFor = (id: string) =>
    patterns.data?.trackers.find((t) => t.id === id)?.patterns ?? [];

  // Opt-in. A card explaining a feature nobody has switched on is a nag on a
  // page that already has plenty to say.
  if (overview.isPending || rows.length === 0) return null;

  return (
    <>
      {rows.map(({ tracker, points, sentence }) => (
        <ProgressCard
          key={tracker.id}
          title={`${tracker.emoji ? `${tracker.emoji} ` : ''}${tracker.name}`}
          hint="1 to 10, over time"
        >
          {points.length < 2 ? (
            <NothingYet>
              {points.length === 0
                ? 'Not rated yet. Two days is enough to draw something.'
                : 'One day so far. Rate it again tomorrow and this becomes a line.'}
            </NothingYet>
          ) : (
            <>
              <div className="prog-mood-chart">
                {/* Endpoints only. The axis is laid out with space-between, so
                    a middle label would sit at the visual centre and claim to be
                    5.5 — a mislabelled axis is worse than a sparser one. */}
                <div className="prog-mood-axis" aria-hidden>
                  <span>10</span>
                  <span>1</span>
                </div>
                <Sparkline
                  points={points.map((p) => p.value)}
                  min={1}
                  max={10}
                  label={`${tracker.name} over time, 1 to 10`}
                  width={286}
                  height={90}
                  fill
                />
              </div>
              {/* Null until there is enough to say. "Not enough data to tell"
                  occupying a line is worse than an empty one, because it looks
                  like an answer. */}
              {sentence && <p className="prog-muted">{sentence}</p>}
              {points.length < MIN_DAYS_FOR_TREND && (
                <p className="prog-muted">
                  {MIN_DAYS_FOR_TREND - points.length} more{' '}
                  {MIN_DAYS_FOR_TREND - points.length === 1 ? 'day' : 'days'} before Atlas will
                  call a direction.
                </p>
              )}

              {/* The half a symptom diary cannot do. Rendered only when the
                  counting cleared its bars — an empty list means there was
                  nothing honest to say, not that nothing was checked. */}
              {linesFor(tracker.id).length > 0 && (
                <ul className="trk-patterns">
                  {linesFor(tracker.id).map((p) => (
                    <li key={p.factor}>{p.line}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </ProgressCard>
      ))}
    </>
  );
}
