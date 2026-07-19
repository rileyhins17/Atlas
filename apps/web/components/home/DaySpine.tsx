'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { EventDTO, TaskDTO } from '@atlas/shared';
import { CalendarPlus, Circle, ListTodo } from 'lucide-react';
import { useEvents } from '@/lib/hooks/events';
import { useTasks } from '@/lib/hooks/tasks';
import { ListSkeleton } from '@/components/ui';
import { formatClock, localDayKey } from '@/lib/dates';

interface SpineItem {
  id: string;
  at: Date;
  end?: Date;
  title: string;
  kind: 'event' | 'task';
  allDay?: boolean;
  location?: string | null;
}

/**
 * The day's spine: today's calendar events and time-boxed tasks in one
 * chronological rail with a "now" marker. The glanceable answer to
 * "what does today look like?".
 */
export function DaySpine() {
  const events = useEvents();
  const tasks = useTasks();
  const today = localDayKey(new Date());
  const now = new Date();

  const items = useMemo<SpineItem[]>(() => {
    const list: SpineItem[] = [];
    for (const e of (events.data ?? []) as EventDTO[]) {
      const start = new Date(e.startAt);
      if (localDayKey(start) !== today) continue;
      list.push({
        id: `e-${e.id}`,
        at: start,
        end: new Date(e.endAt),
        title: e.title,
        kind: 'event',
        allDay: e.allDay,
        location: e.location,
      });
    }
    for (const t of (tasks.data ?? []) as TaskDTO[]) {
      if (t.status === 'DONE' || !t.dueAt) continue;
      const due = new Date(t.dueAt);
      if (localDayKey(due) !== today) continue;
      list.push({ id: `t-${t.id}`, at: due, title: t.title, kind: 'task' });
    }
    return list.sort(
      (a, b) => Number(b.allDay ?? false) - Number(a.allDay ?? false) || a.at.getTime() - b.at.getTime(),
    );
  }, [events.data, tasks.data, today]);

  // Where the "now" divider slots in (after all-day + past items).
  const nowIndex = items.findIndex((i) => !i.allDay && i.at.getTime() > now.getTime());

  if (events.isPending || tasks.isPending) return <ListSkeleton rows={4} />;

  if (items.length === 0) {
    return (
      <div className="spine-empty">
        <p className="muted" style={{ margin: 0 }}>
          A clear day — nothing scheduled.
        </p>
        <Link href="/calendar" className="row" style={{ gap: 6, fontSize: 13 }}>
          <CalendarPlus size={14} aria-hidden /> Plan something
        </Link>
      </div>
    );
  }

  return (
    <ol className="spine" aria-label="Today's schedule">
      {items.map((item, i) => {
        const past = !item.allDay && (item.end ?? item.at).getTime() < now.getTime();
        return (
          <li key={item.id}>
            {i === (nowIndex === -1 ? items.length : nowIndex) && (
              <div className="spine-now" role="presentation">
                <span className="spine-now-dot" />
                <span className="spine-now-label">now · {formatClock(now)}</span>
              </div>
            )}
            <div className={`spine-item ${past ? 'past' : ''}`}>
              <span className="spine-time">
                {item.allDay ? 'all day' : formatClock(item.at)}
              </span>
              <span className={`spine-glyph ${item.kind}`}>
                {item.kind === 'event' ? (
                  <Circle size={9} aria-hidden />
                ) : (
                  <ListTodo size={11} aria-hidden />
                )}
              </span>
              <span className="spine-body">
                <span className="spine-title">{item.title}</span>
                {item.kind === 'event' && !item.allDay && item.end && (
                  <span className="spine-meta">
                    until {formatClock(item.end)}
                    {item.location ? ` · ${item.location}` : ''}
                  </span>
                )}
              </span>
            </div>
          </li>
        );
      })}
      {nowIndex === -1 && (
        <li>
          <div className="spine-now" role="presentation">
            <span className="spine-now-dot" />
            <span className="spine-now-label">now · {formatClock(now)}</span>
          </div>
        </li>
      )}
    </ol>
  );
}
