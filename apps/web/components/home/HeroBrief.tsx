'use client';

import Link from 'next/link';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useAiStatus, useGenerateDailyBrief, useInsights } from '@/lib/hooks/ai';
import { Button, Skeleton } from '@/components/ui';
import { formatAgo, localDayKey } from '@/lib/dates';

/**
 * The AI speaking on Home: the latest daily brief in prose, with a one-tap
 * refresh. Unconfigured setups get a warm pointer to Settings instead of a
 * dead zone.
 */
export function HeroBrief() {
  const status = useAiStatus();
  const insights = useInsights();
  const generate = useGenerateDailyBrief();

  const latest = insights.data?.[0] ?? null;
  const fresh = latest !== null && localDayKey(new Date(latest.createdAt)) === localDayKey(new Date());

  if (status.data && !status.data.providerConfigured) {
    return (
      <div className="hero-brief">
        <p className="hero-brief-text muted" style={{ margin: 0 }}>
          Atlas can brief you each day, file whatever you type, and chat over your whole life —{' '}
          <Link href="/settings">connect the AI in Settings</Link> to switch it on.
        </p>
      </div>
    );
  }

  return (
    <div className="hero-brief" aria-busy={generate.isPending || insights.isPending}>
      {insights.isPending ? (
        <div className="stack" style={{ gap: 8 }}>
          <Skeleton height={15} width="92%" />
          <Skeleton height={15} width="74%" />
        </div>
      ) : latest ? (
        <>
          <p className="hero-brief-text">{latest.body}</p>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
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
