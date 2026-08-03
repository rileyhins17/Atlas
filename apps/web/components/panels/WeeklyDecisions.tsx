'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { describeDecision, weeklyDecisions } from '@atlas/shared';
import { ArrowRight, CalendarPlus, ListChecks, Trash2 } from 'lucide-react';
import { useGoals } from '@/lib/hooks/goals';
import { useDeleteHabit, useHabitHistory, useHabits } from '@/lib/hooks/habits';
import { useRollForward, useSlippedTasks } from '@/lib/hooks/tasks';
import { useToast } from '@/components/ui';

/** Long enough to tell a lapse from a pause. */
const HISTORY_DAYS = 30;

/**
 * The half of the weekly review you can act on.
 *
 * Atlas's written review is a paragraph you read once, and reading changes
 * nothing. This sits above it: two or three computed facts, each with the
 * button that resolves it. The decisions are deterministic rather than parsed
 * out of the model's prose — a button that acts on your data has to be right.
 *
 * Renders nothing when there is nothing to decide, which is the point. A
 * review that always has three chores is one you stop opening.
 */
export function WeeklyDecisions() {
  const slipped = useSlippedTasks();
  const goals = useGoals();
  const habits = useHabits();
  const history = useHabitHistory(HISTORY_DAYS);
  const rollForward = useRollForward();
  const removeHabit = useDeleteHabit();
  const { toast } = useToast();

  const daysSinceHabit = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of history.data ?? []) {
      // The series is oldest-first; the last day with a count is the most
      // recent time it was kept. No count at all means no history to judge.
      let lastIndex = -1;
      row.days.forEach((d, i) => {
        if (d.count > 0) lastIndex = i;
      });
      if (lastIndex >= 0) map.set(row.habitId, row.days.length - 1 - lastIndex);
    }
    return map;
  }, [history.data]);

  const decisions = useMemo(
    () =>
      weeklyDecisions({
        slippedCount: slipped.data?.length ?? 0,
        goals: goals.data ?? [],
        habits: habits.data ?? [],
        daysSinceHabit,
      }),
    [slipped.data, goals.data, habits.data, daysSinceHabit],
  );

  if (decisions.length === 0) return null;

  const slippedIds = (slipped.data ?? []).map((t) => t.id);

  return (
    <section className="wk-decide" aria-label="Decisions for this week">
      <h2 className="wk-decide-head">
        <ListChecks size={13} aria-hidden />
        Worth deciding
      </h2>
      <ul className="wk-decide-list">
        {decisions.map((d) => (
          <li key={d.kind === 'slipped' ? 'slipped' : d.kind === 'habit-stalled' ? d.habitId : d.goalId} className="wk-decide-item">
            <span className="wk-decide-what">{describeDecision(d)}</span>

            {d.kind === 'slipped' && (
              <span className="wk-decide-acts">
                <button
                  type="button"
                  className="wk-act"
                  disabled={rollForward.isPending}
                  onClick={() =>
                    rollForward.mutate(
                      { taskIds: slippedIds, action: 'today' },
                      { onSuccess: () => toast('Moved to today', 'success') },
                    )
                  }
                >
                  <CalendarPlus size={12} aria-hidden />
                  Move to today
                </button>
                <button
                  type="button"
                  className="wk-act quiet"
                  disabled={rollForward.isPending}
                  onClick={() =>
                    rollForward.mutate(
                      { taskIds: slippedIds, action: 'drop' },
                      { onSuccess: () => toast('Dropped', 'info') },
                    )
                  }
                >
                  Not happening
                </button>
              </span>
            )}

            {d.kind === 'habit-stalled' && (
              <span className="wk-decide-acts">
                <button
                  type="button"
                  className="wk-act quiet"
                  disabled={removeHabit.isPending}
                  onClick={() =>
                    removeHabit.mutate(d.habitId, {
                      onSuccess: () => toast(`Removed “${d.name}”`, 'info'),
                    })
                  }
                >
                  <Trash2 size={12} aria-hidden />
                  Remove it
                </button>
                {/* Keeping it needs no write — the point of the row is that
                    you looked at it and chose, not that you clicked. */}
                <Link className="wk-act" href="/habits">
                  Keep it
                  <ArrowRight size={12} aria-hidden />
                </Link>
              </span>
            )}

            {d.kind === 'goal-unbroken' && (
              <span className="wk-decide-acts">
                <Link className="wk-act" href="/goals">
                  Break it down
                  <ArrowRight size={12} aria-hidden />
                </Link>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
