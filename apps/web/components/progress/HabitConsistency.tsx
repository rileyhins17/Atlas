'use client';

import { useHabits, useHabitHistory } from '@/lib/hooks/habits';
import { habitRhythm } from '@/lib/progress';
import { ListSkeleton, ProgressRing, Sparkline } from '@/components/ui';

/** Six is what fits before the card becomes a list you scroll instead of a glance. */
const SHOWN = 6;

/**
 * Per-habit consistency. A grid of squares showed that a habit exists; a hit
 * rate, the live streak and a weekly pulse show whether it is actually holding
 * — which is the only question this card is asked.
 *
 * It runs its own queries rather than taking props: habits and their history
 * are not in the stats rollup, and threading them down from the panel would put
 * two more loading states into a component that has nothing else to do with them.
 */
export function HabitConsistency({ days }: { days: number }) {
  const habits = useHabits();
  // The history endpoint takes 7–366; the range chips can ask for less or more.
  const history = useHabitHistory(Math.min(Math.max(days, 7), 366));

  // "You have no habits" is a claim about the user's life, and `?? []` makes it
  // from a response that has not arrived. On this very page the summary tiles
  // read from the stats rollup, which resolves first — so a screenshot of
  // Looking back showed "3% of days with a habit" directly above "No habits
  // yet". The page contradicted itself, out of an empty array standing in for
  // an unanswered question.
  //
  // It is also invisible to the suite's stuck-loading tripwire, because this
  // renders confident prose while loading rather than a skeleton.
  //
  // Same rule as TodayView's first-run guard: deciding an account is empty is
  // only safe from data you actually received.
  if (habits.isPending) return <ListSkeleton rows={3} />;
  // A failed request is not an empty life. Without this branch the `?? []`
  // below turns a dropped connection into "you have no habits" — the same
  // sentence, from even less information.
  if (habits.isError) {
    return <p className="prog-muted">Could not load your habits just now.</p>;
  }

  const list = habits.data ?? [];
  if (list.length === 0) {
    // Reached only when the server really did say "none".
    return <p className="prog-muted">No habits yet — start one and its consistency charts here.</p>;
  }

  return (
    <div className="prog-habits">
      {list.slice(0, SHOWN).map((h) => {
        const row = history.data?.find((r) => r.habitId === h.id);
        const { rate, weekly } = habitRhythm(row?.days ?? [], h.target || 1, days);
        const pct = Math.round(rate * 100);
        return (
          <div key={h.id} className="prog-habit-row">
            <ProgressRing value={rate} size={38} strokeWidth={4} label={`${h.name}: ${pct}% of days`}>
              <span className="prog-habit-pct">{pct}</span>
            </ProgressRing>
            <div className="prog-habit-meta">
              <span className="prog-habit-name">{h.name}</span>
              <span className="prog-habit-sub">
                {pct}% of days{h.streak > 0 ? ` · ${h.streak}-day streak` : ''}
              </span>
            </div>
            {/* A one-point line is a dot: below two weeks of history there is no
                trend to draw, so the ring and the rate carry the row alone. */}
            {weekly.length >= 2 && (
              <Sparkline
                points={weekly}
                label={`${h.name}: check-ins per week`}
                width={120}
                height={30}
                min={0}
                fill
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
