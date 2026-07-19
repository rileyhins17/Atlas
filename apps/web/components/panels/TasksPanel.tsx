'use client';

import { useState } from 'react';
import type { TaskDTO } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useMe } from '@/lib/hooks/auth';
import { useCompleteTask, useCreateTask, useDeleteTask, useTasks } from '@/lib/hooks/tasks';
import { Check, ListTodo, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, ListSkeleton } from '@/components/ui';

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(user: { displayName: string | null; email: string }): string {
  const base = user.displayName ?? user.email.split('@')[0] ?? 'there';
  const word = base.split(/[\s.]+/)[0] ?? base;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function TasksPanel() {
  const [title, setTitle] = useState('');
  const me = useMe();
  const tasksQuery = useTasks();
  const create = useCreateTask();
  const complete = useCompleteTask();
  const remove = useDeleteTask();

  const tasks = tasksQuery.data ?? [];
  const error = create.error
    ? errorMessage(create.error, 'Failed to add task')
    : complete.error
      ? errorMessage(complete.error, 'Failed to complete task')
      : remove.error
        ? errorMessage(remove.error, 'Failed to delete task')
        : null;

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate({ title: title.trim() }, { onSuccess: () => setTitle('') });
  }

  function toggle(t: TaskDTO) {
    if (t.status === 'DONE') return;
    complete.mutate(t.id);
  }

  const open = tasks.filter((t) => t.status !== 'DONE');
  const done = tasks.filter((t) => t.status === 'DONE');

  return (
    <>
      <header className="greeting">
        <h2 className="page-title">
          {greetingWord()}
          {me.data ? (
            <>
              , <mark className="hl">{firstName(me.data)}</mark>
            </>
          ) : null}
        </h2>
        <p className="greeting-sub">
          {TODAY_LABEL}
          {open.length > 0 ? ` · ${open.length} to do` : ''}
        </p>
      </header>
      <form className="row" onSubmit={addTask}>
        <Input
          placeholder="Add a task…"
          aria-label="New task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          Add
        </Button>
      </form>
      {error && <div className="error">{error}</div>}

      <Card style={{ marginTop: 14 }} aria-busy={tasksQuery.isPending}>
        {tasksQuery.isPending ? (
          <ListSkeleton rows={3} />
        ) : tasksQuery.isError ? (
          <ErrorState
            message={errorMessage(tasksQuery.error, 'Failed to load tasks')}
            onRetry={() => void tasksQuery.refetch()}
          />
        ) : open.length === 0 && done.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="No tasks yet"
            hint="Add your first task above, or brain-dump into Atlas AI and let it file things for you."
          />
        ) : (
          <>
            {open.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={toggle} onRemove={(x) => remove.mutate(x.id)} />
            ))}
            {done.length > 0 && (
              <>
                <h3 className="section-title" style={{ marginLeft: 0 }}>
                  Done
                </h3>
                {done.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={toggle}
                    onRemove={(x) => remove.mutate(x.id)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </Card>
    </>
  );
}

function TaskRow({
  task,
  onToggle,
  onRemove,
}: {
  task: TaskDTO;
  onToggle: (t: TaskDTO) => void;
  onRemove: (t: TaskDTO) => void;
}) {
  const done = task.status === 'DONE';
  return (
    <div className={`task ${done ? 'done' : ''}`}>
      <button
        className="check"
        aria-label={`Complete "${task.title}"`}
        aria-pressed={done}
        onClick={() => onToggle(task)}
      >
        <Check size={14} strokeWidth={3} aria-hidden />
      </button>
      <span className="title">{task.title}</span>
      {task.priority !== 'MEDIUM' && <Badge tone={task.priority}>{task.priority}</Badge>}
      <IconButton label={`Delete "${task.title}"`} onClick={() => onRemove(task)}>
        <X size={16} aria-hidden />
      </IconButton>
    </div>
  );
}
