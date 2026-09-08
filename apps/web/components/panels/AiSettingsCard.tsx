'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useAiStatus, useConnectDeepSeek, useRedeemAiInvite } from '@/lib/hooks/ai';
import { Button, Card, ErrorState, Input, Skeleton } from '@/components/ui';

/**
 * Invite-based AI access, while keeping existing personal connections usable.
 */
export function AiSettingsCard() {
  const [keyDraft, setKeyDraft] = useState('');
  const [inviteDraft, setInviteDraft] = useState('');
  const statusQuery = useAiStatus();
  const connect = useConnectDeepSeek();
  const redeem = useRedeemAiInvite();

  const status = statusQuery.data;
  const access = status?.hostedAccess;
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
        {status && !statusQuery.isError && (
          <span className="muted" style={{ fontSize: 12 }}>
            {access?.granted && !access.revoked ? 'invited member' : status.providerConfigured ? 'personal connection' : 'access setup'}
          </span>
        )}
      </div>

      {statusQuery.isError ? (
        <ErrorState message={errorMessage(statusQuery.error, 'Could not load AI access')} onRetry={() => void statusQuery.refetch()} />
      ) : statusQuery.isPending || !status ? (
        <Skeleton height={14} width={260} />
      ) : access?.granted && !access.revoked ? (
        <div className="stack">
          <p>AI is included with your invite.</p>
          {!access.available ? <p className="muted">Your access is approved. Hosted AI is not available yet; you can still capture and manage your day.</p>
            : !status.enabled ? <p className="muted">AI is currently paused. Your saved data and manual controls remain available.</p>
            : <p className="muted">{status.tokensUsedToday.toLocaleString()} of {status.dailyTokenCap.toLocaleString()} tokens used today. Your allowance resets at midnight UTC.</p>}
        </div>
      ) : access?.revoked ? (
        <p role="status">Hosted AI access has been revoked for this account. Contact the person who invited you. Your saved data remains available.</p>
      ) : access?.inviteRequired ? (
        <form className="stack" onSubmit={(event) => {
          event.preventDefault();
          if (!inviteDraft.trim() || redeem.isPending) return;
          redeem.mutate(inviteDraft.trim(), { onSuccess: () => setInviteDraft('') });
        }}>
          <p>Use your invite to activate included AI. You do not need a DeepSeek account or API key.</p>
          <Input type="password" aria-label="Invite code" autoComplete="off" maxLength={200} value={inviteDraft} onChange={(event) => setInviteDraft(event.target.value)} disabled={redeem.isPending} />
          <Button type="submit" disabled={redeem.isPending || !inviteDraft.trim()}>{redeem.isPending ? 'Activating…' : 'Activate AI access'}</Button>
          {redeem.error && <p role="alert">{errorMessage(redeem.error, 'Could not activate access. Your invite is kept; try again.')}</p>}
        </form>
      ) : status.providerConfigured ? null : (
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
      {!statusQuery.isError && !statusQuery.isPending && status?.providerConfigured && !(access?.granted && !access.revoked && access.available) && (
        <div className="stack muted" style={{ fontSize: 13 }}>
          <p>Your personal AI connection is saved. {status.tokensUsedToday.toLocaleString()} of {status.dailyTokenCap.toLocaleString()} tokens used today across your account.</p>
          {!status.enabled && <p>AI is currently paused. Your saved data and manual controls remain available.</p>}
        </div>
      )}
    </Card>
  );
}
