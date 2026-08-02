'use client';

import { useEffect, useRef, useState } from 'react';
import { Target } from 'lucide-react';
import { useGoals } from '@/lib/hooks/goals';
import { useUpdateTask } from '@/lib/hooks/tasks';

/**
 * The goal a task serves, shown and changed where the work actually is.
 *
 * Goals could only ever gain tasks created from inside the goal, which meant
 * the ordinary case — you already wrote the task down, and only later realised
 * what it was for — had no path at all. So this sits on the row itself.
 *
 * Linked reads as a chip, because the point of the link is to see it while you
 * work. Unlinked is a quiet icon that appears with the row's other actions, so
 * a list of unlinked tasks stays a list of tasks rather than a wall of prompts.
 */
export function TaskGoalChip({
  taskId,
  goalId,
  compact = false,
}: {
  taskId: string;
  goalId: string | null;
  compact?: boolean;
}) {
  const goals = useGoals();
  const update = useUpdateTask();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  const all = goals.data ?? [];
  const linked = goalId ? (all.find((g) => g.id === goalId) ?? null) : null;

  // Active goals are the ones worth offering. A goal that is already achieved
  // or dropped stays visible when this task is on it, so nothing silently
  // loses its link, but it is not something to newly attach work to.
  const choices = all.filter((g) => g.status === 'active');

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(next: string | null) {
    setOpen(false);
    if (next === goalId) return;
    update.mutate({ id: taskId, patch: { goalId: next } });
  }

  // Nothing to link to and nothing linked: stay out of the way entirely rather
  // than advertising a feature that would open an empty menu.
  if (!linked && (compact || choices.length === 0)) return null;

  return (
    <span className="task-goal" ref={wrap}>
      <button
        type="button"
        className={linked ? 'task-goal-chip' : 'task-goal-add'}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={linked ? `Goal: ${linked.title} — change` : 'Link this task to a goal'}
        title={linked ? `Toward: ${linked.title}` : 'Link to a goal'}
        onClick={() => setOpen((v) => !v)}
      >
        <Target size={11} aria-hidden />
        {linked && <span className="task-goal-name">{linked.title}</span>}
      </button>

      {open && (
        <div className="task-goal-menu">
          {choices.length === 0 ? (
            <p className="task-goal-empty">No active goals yet.</p>
          ) : (
            <ul>
              {choices.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={g.id === goalId ? 'on' : ''}
                    onClick={() => choose(g.id)}
                  >
                    <span className="task-goal-opt">{g.title}</span>
                    <span className="task-goal-horizon">{g.horizon}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {linked && (
            <button type="button" className="task-goal-clear" onClick={() => choose(null)}>
              Remove from goal
            </button>
          )}
        </div>
      )}
    </span>
  );
}
