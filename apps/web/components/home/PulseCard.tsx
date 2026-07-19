'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { useJournal } from '@/lib/hooks/journal';
import { ListSkeleton, Sparkline } from '@/components/ui';
import { dayDiff, formatAgo } from '@/lib/dates';

const MOOD_WORDS = ['', 'rough', 'low', 'okay', 'good', 'great'];

/** Mood/energy pulse from recent journal entries: sparkline + trend words. */
export function PulseCard() {
  const journal = useJournal();

  const pulse = useMemo(() => {
    const entries = (journal.data ?? []).filter((e) => e.mood !== null);
    // API returns newest-first; the sparkline reads oldest-first.
    const recent = entries.slice(0, 14).reverse();
    const latest = entries[0] ?? null;
    const now = new Date();
    const thisWeek = (journal.data ?? []).filter(
      (e) => dayDiff(new Date(e.createdAt), now) < 7,
    ).length;
    return { moods: recent.map((e) => e.mood as number), latest, thisWeek };
  }, [journal.data]);

  if (journal.isPending) return <ListSkeleton rows={2} />;

  if (pulse.moods.length === 0) {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          No mood data yet. Journal with a mood and Atlas starts tracking how you&apos;re
          really doing.
        </p>
        <Link href="/journal" className="see-all">
          Write an entry <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="pulse-word">
            {pulse.latest?.mood != null ? MOOD_WORDS[pulse.latest.mood] : '—'}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            last entry {pulse.latest ? formatAgo(new Date(pulse.latest.createdAt)) : ''}
          </span>
        </div>
        <Sparkline
          points={pulse.moods}
          min={1}
          max={5}
          width={132}
          height={40}
          label={`Mood over your last ${pulse.moods.length} entries`}
        />
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted row" style={{ fontSize: 12, gap: 6 }}>
          <BookOpen size={12} aria-hidden />
          {pulse.thisWeek} entr{pulse.thisWeek === 1 ? 'y' : 'ies'} this week
        </span>
        <Link href="/journal" className="see-all" style={{ margin: 0 }}>
          Journal <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
