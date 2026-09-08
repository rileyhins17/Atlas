'use client';

import { useMemo, useState } from 'react';
import type { TaskDTO } from '@atlas/shared';
import { ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useCreateTask, useTasks, useTaskDurations } from '@/lib/hooks/tasks';
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
import { durationKey, groupTasks, GROUPS_WORTH_ADDING_TO } from '@atlas/shared';
export { groupTasks, GROUPS_WORTH_ADDING_TO } from '@atlas/shared';
import { filterTasks, quickAddDueDate, TASK_FILTERS, type TaskFilter } from '@/lib/tasks-filter';
import { useSubmitLatch } from '@/lib/hooks/submit-latch';

/** Offered on the quick-add row so priority is a tap, never typed. */
const QUICK_PRIORITIES: TaskDTO['priority'][] = ['LOW', 'MEDIUM', 'HIGH'];

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
        readOnly={create.isPending}
        onChange={(e) => { create.reset(); setTitle(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !create.isPending) setOpen(false);
        }}
      />
      <div className="quick-add-row">
        <div className="quick-prio" role="group" aria-label="Priority">
          {QUICK_PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={`quick-prio-chip ${priority === p ? 'on' : ''} p-${p.toLowerCase()}`}
              disabled={create.isPending}
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
        <Button type="button" variant="ghost" disabled={create.isPending} onClick={() => setOpen(false)} aria-label="Cancel">
          <X size={14} aria-hidden />
        </Button>
      </div>
      <RecurrencePicker value={repeat} onChange={setRepeat} disabled={create.isPending} />
      {create.isPending && <p className="task-create-status muted" role="status">Saving task…</p>}
      {create.isError && <p className="task-create-status error" role="alert">Task was not confirmed. Your draft is kept.</p>}
    </form>
  );
}

/** Stable "no data yet" identity — see the note in CalendarPanel. */
const NO_TASKS: TaskDTO[] = [];

/** How many tasks it takes before a search box beats just reading the list. */
const SEARCH_THRESHOLD = 8;

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
  const showTiming = tasksQuery.isSuccess && visible.some((task) => task.status !== 'DONE');
  const timing = useTaskDurations(showTiming);
  const estimates = timing.isError || timing.isPending ? undefined : timing.data;

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
      {/* A subtitle is not a manual. It used to read "click a title to edit,
          the flag to change priority" — instructions for controls that are
          already visible, taking the one line that should say where you stand. */}
      <PageHeader
        title="Tasks"
        subtitle={
          openCount > 0
            ? `${openCount} open, grouped by when they are due.`
            : 'Everything you have to do, in one grouped list.'
        }
      />

      <form className="task-create-form" onSubmit={addTask}>
        <div className="row">
          <Input
            placeholder="Add a task…"
            aria-label="New task title"
            value={title}
            readOnly={create.isPending}
            onChange={(e) => { create.reset(); setTitle(e.target.value); }}
          />
          <Button type="submit" disabled={!title.trim() || create.isPending}>
            Add
          </Button>
        </div>
        {create.isPending && <p className="task-create-status muted" role="status">Saving task…</p>}
        {create.isError && <p className="task-create-status error" role="alert">Task was not confirmed. Your draft is kept.</p>}
      </form>

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
        {/* Search appears once there is something to search.
            Below the threshold it took a whole row on a phone — a third
            control above a list you can already see all of — and searching
            five tasks is slower than reading them. It uses `all`, including
            done, so completing things cannot make the box vanish mid-use. */}
        {all.length >= SEARCH_THRESHOLD && (
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
        )}
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
          <>
            <EmptyState
              title="No tasks yet"
              hint="Add one above — or just describe it in the capture box; Atlas files it for you."
            />
            {/* The quick-add too, not only the plain field at the top. With no
                tasks there are no groups, so the ONE composer that can set a due
                date and a repeat did not exist — the emptiest list, where a
                first task is most likely to want a date, was the only place you
                could not give it one. */}
            <QuickAdd groupKey="today" groupLabel="Today" />
          </>
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
              <TaskRow key={t.id} task={t} usual={estimates?.get(durationKey(t.title))} />
            ))}
          </section>
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <h2
                  className={`focus-group-title ${g.overdue ? 'overdue' : ''}`}
                  style={{ marginTop: 10 }}
                >
                  {g.label} · {g.tasks.length}
                </h2>
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} usual={estimates?.get(durationKey(t.title))} />
                ))}
                {/* Quick-add is pointless while searching — it wouldn't match.
                    And it only earns its place in a group where it does
                    something the composer at the top cannot: set that group's
                    due date. See GROUPS_WORTH_ADDING_TO. */}
                {!searching && GROUPS_WORTH_ADDING_TO.has(g.key) && (
                  <QuickAdd groupKey={g.key} groupLabel={g.label} />
                )}
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
                  <h2 className="section-title" style={{ margin: 0 }}>
                    Done · {done.length}
                  </h2>
                </button>
                {doneOpen && done.map((t) => <TaskRow key={t.id} task={t} usual={estimates?.get(durationKey(t.title))} />)}
              </>
            )}
          </>
        )}
        {showTiming && (
          <section className="task-timing-state" aria-label="Task timing">
            {timing.isError ? <ErrorState message="Task timing could not be loaded." onRetry={() => void timing.refetch()} />
              : timing.isPending ? <p className="muted" role="status">Loading task timing…</p>
                : timing.data?.size === 0 ? <p className="muted">No timing estimates yet. Finish a few planned tasks to build them.</p> : null}
          </section>
        )}
      </Card>
    </>
  );
}
