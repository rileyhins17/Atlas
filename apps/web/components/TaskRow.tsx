'use client';

import { useEffect, useRef, useState } from 'react';
import { describeRrule, durationKey, formatDuration, type TaskDTO } from '@atlas/shared';
import { Check, Flag, Repeat, X } from 'lucide-react';
import {
  useCompleteTask,
  useDeleteTask,
  useTaskDurations,
  useUpdateTask,
} from '@/lib/hooks/tasks';
import { IconButton, Badge } from '@/components/ui';
import { TaskGoalChip } from '@/components/TaskGoalChip';
import { formatDue } from '@/lib/dates';

const PRIORITY_ORDER: TaskDTO['priority'][] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

/**
 * The rich task row: complete-check, priority dot (click to cycle), inline
 * title edit (click or `e`), warm due chip, tags, quiet delete on hover.
 */
export function TaskRow({ task, compact = false }: { task: TaskDTO; compact?: boolean }) {
  const complete = useCompleteTask();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const durations = useTaskDurations();
  const done = task.status === 'DONE';
  const usual = durations.data?.get(durationKey(task.title));
  const repeat = describeRrule(task.recurrence);
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const overdue = !done && due !== null && due.getTime() < Date.now();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function saveTitle() {
    const title = draft.trim();
    setEditing(false);
    if (title && title !== task.title) update.mutate({ id: task.id, patch: { title } });
    else setDraft(task.title);
  }

  function cyclePriority() {
    const next =
      PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(task.priority) + 1) % PRIORITY_ORDER.length];
    update.mutate({ id: task.id, patch: { priority: next } });
  }

  return (
    <div className={`task ${done ? 'done' : ''}`}>
      <button
        className="check"
        aria-label={done ? `Completed "${task.title}"` : `Complete "${task.title}"`}
        disabled={done || complete.isPending}
        onClick={() => complete.mutate(task.id)}
      >
        <Check size={14} strokeWidth={3} aria-hidden />
      </button>

      {!done && (
        <button
          type="button"
          className={`priority-dot p-${task.priority}`}
          aria-label={`Priority ${task.priority.toLowerCase()} — click to change`}
          title={`Priority: ${task.priority.toLowerCase()}`}
          onClick={cyclePriority}
        >
          <Flag size={11} aria-hidden />
        </button>
      )}

      {editing ? (
        <input
          ref={inputRef}
          className="task-title-input"
          aria-label="Edit task title"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveTitle();
            if (e.key === 'Escape') {
              setDraft(task.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="title task-title-btn"
          onClick={() => {
            if (!done) setEditing(true);
          }}
          aria-label={done ? task.title : `${task.title} — click to edit`}
        >
          {task.title}
        </button>
      )}

      {!compact &&
        task.tags.slice(0, 2).map((tag) => (
          <Badge key={tag} className="tag-pill">
            {tag}
          </Badge>
        ))}

      {/* What this task is FOR. Shown on a done row too — seeing the goal a
          finished task fed is the payoff for having linked it. */}
      <TaskGoalChip taskId={task.id} goalId={task.goalId} compact={compact} />

      {repeat && !done && (
        <span className="repeat-chip-label" title={`Repeats: ${repeat}`}>
          <Repeat size={11} aria-hidden />
          {/* The words are dropped on a phone, where "Every weekday" is a
              quarter of the row. The glyph and the title attribute keep the
              meaning; the row keeps its title. */}
          <span className="repeat-chip-text">{repeat}</span>
        </span>
      )}

      {due && !done && (
        <span className={`due-chip ${overdue ? 'overdue' : ''}`}>{formatDue(due)}</span>
      )}

      {/* Only ever shown once it is measured from what this user actually did,
          never as a guess — depth that arrives as a consequence of use. */}
      {usual && !done && !compact && (
        <span
          className="usual-chip"
          title={`Measured from ${usual.samples} completed blocks`}
        >
          usually {formatDuration(usual.minutes)}
        </span>
      )}

      <span className="task-actions">
        <IconButton
          label={`Delete "${task.title}"`}
          onClick={() => del.mutate(task.id)}
          disabled={del.isPending}
        >
          <X size={15} aria-hidden />
        </IconButton>
      </span>
    </div>
  );
}
