'use client';

import { useCallback, useEffect, useState } from 'react';
import type { InsightDTO } from '@atlas/shared';
import { AiApi, ApiError } from '@/lib/api';

export function DailyBriefPanel() {
  const [insights, setInsights] = useState<InsightDTO[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInsights(await AiApi.insights());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load briefs');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await AiApi.dailyBrief();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate brief');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="section-title" style={{ margin: 0 }}>Daily brief</div>
        <button className="btn" onClick={generate} disabled={busy}>
          {busy ? 'Writing…' : "Generate today's brief"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {insights.length === 0 ? (
        <span className="muted" style={{ fontSize: 13 }}>No briefs yet.</span>
      ) : (
        <div className="stack">
          {insights.map((i) => (
            <div key={i.id} className="card">
              <strong>{i.title}</strong>
              <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{i.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
