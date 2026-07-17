'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { useAiStatus, useConnectDeepSeek } from '@/lib/hooks/ai';
import { Button, Card, Input, Skeleton } from '@/components/ui';
import { ChatPanel } from './ChatPanel';
import { BrainDumpPanel } from './BrainDumpPanel';
import { DailyBriefPanel } from './DailyBriefPanel';

export function AiPanel() {
  const [keyDraft, setKeyDraft] = useState('');
  const statusQuery = useAiStatus();
  const connect = useConnectDeepSeek();

  const status = statusQuery.data;
  const connectError = connect.error ? errorMessage(connect.error, 'Failed to save key') : null;

  function submitKey(e: React.FormEvent) {
    e.preventDefault();
    if (!keyDraft.trim()) return;
    connect.mutate(keyDraft.trim(), { onSuccess: () => setKeyDraft('') });
  }

  return (
    <>
      <div className="section-title">Atlas AI</div>

      {statusQuery.isPending ? (
        <div style={{ marginBottom: 12 }}>
          <Skeleton height={14} width={260} />
        </div>
      ) : (
        status && (
          <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            {status.providerConfigured
              ? `Connected · ${status.model} · ${status.tokensUsedToday}/${status.dailyTokenCap} tokens used today`
              : 'Not connected yet'}
          </div>
        )
      )}

      {status && !status.providerConfigured && (
        <Card stack style={{ marginBottom: 16 }}>
          <form className="stack" onSubmit={submitKey}>
            <div className="muted" style={{ fontSize: 13 }}>
              Connect a DeepSeek API key to enable chat, daily briefs, and auto-organize. Your key is
              encrypted before it&apos;s stored. Semantic memory runs locally and needs no key.
            </div>
            <Input
              type="password"
              placeholder="DeepSeek API key (sk-...)"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
            />
            <Button type="submit" disabled={connect.isPending}>
              {connect.isPending ? 'Connecting…' : 'Connect'}
            </Button>
            {connectError && <div className="error">{connectError}</div>}
          </form>
        </Card>
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
