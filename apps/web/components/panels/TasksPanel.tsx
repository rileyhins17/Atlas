'use client';

import { useMemo, useState } from 'react';
import type { TaskDTO } from '@atlas/shared';
import { ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useCreateTask, useTasks } from '@/lib/hooks/tasks';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  ListSkeleton,
  RecurrencePicker,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { TaskRow } from '@/components/TaskRow';
import { dayDiff } from '@/lib/dates';
import { filterTasks, quickAddDueDate, TASK_FILTERS, type TaskFilter } from '@/lib/tasks-filter';
import { useSubmitLatch } from '@/lib/hooks/submit-latch';

const PRIORITY_WEIGHT: Record<TaskDTO['priority'], number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/** Offered on the quick-add row so priority is a tap, never typed. */
const QUICK_PRIORITIES: TaskDTO['priority'][] = ['LOW', 'MEDIUM', 'HIGH'];

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

/**
 * Add a task straight into a group — the due date comes from the group itself,
 * so a dated task costs one line of typing and zero date-picking.
 */
function QuickAdd({ groupKey, groupLabel }: { groupKey: string; groupLabel: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskDTO['priority']>('MEDIUM');
  const [repeat, setRepeat] = useState<string | null>(null);
  const create = useCreateTask();
  const latch = useSubmitLatch();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text || create.isPending) return;
    // dueAt is a Date in the shared DTO (zod coerces at the boundary); JSON
    // serialises it to ISO on the way out.
    // A repeating task needs an anchor date to step from, so a rule with no
    // horizon (the "No date" group) starts today rather than never advancing.
    const due = quickAddDueDate(groupKey, new Date()) ?? (repeat ? new Date() : null);
    latch((release) =>
      create.mutate(
        { title: text, priority, ...(due ? { dueAt: due } : {}), ...(repeat ? { recurrence: repeat } : {}) },
        {
          onSuccess: () => {
            setTitle('');
            setRepeat(null);
          },
          onSettled: release,
        },
      ),
    );
  }

  if (!open) {
    return (
      <button type="button" className="quick-add-open" onClick={() => setOpen(true)}>
        <Plus size={13} aria-hidden /> Add to {groupLabel.toLowerCase()}
      </button>
    );
  }

  return (
    <form className="quick-add" onSubmit={submit}>
      <Input
        autoFocus
        placeholder={`New task in ${groupLabel.toLowerCase()}…`}
        aria-label={`New task in ${groupLabel}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <div className="quick-add-row">
        <div className="quick-prio" role="group" aria-label="Priority">
          {QUICK_PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={`quick-prio-chip ${priority === p ? 'on' : ''} p-${p.toLowerCase()}`}
              aria-pressed={priority === p}
              onClick={() => setPriority(p)}
            >
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <Button type="submit" disabled={!title.trim() || create.isPending}>
          Add task
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} aria-label="Cancel">
          <X size={14} aria-hidden />
        </Button>
      </div>
      <RecurrencePicker value={repeat} onChange={setRepeat} />
    </form>
  );
}

/** Stable "no data yet" identity — see the note in CalendarPanel. */
const NO_TASKS: TaskDTO[] = [];

export function TasksPanel() {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [query, setQuery] = useState('');
  const [doneOpen, setDoneOpen] = useState(false);
  const [title, setTitle] = useState('');
  const tasksQuery = useTasks();
  const create = useCreateTask();
  const latch = useSubmitLatch();

  const all = tasksQuery.data ?? NO_TASKS;
  const visible = useMemo(
    () => filterTasks(all, filter, query, new Date()),
    [all, filter, query],
  );
  const { groups } = useMemo(() => groupTasks(visible, new Date()), [visible]);
  // Done work is filtered OUT of `visible` by every non-"done" view, so the
  // collapsed Done section has to come from the full list.
  const done = useMemo(() => all.filter((t) => t.status === 'DONE'), [all]);
  const openCount = all.filter((t) => t.status !== 'DONE').length;
  const searching = query.trim().length > 0;
  // "All" hides completed work from the groups, so the collapsed Done section
  // is the only place it shows — it must survive an otherwise-empty view, or
  // finishing your last task makes the page claim you have nothing.
  const showDone = filter === 'all' && done.length > 0;

  /** The always-there fast path: type, Enter, done. Dates come from quick-add. */
  function addTask(e: React.FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text || create.isPending) return;
    latch((release) =>
      create.mutate({ title: text }, { onSuccess: () => setTitle(''), onSettled: release }),
    );
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
          placeholder="Add a task…"
          aria-label="New task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" disabled={!title.trim() || create.isPending}>
          Add
        </Button>
      </form>
      {create.error && <div className="error">{errorMessage(create.error, 'Failed to add task')}</div>}

      <div className="task-controls">
        <div className="filter-chips" role="group" aria-label="Filter tasks">
          {TASK_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`chip ${filter === f.key ? 'active' : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="task-search">
          <Search size={14} aria-hidden />
          <input
            className="task-search-input"
            type="search"
            placeholder="Search tasks…"
            aria-label="Search tasks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <Card style={{ marginTop: 14 }} aria-busy={tasksQuery.isPending}>
        {tasksQuery.isPending ? (
          <ListSkeleton rows={5} />
        ) : tasksQuery.isError ? (
          <ErrorState
            message={errorMessage(tasksQuery.error, 'Failed to load tasks')}
            onRetry={() => void tasksQuery.refetch()}
          />
        ) : all.length === 0 ? (
          <EmptyState
            title="No tasks yet"
            hint="Add one above — or just describe it in the capture box; Atlas files it for you."
          />
        ) : visible.length === 0 && !showDone ? (
          <EmptyState
            title={searching ? 'Nothing matches that' : 'Nothing here'}
            hint={
              searching
                ? 'Try a different search, or switch filters.'
                : 'Switch filters to see your other tasks.'
            }
          />
        ) : filter === 'done' ? (
          <section aria-label="Done">
            {visible.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </section>
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
                {/* Quick-add is pointless while searching — it wouldn't match. */}
                {!searching && <QuickAdd groupKey={g.key} groupLabel={g.label} />}
              </section>
            ))}

            {/* Always offer a way in, even when a horizon has nothing yet. */}
            {!searching && !groups.some((g) => g.key === 'today') && (
              <QuickAdd groupKey="today" groupLabel="Today" />
            )}

            {showDone && (
              <>
                <button
                  type="button"
                  className="done-toggle"
                  onClick={() => setDoneOpen((v) => !v)}
                  aria-expanded={doneOpen}
                >
                  {doneOpen ? (
                    <ChevronDown size={14} aria-hidden />
                  ) : (
                    <ChevronRight size={14} aria-hidden />
                  )}
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Done · {done.length}
                  </h3>
                </button>
                {doneOpen && done.map((t) => <TaskRow key={t.id} task={t} />)}
              </>
            )}
          </>
        )}
      </Card>
    </>
  );
}
