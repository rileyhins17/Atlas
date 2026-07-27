'use client';

import { useMemo, useState } from 'react';
import {
  formatWeight,
  strengthSeries,
  strengthTrendPct,
  type WeightUnit,
  type WorkoutDTO,
} from '@atlas/shared';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, EmptyState, Sparkline } from '@/components/ui';
import { Dumbbell } from 'lucide-react';

/**
 * Progressive overload, per movement.
 *
 * Plots estimated 1RM rather than top-set weight: 185×5 and 205×1 are close to
 * the same effort, so a weight-only chart would call a heavy single progress
 * when it was not. e1RM puts every session on one scale, which is the only way
 * a trend line means anything.
 *
 * Computed from workout history already in the cache — no extra endpoint, and
 * no second source of truth about what your best lift was.
 */
export function StrengthTracker({
  workouts,
  unit,
}: {
  workouts: WorkoutDTO[];
  unit: WeightUnit;
}) {
  // Movements you have actually trained more than once, most-trained first —
  // a one-session movement has no trend to show.
  const tracked = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; sessions: number }>();
    for (const w of workouts) {
      const seen = new Set<string>();
      for (const s of w.sets) {
        if (s.warmup || s.weightGrams == null || seen.has(s.exerciseId)) continue;
        seen.add(s.exerciseId);
        const hit = byId.get(s.exerciseId);
        if (hit) hit.sessions += 1;
        else byId.set(s.exerciseId, { id: s.exerciseId, name: s.exerciseName, sessions: 1 });
      }
    }
    return [...byId.values()].filter((e) => e.sessions >= 2).sort((a, b) => b.sessions - a.sessions);
  }, [workouts]);

  const [selected, setSelected] = useState<string | null>(null);
  const activeId = selected ?? tracked[0]?.id ?? null;

  const points = useMemo(
    () => (activeId ? strengthSeries(workouts, activeId) : []),
    [workouts, activeId],
  );
  const trend = strengthTrendPct(points);
  const latest = points[points.length - 1] ?? null;
  const best = points.reduce<number>((m, p) => Math.max(m, p.e1RM), 0);

  if (tracked.length === 0) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No strength trend yet"
        hint="Log the same movement in two sessions and Atlas will start tracking whether it is going up."
      />
    );
  }

  return (
    <Card stack>
      <div className="strength-picker" role="group" aria-label="Movement">
        {tracked.slice(0, 8).map((e) => (
          <button
            key={e.id}
            type="button"
            className={`strength-chip ${activeId === e.id ? 'on' : ''}`}
            aria-pressed={activeId === e.id}
            onClick={() => setSelected(e.id)}
          >
            {e.name}
          </button>
        ))}
      </div>

      {points.length < 2 ? (
        <p className="prog-muted" style={{ margin: 0, fontSize: 13 }}>
          Only one session logged with a usable working set — one more and the trend appears.
        </p>
      ) : (
        <>
          <div className="strength-head">
            <div>
              <span className="strength-now">{formatWeight(best, unit)}</span>
              <span className="strength-label">best estimated max</span>
            </div>
            {trend !== null && (
              <span className={`strength-trend ${trend >= 0 ? 'up' : 'down'}`}>
                {trend >= 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
                {trend >= 0 ? '+' : ''}
                {trend}%
              </span>
            )}
          </div>

          <Sparkline points={points.map((p) => p.e1RM)} label="Estimated one-rep max over your last sessions" />

          <p className="prog-muted" style={{ margin: 0, fontSize: 12 }}>
            {points.length} sessions
            {latest
              ? ` · last: ${formatWeight(latest.weightGrams, unit)} × ${latest.reps}`
              : ''}
            {/* Say what the number is, so nobody reads it as a lift they did. */}
            {' · estimated from your best set each session, not a max you tested.'}
          </p>
        </>
      )}
    </Card>
  );
}
