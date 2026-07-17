'use client';

import { errorMessage } from '@/lib/api';
import { useGenerateDailyBrief, useInsights } from '@/lib/hooks/ai';
import { Button, Card, CardListSkeleton, ErrorState } from '@/components/ui';

export function DailyBriefPanel() {
  const insightsQuery = useInsights();
  const generate = useGenerateDailyBrief();

  const insights = insightsQuery.data ?? [];
  const error = generate.error ? errorMessage(generate.error, 'Failed to generate brief') : null;

  return (
    <Card stack>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="section-title" style={{ margin: 0 }}>Daily brief</div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? 'Writing…' : "Generate today's brief"}
        </Button>
      </div>
      {error && <div className="error">{error}</div>}
      {insightsQuery.isPending ? (
        <CardListSkeleton cards={1} lines={3} />
      ) : insightsQuery.isError ? (
        <ErrorState
          message={errorMessage(insightsQuery.error, 'Failed to load briefs')}
          onRetry={() => void insightsQuery.refetch()}
        />
      ) : insights.length === 0 ? (
        <span className="muted" style={{ fontSize: 13 }}>No briefs yet.</span>
      ) : (
        <div className="stack">
          {insights.map((i) => (
            <Card key={i.id}>
              <strong>{i.title}</strong>
              <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{i.body}</div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}
