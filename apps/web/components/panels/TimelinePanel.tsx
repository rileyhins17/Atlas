'use client';

import { useMemo, useState } from 'react';
import type { TimelineEventDTO } from '@atlas/shared';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Flame,
  History,
  Lightbulb,
  ListTodo,
  MessageCircleQuestion,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import { useTimeline } from '@/lib/hooks/timeline';
import { Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { formatClock, formatDayHeading, localDayKey } from '@/lib/dates';

const FILTERS = [
  { source: undefined, label: 'Everything' },
  { source: 'tasks', label: 'Tasks' },
  { source: 'calendar', label: 'Calendar' },
  { source: 'habits', label: 'Habits' },
  { source: 'journal', label: 'Journal' },
  { source: 'notes', label: 'Notes' },
  { source: 'ai', label: 'Atlas' },
] as const;

/** Icon + tone for an event, by type prefix then source. */
function eventGlyph(e: TimelineEventDTO): { icon: typeof History; className: string } {
  if (e.type.startsWith('task.completed')) return { icon: CheckCircle2, className: 'done' };
  if (e.type.startsWith('task.')) return { icon: ListTodo, className: '' };
  if (e.type.startsWith('habit.')) return { icon: Flame, className: 'warm' };
  if (e.type.startsWith('journal.')) return { icon: BookOpen, className: '' };
  if (e.type.startsWith('note.')) return { icon: StickyNote, className: '' };
  if (e.type.startsWith('event.')) return { icon: Calendar, className: '' };
  if (e.type.startsWith('insight.')) return { icon: Lightbulb, className: 'brand' };
  if (e.type.startsWith('question.')) return { icon: MessageCircleQuestion, className: 'brand' };
  if (e.source === 'ai') return { icon: Sparkles, className: 'brand' };
  return { icon: History, className: '' };
}

/**
 * The Story view: every domain's activity as one chronological stream — the
 * "silos become one graph" hook made visible. Grouped by day, filterable by
 * domain, infinite "show more".
 */
export function TimelinePanel() {
  const [source, setSource] = useState<string | undefined>(undefined);
  const timeline = useTimeline(source);

  const events = useMemo(
    () => timeline.data?.pages.flatMap((p) => p.events) ?? [],
    [timeline.data],
  );

  const groups = useMemo(() => {
    const byDay = new Map<string, TimelineEventDTO[]>();
    for (const e of events) {
      const key = localDayKey(new Date(e.occurredAt));
      const arr = byDay.get(key) ?? [];
      arr.push(e);
      byDay.set(key, arr);
    }
    return [...byDay.entries()];
  }, [events]);

  return (
    <div className="page-wide">
      <PageHeader
        title="Timeline"
        subtitle="Your whole life, one stream — everything Atlas has seen happen."
      />

      <div className="filter-chips" role="group" aria-label="Filter by domain">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            className={`chip ${source === f.source ? 'active' : ''}`}
            aria-pressed={source === f.source}
            onClick={() => setSource(f.source)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {timeline.isPending ? (
        <ListSkeleton rows={8} />
      ) : timeline.isError ? (
        <ErrorState message="Couldn't load your timeline." onRetry={() => timeline.refetch()} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing here yet"
          hint="As you add tasks, check in habits and write journal entries, your story builds itself here."
        />
      ) : (
        <div className="stack" style={{ gap: 28 }}>
          {groups.map(([day, dayEvents]) => (
            <section key={day} aria-label={formatDayHeading(new Date(`${day}T12:00:00`))}>
              <h2 className="section-title" style={{ marginTop: 0 }}>
                {formatDayHeading(new Date(`${day}T12:00:00`))}
              </h2>
              <ol className="tl">
                {dayEvents.map((e) => {
                  const { icon: Icon, className } = eventGlyph(e);
                  return (
                    <li key={e.id} className="tl-item">
                      <span className={`tl-dot ${className}`}>
                        <Icon size={13} aria-hidden />
                      </span>
                      <div className="tl-body">
                        <span className="tl-title">{e.title}</span>
                        {e.summary ? <span className="tl-summary">{e.summary}</span> : null}
                      </div>
                      <time className="tl-time" dateTime={e.occurredAt}>
                        {formatClock(new Date(e.occurredAt))}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {timeline.hasNextPage && (
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button
                variant="secondary"
                onClick={() => timeline.fetchNextPage()}
                disabled={timeline.isFetchingNextPage}
              >
                {timeline.isFetchingNextPage ? 'Loading…' : 'Show more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
