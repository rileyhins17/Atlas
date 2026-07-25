'use client';

import { useMemo, useState } from 'react';
import { CalendarPlus, Trash2 } from 'lucide-react';
import type { TaskDTO } from '@atlas/shared';
import { useRollForward, useSlippedTasks } from '@/lib/hooks/tasks';
import { formatDue, localDayKey } from '@/lib/dates';

const DISMISS_KEY = 'atlas.slipped.dismissed';

/** Dismissal lasts for the day, not forever — tomorrow it asks again. */
function dismissedToday(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === localDayKey(new Date());
  } catch {
    // Private mode or a blocked store: worst case the card shows again.
    return false;
  }
}

/**
 * What didn't happen, answered in one go.
 *
 * Overdue lists are where task apps go to die: things pile up until the list
 * stops describing anything real and the user stops reading it. The fix isn't a
 * better sort order, it's a small forced decision — move it to today, or admit
 * it isn't happening. Both answers are recorded, because "I keep dropping this"
 * is exactly the signal Atlas should learn from, and dropping archives rather
 * than completes so it never inflates a statistic.
 */
export function SlippedTasks() {
  const slipped = useSlippedTasks();
  const roll = useRollForward();
  const [dismissed, setDismissed] = useState(dismissedToday);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());

  const tasks = useMemo(() => slipped.data ?? [], [slipped.data]);
  const chosen = tasks.filter((t) => !excluded.has(t.id));

  if (dismissed || tasks.length === 0) return null;

  const apply = (action: 'today' | 'drop') => {
    if (chosen.length === 0) return;
    roll.mutate(
      { taskIds: chosen.map((t) => t.id), action },
      // Clear the deselections afterwards. Anything left behind is a fresh
      // decision — keeping it unchecked leaves the card showing one task with
      // both buttons dead and no explanation for why.
      { onSuccess: () => setExcluded(new Set()) },
    );
  };

  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="ov-block slipped" aria-label="Unfinished work">
      <header className="slipped-head">
        <h2 className="ov-title">
          {tasks.length === 1 ? "1 thing didn't happen" : `${tasks.length} things didn't happen`}
        </h2>
        <button
          type="button"
          className="slipped-later"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, localDayKey(new Date()));
            } catch {
              // Not being able to remember the dismissal is survivable.
            }
            setDismissed(true);
          }}
        >
          Not now
        </button>
      </header>

      <ul className="slipped-list">
        {tasks.map((t: TaskDTO) => {
          const on = !excluded.has(t.id);
          return (
            <li key={t.id}>
              <label className="slipped-item">
                <input type="checkbox" checked={on} onChange={() => toggle(t.id)} />
                <span className={`slipped-title ${on ? '' : 'off'}`}>{t.title}</span>
                {t.dueAt && <span className="slipped-when">{formatDue(new Date(t.dueAt))}</span>}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="slipped-actions">
        <button
          type="button"
          className="slipped-move"
          disabled={roll.isPending || chosen.length === 0}
          onClick={() => apply('today')}
        >
          <CalendarPlus size={14} aria-hidden />
          Move {chosen.length} to today
        </button>
        <button
          type="button"
          className="slipped-drop"
          disabled={roll.isPending || chosen.length === 0}
          onClick={() => apply('drop')}
        >
          <Trash2 size={14} aria-hidden />
          Not doing {chosen.length === 1 ? 'it' : 'them'}
        </button>
      </div>
    </section>
  );
}
