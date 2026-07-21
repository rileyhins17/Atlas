'use client';

import { useRouter } from 'next/navigation';
import { Check, MapPin } from 'lucide-react';
import type { CanvasItem } from '@/lib/canvas';
import { feedRowHref } from '@/lib/stream';
import { formatClock } from '@/lib/dates';
import { eventGlyph } from '@/components/stream/FeedRow';

/**
 * One moment on the Day Canvas. Three variants: a calendar event (time chip),
 * a due task (live one-tap complete), an actual (something that happened —
 * check-in, journal entry, transaction — deep-linking to its domain).
 */
export function CanvasCard({
  item,
  onComplete,
}: {
  item: CanvasItem;
  onComplete?: (taskId: string) => void;
}) {
  const router = useRouter();

  if (item.type === 'event') {
    return (
      <div className="canvas-card canvas-card-event">
        <span className="canvas-card-time">{formatClock(item.at)}</span>
        <span className="canvas-card-title">{item.title}</span>
        {item.end && <span className="canvas-card-meta">until {formatClock(item.end)}</span>}
        {item.location && (
          <span className="canvas-card-meta">
            <MapPin size={11} aria-hidden /> {item.location}
          </span>
        )}
      </div>
    );
  }

  if (item.type === 'task') {
    return (
      <div className="canvas-card canvas-card-task">
        <button
          type="button"
          className="canvas-check"
          aria-label={`Complete "${item.title}"`}
          onClick={() => onComplete?.(item.taskId)}
        >
          <Check size={12} aria-hidden />
        </button>
        <span className="canvas-card-title">{item.title}</span>
        <span className="canvas-card-meta">due {formatClock(item.at)}</span>
      </div>
    );
  }

  const { icon: Icon, className } = eventGlyph(item.row);
  const href = feedRowHref(item.row);
  return (
    <button
      type="button"
      className="canvas-card canvas-card-actual"
      onClick={() => href && router.push(href)}
      disabled={!href}
    >
      <span className={`canvas-actual-dot ${className}`} aria-hidden>
        <Icon size={12} />
      </span>
      <span className="canvas-card-title">{item.row.title}</span>
      {item.row.summary && <span className="canvas-card-meta">{item.row.summary}</span>}
      <span className="canvas-card-time-right">{formatClock(item.at)}</span>
    </button>
  );
}
