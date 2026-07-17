'use client';

import { useCallback, useEffect, useState } from 'react';
import { AiApi, ApiError } from '@/lib/api';
import { ChatPanel } from './ChatPanel';
import { BrainDumpPanel } from './BrainDumpPanel';
import { DailyBriefPanel } from './DailyBriefPanel';

export function AiPanel() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof AiApi.status>> | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await AiApi.status());
    } catch {
      /* not signed in yet / ignore */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!keyDraft.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      await AiApi.connectDeepSeek(keyDraft.trim());
      setKeyDraft('');
      await loadStatus();
    } catch (err) {
      setConnectError(err instanceof ApiError ? err.message : 'Failed to save key');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <>
      <div className="section-title">Atlas AI</div>

      {status && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          {status.providerConfigured
            ? `Connected · ${status.model} · ${status.tokensUsedToday}/${status.dailyTokenCap} tokens used today`
            : 'Not connected yet'}
        </div>
      )}

      {status && !status.providerConfigured && (
        <form className="card stack" onSubmit={connect} style={{ marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Connect a DeepSeek API key to enable chat, daily briefs, and auto-organize. Your key is
            encrypted before it&apos;s stored. Semantic memory runs locally and needs no key.
          </div>
          <input
            className="input"
            type="password"
            placeholder="DeepSeek API key (sk-...)"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
          />
          <button className="btn" type="submit" disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
          {connectError && <div className="error">{connectError}</div>}
        </form>
      )}

      {status?.providerConfigured && (
        <>
          <ChatPanel />
          <BrainDumpPanel />
          <DailyBriefPanel />
        </>
      )}
    </>
  );
}
