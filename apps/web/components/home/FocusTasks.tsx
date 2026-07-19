'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { TaskDTO } from '@atlas/shared';
import { ArrowRight, ListTodo } from 'lucide-react';
import { useTasks } from '@/lib/hooks/tasks';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { dayDiff } from '@/lib/dates';

const PRIORITY_WEIGHT: Record<TaskDTO['priority'], number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/** Sort: due first (earlier first), then priority. */
function focusOrder(a: TaskDTO, b: TaskDTO): number {
  const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
  const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
  if (ad !== bd) return ad - bd;
  return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
}

/** Today's working set: overdue, due today, then what's next — capped. */
export function FocusTasks() {
  const tasks = useTasks();
  const now = new Date();

  const groups = useMemo(() => {
    const open = (tasks.data ?? []).filter((t) => t.status !== 'DONE').sort(focusOrder);
    const overdue: TaskDTO[] = [];
    const today: TaskDTO[] = [];
    const next: TaskDTO[] = [];
    for (const t of open) {
      const days = t.dueAt ? dayDiff(now, new Date(t.dueAt)) : null;
      if (days !== null && days < 0) overdue.push(t);
      else if (days === 0) today.push(t);
      else next.push(t);
    }
    return { overdue: overdue.slice(0, 5), today: today.slice(0, 6), next: next.slice(0, 4) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is per-render by design
  }, [tasks.data]);

  if (tasks.isPending) return <ListSkeleton rows={5} />;
  if (tasks.isError)
    return <ErrorState message="Couldn't load your tasks." onRetry={() => tasks.refetch()} />;

  const total = groups.overdue.length + groups.today.length + groups.next.length;
  if (total === 0) {
    return (
      <EmptyState
        icon={ListTodo}
        title="All clear"
        hint="Nothing on your plate. Press ⌘K and type a task — Atlas files it."
      />
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      {groups.overdue.length > 0 && (
        <section aria-label="Overdue tasks">
          <h3 className="focus-group-title overdue">Overdue</h3>
          {groups.overdue.map((t) => (
            <TaskRow key={t.id} task={t} compact />
          ))}
        </section>
      )}
      {groups.today.length > 0 && (
        <section aria-label="Due today">
          <h3 className="focus-group-title">Today</h3>
          {groups.today.map((t) => (
            <TaskRow key={t.id} task={t} compact />
          ))}
        </section>
      )}
      {groups.next.length > 0 && (
        <section aria-label="Up next">
          <h3 className="focus-group-title">Next</h3>
          {groups.next.map((t) => (
            <TaskRow key={t.id} task={t} compact />
          ))}
        </section>
      )}
      <Link href="/tasks" className="see-all">
        All tasks <ArrowRight size={13} aria-hidden />
      </Link>
    </div>
  );
}
