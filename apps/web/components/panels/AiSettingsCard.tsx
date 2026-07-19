'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useAiStatus, useConnectDeepSeek } from '@/lib/hooks/ai';
import { Button, Card, Input, Skeleton } from '@/components/ui';

/**
 * The AI provider connection, now a Settings concern — the AI itself is
 * ambient (⌘K / ⌘J / the Home brief), so the key + usage meter live here.
 */
export function AiSettingsCard() {
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
    <Card stack style={{ marginTop: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong className="row" style={{ gap: 8 }}>
          <Sparkles size={15} aria-hidden style={{ color: 'var(--brand)' }} />
          Atlas AI
        </strong>
        {status && (
          <span className="muted" style={{ fontSize: 12 }}>
            {status.providerConfigured ? `connected · ${status.model}` : 'not connected'}
          </span>
        )}
      </div>

      {statusQuery.isPending ? (
        <Skeleton height={14} width={260} />
      ) : status?.providerConfigured ? (
        <div className="muted" style={{ fontSize: 13 }}>
          {status.tokensUsedToday.toLocaleString()} of {status.dailyTokenCap.toLocaleString()}{' '}
          tokens used today. Chat (⌘J) and capture (⌘K) are live; semantic memory runs locally and
          costs nothing.
        </div>
      ) : (
        <form className="stack" onSubmit={submitKey}>
          <div className="muted" style={{ fontSize: 13 }}>
            Connect a DeepSeek API key to enable chat, capture routing and daily briefs. Your key
            is encrypted before it&apos;s stored.
          </div>
          <Input
            type="password"
            placeholder="DeepSeek API key (sk-...)"
            aria-label="DeepSeek API key"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
          />
          <div className="row">
            <Button type="submit" disabled={connect.isPending}>
              {connect.isPending ? 'Connecting…' : 'Connect'}
            </Button>
          </div>
          {connectError && <div className="error">{connectError}</div>}
        </form>
      )}
    </Card>
  );
}
