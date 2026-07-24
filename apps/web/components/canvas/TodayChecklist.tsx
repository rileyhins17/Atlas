'use client';

import Link from 'next/link';
import { Check, Plus, Repeat } from 'lucide-react';
import type { CanvasItem } from '@/lib/canvas';
import { useHabits, useLogHabit } from '@/lib/hooks/habits';
import { useCompleteTask } from '@/lib/hooks/tasks';
import { formatClock } from '@/lib/dates';

/**
 * The one list you tick off today: tasks still due plus today's habits, as
 * plain lines. No rings, no streak flames — that belongs on /habits and
 * /progress. Here it's "check it and move on".
 */
export function TodayChecklist({ checklist }: { checklist: CanvasItem[] }) {
  const habits = useHabits();
  const logHabit = useLogHabit();
  const completeTask = useCompleteTask();

  const openHabits = (habits.data ?? []).filter((h) => !h.doneToday);
  const doneHabits = (habits.data ?? []).filter((h) => h.doneToday);
  const total = checklist.length + openHabits.length;

  if (total === 0 && doneHabits.length === 0) {
    return (
      <p className="ov-empty">
        <Check size={14} aria-hidden />
        Nothing to tick off today.
        <Link href="/habits" className="check-add-link">
          <Plus size={12} aria-hidden /> Track a habit
        </Link>
      </p>
    );
  }

  return (
    <ul className="check-list">
      {checklist.map((item) =>
        item.type === 'task' ? (
          <li key={item.id} className="check-row">
            <button
              type="button"
              className="check-box"
              aria-label={`Complete "${item.title}"`}
              onClick={() => completeTask.mutate(item.taskId)}
            >
              <Check size={13} aria-hidden />
            </button>
            <span className="check-title">{item.title}</span>
            <span className="check-meta">due {formatClock(item.at)}</span>
          </li>
        ) : null,
      )}

      {openHabits.map((h) => (
        <li key={h.id} className="check-row">
          <button
            type="button"
            className="check-box"
            aria-label={`Check in ${h.name} (${h.todayCount}/${h.target} today)`}
            onClick={() => logHabit.mutate(h.id)}
            disabled={logHabit.isPending}
          >
            <Check size={13} aria-hidden />
          </button>
          <span className="check-title">{h.name}</span>
          <span className="check-meta">
            <Repeat size={10} aria-hidden />
            {h.target > 1 ? `${h.todayCount}/${h.target}` : 'daily'}
          </span>
        </li>
      ))}

      {doneHabits.map((h) => (
        <li key={h.id} className="check-row is-done">
          <span className="check-box done" aria-hidden>
            <Check size={13} />
          </span>
          <span className="check-title">{h.name}</span>
          <span className="check-meta">done</span>
        </li>
      ))}
    </ul>
  );
}
