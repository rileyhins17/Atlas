'use client';

import { ArrowRight, MapPin } from 'lucide-react';
import type { CanvasItem, DayOverview } from '@/lib/canvas';
import { formatClock } from '@/lib/dates';

function untilPhrase(until: Date, now: Date): string {
  const mins = Math.max(0, Math.round((until.getTime() - now.getTime()) / 60_000));
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

function itemTitle(item: CanvasItem): string {
  return item.type === 'actual' ? item.row.title : item.title;
}

/**
 * The single most important thing on the page: what you're in right now, and
 * what's next. Everything else on Today is secondary to this.
 */
export function NowNext({ overview, now }: { overview: DayOverview; now: Date }) {
  const { now: block, current, next } = overview;

  // A live timed item beats the routine block containing it: "Sleep until 11:00"
  // is more use than "Work". Reading only the routine meant an AI-booked event
  // left the headline saying "Open time" while announcing the thing you were
  // already inside as "Next".
  const headline = current
    ? {
        label: itemTitle(current),
        // Only events carry an end; `current` is only ever an event today, but
        // narrowing keeps that true if the shape widens later.
        until: current.type === 'event' ? (current.end ?? null) : null,
        context: block?.label ?? null,
      }
    : block
      ? { label: block.label, until: block.until, context: null }
      : null;

  return (
    <section className="nownext" aria-label="Right now">
      <div className="nownext-main">
        <span className="nownext-eyebrow">
          <span className="nownext-dot" aria-hidden /> Now · {formatClock(now)}
        </span>
        {headline ? (
          <>
            <h2 className="nownext-title">{headline.label}</h2>
            <span className="nownext-sub">
              {headline.until ? (
                <>
                  until {formatClock(headline.until)} · {untilPhrase(headline.until, now)}
                </>
              ) : (
                'in progress'
              )}
              {headline.context ? ` · ${headline.context}` : ''}
            </span>
          </>
        ) : (
          <>
            <h2 className="nownext-title nownext-open">Open time</h2>
            <span className="nownext-sub">Nothing scheduled — yours to use.</span>
          </>
        )}
      </div>

      {next && (
        <div className="nownext-next">
          <span className="nownext-next-label">
            <ArrowRight size={12} aria-hidden /> Next
          </span>
          <span className="nownext-next-title">{itemTitle(next)}</span>
          <span className="nownext-next-meta">
            {formatClock(next.at)}
            {next.type === 'event' && next.location ? (
              <>
                {' · '}
                <MapPin size={10} aria-hidden /> {next.location}
              </>
            ) : null}
            {next.type === 'task' ? ' · due' : ''}
          </span>
        </div>
      )}
    </section>
  );
}
