'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Landmark } from 'lucide-react';
import { PlaidApi, errorMessage, type SyncResult } from '@/lib/api';
import {
  usePlaidDisconnect,
  usePlaidExchange,
  usePlaidStatus,
  usePlaidSync,
} from '@/lib/hooks/plaid';
import { Button, Card, ErrorState, Skeleton, useToast } from '@/components/ui';

export function PlaidCard() {
  const { toast } = useToast();
  const statusQuery = usePlaidStatus();
  const exchange = usePlaidExchange();
  const sync = usePlaidSync();
  const disconnect = usePlaidDisconnect();

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  const onSuccess = useCallback(
    (publicToken: string) => {
      setLinkToken(null);
      exchange.mutate(publicToken, {
        onSuccess: (res) => {
          setResult(res);
          toast('Bank connected', 'success');
        },
        onError: (e) => setError(errorMessage(e, 'Failed to connect bank')),
      });
    },
    [exchange, toast],
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  // Open the Plaid Link widget as soon as we have a token and it's initialized.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function connect() {
    setError(null);
    setStarting(true);
    try {
      const { linkToken: token } = await PlaidApi.linkToken();
      setLinkToken(token);
    } catch (e) {
      setError(errorMessage(e, 'Failed to start bank connection'));
    } finally {
      setStarting(false);
    }
  }

  const status = statusQuery.data ?? null;
  const busy = starting || exchange.isPending || sync.isPending || disconnect.isPending;

  return (
    <Card stack style={{ marginTop: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Bank accounts (Plaid)</strong>
        {status && (
          <span className="muted" style={{ fontSize: 12 }}>
            {!status.configured
              ? 'unavailable on this server'
              : status.connected
                ? `${status.items.length} connected`
                : 'not connected'}
          </span>
        )}
      </div>

      {statusQuery.isPending ? (
        <div className="stack" style={{ gap: 8 }}>
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="55%" />
        </div>
      ) : statusQuery.isError ? (
        <ErrorState
          message={errorMessage(statusQuery.error, 'Failed to load Plaid status')}
          onRetry={() => void statusQuery.refetch()}
        />
      ) : status === null ? null : !status.configured ? (
        <span className="muted" style={{ fontSize: 13 }}>
          This server has no Plaid credentials configured.
        </span>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 13 }}>
            Securely link your bank through Plaid to pull accounts and transactions into Atlas.
            Read-only — Atlas never moves money or writes to your bank.
          </div>

          {status.items.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              {status.items.map((item) => (
                <div className="task" key={item.itemId}>
                  <Landmark size={16} aria-hidden className="muted" />
                  <div className="title">
                    <div>{item.institution ?? 'Linked bank'}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {item.lastSyncedAt
                        ? `Last synced ${new Date(item.lastSyncedAt).toLocaleString()}`
                        : 'Not synced yet'}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => disconnect.mutate(item.itemId)}
                    disabled={busy}
                  >
                    Disconnect
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="row">
            <Button onClick={connect} disabled={busy}>
              {starting ? '…' : status.connected ? 'Connect another bank' : 'Connect a bank'}
            </Button>
            {status.connected && (
              <Button
                variant="ghost"
                onClick={() =>
                  sync.mutate(undefined, {
                    onSuccess: (res) => setResult(res),
                    onError: (e) => setError(errorMessage(e, 'Sync failed')),
                  })
                }
                disabled={busy}
              >
                {sync.isPending ? 'Syncing…' : 'Sync now'}
              </Button>
            )}
          </div>
        </>
      )}

      {result && (
        <div className="muted" style={{ fontSize: 13 }}>
          Synced: {result.imported} new, {result.updated} updated, {result.deleted} removed.
          {result.errors.length > 0 && ` ${result.errors.join('; ')}`}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </Card>
  );
}
