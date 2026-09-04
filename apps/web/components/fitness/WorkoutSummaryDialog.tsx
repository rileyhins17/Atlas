'use client';

import {
  formatVolume,
  formatWeight,
  type WeightUnit,
  type WorkoutSummaryDTO,
} from '@atlas/shared';
import { Trophy } from 'lucide-react';
import { Button, Dialog } from '@/components/ui';

/** "1h 02m" — a session length reads better than "62 min". */
function duration(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

/**
 * What you get for finishing.
 *
 * The moment a session ends is the only one where you are guaranteed to be
 * paying attention, so it is the right place to show what you actually did.
 * Every number here is earned rather than decorative: no confetti for showing
 * up, no PR badge unless something was genuinely beaten, and the volume
 * comparison is against your last session of the SAME name so "Push" is judged
 * against Push.
 */
export function WorkoutSummaryDialog({
  summary,
  title,
  unit,
  onClose,
}: {
  summary: WorkoutSummaryDTO | null;
  title: string;
  unit: WeightUnit;
  onClose: () => void;
}) {
  if (!summary) return null;
  const { prCount, volumeDeltaPct } = summary;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={`${title} — done`}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="wo-stats">
          <div className="wo-stat">
            <span className="wo-stat-n">{duration(summary.durationMin)}</span>
            <span className="wo-stat-l">time</span>
          </div>
          <div className="wo-stat">
            <span className="wo-stat-n">{summary.workingSets}</span>
            <span className="wo-stat-l">sets</span>
          </div>
          <div className="wo-stat">
            <span className="wo-stat-n">{formatVolume(summary.volumeGrams, unit)}</span>
            <span className="wo-stat-l">lifted</span>
          </div>
        </div>

        {prCount > 0 && (
          <p className="wo-pr">
            <Trophy size={15} aria-hidden />
            {prCount === 1 ? 'A new personal record' : `${prCount} new personal records`}
          </p>
        )}

        {/* Only shown when there is a real previous session to compare with —
            a made-up "+100%" on your first Push means nothing. */}
        {volumeDeltaPct !== null && (
          <p className="wo-delta">
            {volumeDeltaPct > 0
              ? `${volumeDeltaPct}% more volume than your last ${title}.`
              : volumeDeltaPct < 0
                ? `${Math.abs(volumeDeltaPct)}% less volume than last time — deload or a shorter session.`
                : `Same volume as your last ${title}.`}
          </p>
        )}

        <ul className="wo-list">
          {summary.exercises.map((e) => (
            <li key={e.exerciseId} className="wo-row">
              <span className="wo-row-name">{e.name}</span>
              <span className="wo-row-best">
                {e.bestWeightGrams != null && e.bestReps != null
                  ? `${formatWeight(e.bestWeightGrams, unit)} × ${e.bestReps}`
                  : `${e.sets} ${e.sets === 1 ? 'set' : 'sets'}`}
              </span>
              {e.isPr && (
                <span className="fit-pr">
                  <Trophy size={11} aria-hidden /> PR
                </span>
              )}
            </li>
          ))}
        </ul>

        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}
