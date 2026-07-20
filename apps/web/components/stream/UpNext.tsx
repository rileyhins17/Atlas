'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Check, Circle } from 'lucide-react';
import { useEvents } from '@/lib/hooks/events';
import { useCompleteTask, useTasks } from '@/lib/hooks/tasks';
import { useRoutine } from '@/lib/hooks/routine';
import { buildUpNext, nextRoutine, routineAt, type UpNextItem } from '@/lib/stream';
import { ListSkeleton } from '@/components/ui';
import { formatClock } from '@/lib/dates';

function Row({ item, onComplete }: { item: UpNextItem; onComplete: (id: string) => void }) {
  return (
    <li className={`upnext-row ${item.overdue ? 'overdue' : ''}`}>
      {item.kind === 'task' ? (
        <button
          type="button"
          className="upnext-check"
          aria-label={`Complete "${item.title}"`}
          onClick={() => item.taskId && onComplete(item.taskId)}
        >
          <Check size={13} aria-hidden />
        </button>
      ) : (
        <span className="upnext-glyph" aria-hidden>
          <Circle size={9} />
        </span>
      )}
      <span className="upnext-title">{item.title}</span>
      <span className="upnext-time">
        {item.overdue ? (
          <span className="row" style={{ gap: 4 }}>
            <AlertTriangle size={12} aria-hidden /> overdue
          </span>
        ) : item.allDay ? (
          'all day'
        ) : (
          formatClock(item.at)
        )}
      </span>
    </li>
  );
}

/**
 * The bounded plan above the now-line: overdue, then what's left of today,
 * then tomorrow as a quiet count. Tasks complete in one tap (optimistic).
 * Deliberately capped — the feed below is the star.
 */
export function UpNext() {
  const events = useEvents();
  const tasks = useTasks();
  const routine = useRoutine();
  const complete = useCompleteTask();

  const upNext = useMemo(
    () => buildUpNext(events.data ?? [], tasks.data ?? [], new Date()),
    [events.data, tasks.data],
  );

  if (events.isPending || tasks.isPending) return <ListSkeleton rows={3} circle={false} />;

  const empty = upNext.overdue.length === 0 && upNext.today.length === 0;

  // With a routine set, an empty plan still says what life looks like next.
  const now = new Date();
  const current = routineAt(routine.data ?? [], now);
  const upcoming = nextRoutine(routine.data ?? [], now);

  return (
    <section className="upnext" aria-label="Up next">
      {empty ? (
        <p className="upnext-clear muted">
          {current
            ? `${current.label} now${upcoming ? ` — ${upcoming.block.label} at ${formatClock(upcoming.at)}` : ''}. `
            : upcoming
              ? `Next: ${upcoming.block.label} at ${formatClock(upcoming.at)}. `
              : 'Nothing else scheduled today. '}
          <Link href="/calendar" className="upnext-plan-link">
            Plan something <ArrowRight size={12} aria-hidden />
          </Link>
        </p>
      ) : (
        <ol className="upnext-list">
          {upNext.overdue.map((item) => (
            <Row key={item.id} item={item} onComplete={(id) => complete.mutate(id)} />
          ))}
          {upNext.today.map((item) => (
            <Row key={item.id} item={item} onComplete={(id) => complete.mutate(id)} />
          ))}
        </ol>
      )}
      {upNext.tomorrowCount > 0 && (
        <Link href="/calendar" className="upnext-tomorrow">
          +{upNext.tomorrowCount} tomorrow
        </Link>
      )}
    </section>
  );
}
