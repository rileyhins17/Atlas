'use client';

import { useRouter } from 'next/navigation';
import type { TimelineEventDTO } from '@atlas/shared';
import {
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Flame,
  History,
  Landmark,
  Lightbulb,
  ListTodo,
  MessageCircleQuestion,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import { feedRowHref } from '@/lib/stream';
import { formatClock } from '@/lib/dates';

/** Icon + tone for a feed row, by type prefix then source. */
export function eventGlyph(e: TimelineEventDTO): { icon: typeof History; className: string } {
  if (e.type.startsWith('task.completed')) return { icon: CheckCircle2, className: 'done' };
  if (e.type.startsWith('task.')) return { icon: ListTodo, className: '' };
  if (e.type.startsWith('habit.')) return { icon: Flame, className: 'warm' };
  if (e.type.startsWith('journal.')) return { icon: BookOpen, className: '' };
  if (e.type.startsWith('note.')) return { icon: StickyNote, className: '' };
  if (e.type.startsWith('event.')) return { icon: Calendar, className: '' };
  if (e.type.startsWith('account.') || e.type.startsWith('transaction.') || e.type.startsWith('finance.'))
    return { icon: Landmark, className: '' };
  if (e.type.startsWith('insight.')) return { icon: Lightbulb, className: 'brand' };
  if (e.type.startsWith('question.')) return { icon: MessageCircleQuestion, className: 'brand' };
  if (e.source === 'ai' || e.source === 'plaid' || e.source === 'google-calendar')
    return { icon: e.source === 'ai' ? Sparkles : History, className: e.source === 'ai' ? 'brand' : '' };
  return { icon: History, className: '' };
}

/**
 * One life moment in the feed. Tappable (deep-links to its domain page); a
 * "task created" row whose task is still open renders a live complete-check —
 * the feed is a surface you act on, not just read.
 */
export function FeedRow({
  row,
  openTaskId,
  onComplete,
}: {
  row: TimelineEventDTO;
  /** Set when this row's task is still open — renders the live checkbox. */
  openTaskId?: string;
  onComplete?: (taskId: string) => void;
}) {
  const router = useRouter();
  const { icon: Icon, className } = eventGlyph(row);
  const href = feedRowHref(row);

  return (
    <li className="feed-row">
      {openTaskId && onComplete ? (
        <button
          type="button"
          className="feed-check"
          aria-label={`Complete "${row.title}"`}
          onClick={() => onComplete(openTaskId)}
        >
          <Check size={12} aria-hidden />
        </button>
      ) : (
        <span className={`feed-dot ${className}`} aria-hidden>
          <Icon size={13} />
        </span>
      )}
      <button
        type="button"
        className="feed-body"
        onClick={() => href && router.push(href)}
        disabled={!href}
      >
        <span className="feed-title">{row.title}</span>
        {row.summary ? <span className="feed-summary">{row.summary}</span> : null}
      </button>
      <time className="feed-time" dateTime={row.occurredAt}>
        {formatClock(new Date(row.occurredAt))}
      </time>
    </li>
  );
}
