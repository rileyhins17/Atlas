'use client';

import { useQuery } from '@tanstack/react-query';
import { ratePercent } from '@atlas/shared';
import { AdminApi, errorMessage } from '@/lib/api';
import { Card, ErrorState, ListSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';

/** A percentage, or an honest dash when the denominator cannot carry one. */
function Rate({ part, whole, label }: { part: number; whole: number; label: string }) {
  const pct = ratePercent(part, whole);
  return (
    <div className="adm-stat">
      <span className="adm-n">{pct === null ? '—' : `${pct}%`}</span>
      <span className="adm-l">{label}</span>
      <span className="adm-sub">
        {part} of {whole}
        {pct === null ? ' · too few to rate' : ''}
      </span>
    </div>
  );
}

/**
 * Whether anyone is actually using this.
 *
 * Derived from `users.createdAt` and `timeline_events` — no tracking script, no
 * third party, nothing about anyone's life leaving the server. Owner-only; the
 * API answers 403 for every other account.
 */
export function AdminPanel() {
  const q = useQuery({ queryKey: ['admin', 'adoption'], queryFn: AdminApi.adoption, retry: false });

  if (q.isPending) return <ListSkeleton rows={4} circle={false} />;
  if (q.isError) {
    return (
      <ErrorState
        message={errorMessage(q.error, 'Not available')}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const a = q.data;
  return (
    <>
      <PageHeader title="Adoption" subtitle="Derived from stored activity — nothing is tracked." />

      <Card stack>
        <div className="adm-grid">
          <div className="adm-stat">
            <span className="adm-n">{a.totalUsers}</span>
            <span className="adm-l">Accounts</span>
          </div>
          <Rate part={a.activated} whole={a.totalUsers} label="Did anything" />
          <Rate part={a.returnedNextDay} whole={a.totalUsers} label="Came back" />
          <Rate part={a.returnedAfterWeek} whole={a.totalUsers} label="Still there a week on" />
        </div>
      </Card>

      {/* The thesis, as a number. If this stays low, people are buying a to-do
          list from someone who also happens to sell six other things. */}
      <Card stack title="Do they use more than one part of it?">
        <div className="adm-grid">
          <Rate part={a.usedTwoDomains} whole={a.totalUsers} label="Two domains or more" />
          <Rate part={a.usedFourDomains} whole={a.totalUsers} label="Four or more" />
        </div>
        <ul className="adm-domains">
          {a.byDomain.map((d) => (
            <li key={d.source}>
              <span>{d.source}</span>
              <span className="adm-sub">{d.users}</span>
            </li>
          ))}
        </ul>
        {a.byDomain.length === 0 && <p className="prog-muted">No activity recorded yet.</p>}
      </Card>

      <Card stack title="Signups by week">
        <ul className="adm-domains">
          {a.signupsByWeek.map((w) => (
            <li key={w.week}>
              <span>week of {w.week}</span>
              <span className="adm-sub">{w.count}</span>
            </li>
          ))}
        </ul>
        {a.signupsByWeek.length === 0 && <p className="prog-muted">Nobody yet.</p>}
      </Card>

      <p className="prog-muted" style={{ fontSize: 12, marginTop: 12 }}>
        What this cannot tell you: which screens get looked at, or where a signup abandons
        onboarding. Neither leaves a row behind, so both would need real instrumentation.
      </p>
    </>
  );
}
