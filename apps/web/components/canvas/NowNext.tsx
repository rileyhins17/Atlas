'use client';

import { ArrowRight, MapPin } from 'lucide-react';
import type { DayOverview } from '@/lib/canvas';
import { formatClock } from '@/lib/dates';

function untilPhrase(until: Date, now: Date): string {
  const mins = Math.max(0, Math.round((until.getTime() - now.getTime()) / 60_000));
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

/**
 * The single most important thing on the page: what you're in right now, and
 * what's next. Everything else on Today is secondary to this.
 */
export function NowNext({ overview, now }: { overview: DayOverview; now: Date }) {
  const { now: block, next } = overview;

  return (
    <section className="nownext" aria-label="Right now">
      <div className="nownext-main">
        <span className="nownext-eyebrow">
          <span className="nownext-dot" aria-hidden /> Now · {formatClock(now)}
        </span>
        {block ? (
          <>
            <h2 className="nownext-title">{block.label}</h2>
            <span className="nownext-sub">
              until {formatClock(block.until)} · {untilPhrase(block.until, now)}
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
          <span className="nownext-next-title">
            {next.type === 'event' ? next.title : next.type === 'task' ? next.title : next.row.title}
          </span>
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
