'use client';

import { useMemo, useState } from 'react';
import type { TimelineEventDTO } from '@atlas/shared';
import { useTimeline } from '@/lib/hooks/timeline';
import { useCompleteTask, useTasks } from '@/lib/hooks/tasks';
import { groupFeedByDay, openTaskRef } from '@/lib/stream';
import { Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { formatDayHeading } from '@/lib/dates';
import { FeedRow } from './FeedRow';

const FILTERS = [
  { source: undefined, label: 'Everything' },
  { source: 'tasks', label: 'Tasks' },
  { source: 'calendar', label: 'Calendar' },
  { source: 'habits', label: 'Habits' },
  { source: 'journal', label: 'Journal' },
  { source: 'notes', label: 'Notes' },
  { source: 'finance', label: 'Finance' },
  { source: 'ai', label: 'Atlas' },
] as const;

/**
 * The past half of the stream: every domain's activity as one chronological
 * feed (newest first — down is older, like every feed you already know).
 * Filterable by domain; open tasks stay actionable right in the feed.
 */
export function Feed() {
  const [source, setSource] = useState<string | undefined>(undefined);
  const timeline = useTimeline(source);
  const tasks = useTasks();
  const complete = useCompleteTask();

  const rows = useMemo(
    () => timeline.data?.pages.flatMap((p) => p.events) ?? [],
    [timeline.data],
  );
  const groups = useMemo(() => groupFeedByDay(rows), [rows]);

  return (
    <section className="feed" aria-label="Your story">
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
        <ListSkeleton rows={6} />
      ) : timeline.isError ? (
        <ErrorState message="Couldn't load your story." onRetry={() => timeline.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Your story starts here"
          hint="Capture something above — every task, habit, entry and sync becomes part of the stream."
        />
      ) : (
        <div className="feed-groups">
          {groups.map(([day, dayRows]) => (
            <section key={day} aria-label={formatDayHeading(new Date(`${day}T12:00:00`))}>
              <h2 className="feed-day">{formatDayHeading(new Date(`${day}T12:00:00`))}</h2>
              <ol className="feed-list">
                {dayRows.map((row: TimelineEventDTO) => {
                  const open = openTaskRef(row, tasks.data ?? []);
                  return (
                    <FeedRow
                      key={row.id}
                      row={row}
                      openTaskId={open?.id}
                      onComplete={(id) => complete.mutate(id)}
                    />
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
                {timeline.isFetchingNextPage ? 'Loading…' : 'Show earlier'}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
