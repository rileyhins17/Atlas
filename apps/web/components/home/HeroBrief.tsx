'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, RefreshCw, Sparkles } from 'lucide-react';
import { useAiStatus, useGenerateDailyBrief, useInsights } from '@/lib/hooks/ai';
import { Button } from '@/components/ui';
import { Constellation } from '@/components/atlas/Constellation';
import { formatAgo, localDayKey } from '@/lib/dates';

/**
 * The AI speaking on Home: the latest daily brief in prose, with a one-tap
 * refresh. Unconfigured setups get a warm pointer to Settings instead of a
 * dead zone.
 */
export function HeroBrief({ compact = false }: { compact?: boolean }) {
  const status = useAiStatus();
  const insights = useInsights();
  const generate = useGenerateDailyBrief();
  const [expanded, setExpanded] = useState(false);

  const latest = insights.data?.[0] ?? null;
  const fresh = latest !== null && localDayKey(new Date(latest.createdAt)) === localDayKey(new Date());

  if (status.data && !status.data.providerConfigured) {
    return (
      <div className={`hero-brief ${compact ? 'compact' : ''}`}>
        <p className="hero-brief-text muted" style={{ margin: 0 }}>
          Atlas can brief you each day, file whatever you type, and chat over your whole life —{' '}
          <Link href="/settings">connect the AI in Settings</Link> to switch it on.
        </p>
      </div>
    );
  }

  return (
    <div className={`hero-brief ${compact ? 'compact' : ''}`} aria-busy={generate.isPending || insights.isPending}>
      {insights.isPending ? (
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <Constellation loading size={compact ? 22 : 30} />
          <span className="muted" style={{ fontSize: 13 }}>Reading your day…</span>
        </div>
      ) : latest ? (
        <>
          {/* Clamped by default — a wall of prose is the opposite of glanceable.
              One tap opens the full text for when you actually want to read.
              In the NowStrip we clamp to a single line so the feed stays primary. */}
          <p className={`hero-brief-text ${expanded ? '' : compact ? 'clamped-1' : 'clamped'}`}>
            <Sparkles size={13} aria-hidden className="hero-brief-spark" />
            {latest.body}
          </p>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="hero-brief-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              <ChevronDown
                size={13}
                aria-hidden
                style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform .15s ease' }}
              />
              {expanded ? 'Less' : 'Read more'}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              {fresh ? formatAgo(new Date(latest.createdAt)) : 'from earlier — refresh for today'}
            </span>
            <Button
              variant="ghost"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              aria-label="Refresh the brief"
            >
              <span className="row" style={{ gap: 6 }}>
                <RefreshCw size={13} aria-hidden className={generate.isPending ? 'spin' : ''} />
                {generate.isPending ? 'Thinking…' : 'Refresh'}
              </span>
            </Button>
          </div>
        </>
      ) : (
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <p className="hero-brief-text muted" style={{ margin: 0, flex: 1, minWidth: 220 }}>
            No brief yet today. Atlas reads your tasks, calendar, habits and journal, and tells you
            what matters.
          </p>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            <span className="row" style={{ gap: 7 }}>
              <Sparkles size={14} aria-hidden />
              {generate.isPending ? 'Thinking…' : 'Brief me'}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
