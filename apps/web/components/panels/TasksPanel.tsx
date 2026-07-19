'use client';

import { useMemo, useState } from 'react';
import type { TaskDTO } from '@atlas/shared';
import { ChevronDown, ChevronRight, ListTodo } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useCreateTask, useTasks } from '@/lib/hooks/tasks';
import { Button, Card, EmptyState, ErrorState, Input, ListSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { TaskRow } from '@/components/TaskRow';
import { dayDiff } from '@/lib/dates';

const PRIORITY_WEIGHT: Record<TaskDTO['priority'], number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

interface Group {
  key: string;
  label: string;
  overdue?: boolean;
  tasks: TaskDTO[];
}

/** Bucket open tasks by due horizon, each bucket due-then-priority sorted. */
export function groupTasks(tasks: TaskDTO[], now: Date): { groups: Group[]; done: TaskDTO[] } {
  const open = tasks.filter((t) => t.status !== 'DONE');
  const done = tasks.filter((t) => t.status === 'DONE');
  const buckets: Record<string, TaskDTO[]> = { overdue: [], today: [], week: [], later: [], someday: [] };
  for (const t of open) {
    if (!t.dueAt) {
      buckets.someday.push(t);
      continue;
    }
    const days = dayDiff(now, new Date(t.dueAt));
    if (days < 0) buckets.overdue.push(t);
    else if (days === 0) buckets.today.push(t);
    else if (days < 7) buckets.week.push(t);
    else buckets.later.push(t);
  }
  const order = (a: TaskDTO, b: TaskDTO) => {
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  };
  for (const key of Object.keys(buckets)) buckets[key].sort(order);
  const groups: Group[] = [
    { key: 'overdue', label: 'Overdue', overdue: true, tasks: buckets.overdue },
    { key: 'today', label: 'Today', tasks: buckets.today },
    { key: 'week', label: 'This week', tasks: buckets.week },
    { key: 'later', label: 'Later', tasks: buckets.later },
    { key: 'someday', label: 'No date', tasks: buckets.someday },
  ].filter((g) => g.tasks.length > 0);
  return { groups, done };
}

export function TasksPanel() {
  const [title, setTitle] = useState('');
  const [showDone, setShowDone] = useState(false);
  const tasksQuery = useTasks();
  const create = useCreateTask();

  const { groups, done } = useMemo(
    () => groupTasks(tasksQuery.data ?? [], new Date()),
    [tasksQuery.data],
  );
  const openCount = groups.reduce((n, g) => n + g.tasks.length, 0);

  const createError = create.error ? errorMessage(create.error, 'Failed to add task') : null;

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate({ title: title.trim() }, { onSuccess: () => setTitle('') });
  }

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={
          openCount > 0
            ? `${openCount} open · click a title to edit, the flag to change priority.`
            : 'Everything you have to do, in one grouped list.'
        }
      />
      <form className="row" onSubmit={addTask}>
        <Input
          placeholder="Add a task… (or press ⌘K from anywhere)"
          aria-label="New task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          Add
        </Button>
      </form>
      {createError && <div className="error">{createError}</div>}

      <Card style={{ marginTop: 14 }} aria-busy={tasksQuery.isPending}>
        {tasksQuery.isPending ? (
          <ListSkeleton rows={5} />
        ) : tasksQuery.isError ? (
          <ErrorState
            message={errorMessage(tasksQuery.error, 'Failed to load tasks')}
            onRetry={() => void tasksQuery.refetch()}
          />
        ) : openCount === 0 && done.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="No tasks yet"
            hint="Add your first task above — or press ⌘K and just describe it; Atlas files it."
          />
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <h3
                  className={`focus-group-title ${g.overdue ? 'overdue' : ''}`}
                  style={{ marginTop: 10 }}
                >
                  {g.label} · {g.tasks.length}
                </h3>
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </section>
            ))}
            {done.length > 0 && (
              <>
                <button
                  type="button"
                  className="done-toggle"
                  onClick={() => setShowDone((v) => !v)}
                  aria-expanded={showDone}
                >
                  {showDone ? (
                    <ChevronDown size={14} aria-hidden />
                  ) : (
                    <ChevronRight size={14} aria-hidden />
                  )}
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Done · {done.length}
                  </h3>
                </button>
                {showDone && done.map((t) => <TaskRow key={t.id} task={t} />)}
              </>
            )}
          </>
        )}
      </Card>
    </>
  );
}
