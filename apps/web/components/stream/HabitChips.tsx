'use client';

import Link from 'next/link';
import { Check, Flame, Plus } from 'lucide-react';
import { useHabits, useLogHabit } from '@/lib/hooks/habits';
import { ProgressRing } from '@/components/ui';

/**
 * Today's habits as compact, tappable chips — a small inline ring + name +
 * streak, not a 125px card. One tap checks in (optimistic). Deliberately tiny
 * so the feed below stays the star.
 */
export function HabitChips() {
  const habits = useHabits();
  const log = useLogHabit();

  if (habits.isPending) return null;
  const list = habits.data ?? [];

  if (list.length === 0) {
    return (
      <Link href="/habits" className="habit-chip habit-chip-add">
        <Plus size={13} aria-hidden />
        <span>Track a habit</span>
      </Link>
    );
  }

  return (
    <div className="habit-chips" role="group" aria-label="Today's habits">
      {list.slice(0, 6).map((h) => {
        const progress = h.target > 0 ? h.todayCount / h.target : 0;
        return (
          <button
            key={h.id}
            type="button"
            className={`habit-chip ${h.doneToday ? 'done' : ''}`}
            onClick={() => log.mutate(h.id)}
            disabled={log.isPending}
            aria-label={
              h.doneToday
                ? `${h.name}: done today, ${h.streak} day streak`
                : `Check in ${h.name} (${h.todayCount}/${h.target} today)`
            }
          >
            <span className="habit-chip-ring" aria-hidden>
              <ProgressRing
                value={progress}
                size={20}
                strokeWidth={3}
                label=""
                color={h.doneToday ? 'var(--success-role)' : 'var(--brand)'}
              >
                {h.doneToday ? <Check size={10} aria-hidden /> : null}
              </ProgressRing>
            </span>
            <span className="habit-chip-name">{h.name}</span>
            {h.streak > 0 && (
              <span className="habit-chip-streak">
                <Flame size={10} aria-hidden />
                {h.streak}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
