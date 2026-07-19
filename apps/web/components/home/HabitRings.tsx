'use client';

import Link from 'next/link';
import { ArrowRight, Check, Flame } from 'lucide-react';
import { useHabits, useLogHabit } from '@/lib/hooks/habits';
import { EmptyState, ListSkeleton, ProgressRing } from '@/components/ui';

/** Today's habits as tappable progress rings with streak flames. */
export function HabitRings() {
  const habits = useHabits();
  const log = useLogHabit();

  if (habits.isPending) return <ListSkeleton rows={2} />;
  const list = habits.data ?? [];

  if (list.length === 0) {
    return (
      <EmptyState
        icon={Flame}
        title="No habits yet"
        hint="Start a streak — add one on the Habits page."
      />
    );
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="rings-row">
        {list.slice(0, 6).map((h) => {
          const progress = h.target > 0 ? h.todayCount / h.target : 0;
          return (
            <button
              key={h.id}
              type="button"
              className="ring-tile"
              onClick={() => log.mutate(h.id)}
              disabled={log.isPending}
              aria-label={
                h.doneToday
                  ? `${h.name}: done today (${h.todayCount}/${h.target}), ${h.streak} day streak`
                  : `Check in ${h.name} (${h.todayCount}/${h.target} today)`
              }
            >
              <ProgressRing
                value={progress}
                size={54}
                label={`${h.name} progress: ${h.todayCount} of ${h.target}`}
                color={h.doneToday ? 'var(--success-role)' : 'var(--brand)'}
              >
                {h.doneToday ? <Check size={17} aria-hidden /> : `${h.todayCount}/${h.target}`}
              </ProgressRing>
              <span className="ring-tile-name">{h.name}</span>
              {h.streak > 0 && (
                <span className="ring-tile-streak">
                  <Flame size={11} aria-hidden /> {h.streak}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Link href="/habits" className="see-all">
        All habits <ArrowRight size={13} aria-hidden />
      </Link>
    </div>
  );
}
