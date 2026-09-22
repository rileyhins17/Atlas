'use client';

import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api';
import {
  useWearablesConnectStart,
  useWearablesDisconnect,
  useWearablesStatus,
  useWearablesSync,
} from '@/lib/hooks/wearables';
import { formatAgo } from '@/lib/dates';
import { Button, Card, ErrorState, Skeleton } from '@/components/ui';

/**
 * Connect a Fitbit or Pixel Watch, through Google Health.
 *
 * Same shape as the Google Calendar card on purpose — the same account, the
 * same consent screen, the same "the redirect URI must match" trap — with two
 * differences that come from what the data is: it is read-only, and
 * disconnecting can also delete what was imported, because someone ending a
 * health integration may want the copy gone rather than merely frozen.
 */
export function WearablesCard() {
  const [flash, setFlash] = useState<string | null>(null);
  const statusQuery = useWearablesStatus();
  const connectStart = useWearablesConnectStart();
  const sync = useWearablesSync();
  const disconnect = useWearablesDisconnect();

  // Set by the OAuth callback redirect (?health=connected|denied|state).
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('health');
    if (param === 'connected') setFlash('Watch connected. Your last month is coming in.');
    if (param === 'denied') setFlash('Connecting your watch was cancelled.');
    if (param === 'state')
      setFlash('That took too long, so the sign-in link expired. Press Connect and it will work.');
    if (param) window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }, []);

  const status = statusQuery.data ?? null;
  const busy = connectStart.isPending || sync.isPending || disconnect.isPending;
  const error = connectStart.error
    ? errorMessage(connectStart.error, 'Failed to start connecting')
    : sync.error
      ? errorMessage(sync.error, 'Sync failed')
      : null;

  function connect() {
    connectStart.mutate(undefined, {
      // Full navigation: Google blocks consent in popups, and the callback
      // needs the session cookie.
      onSuccess: ({ url }) => {
        window.location.href = url;
      },
    });
  }

  return (
    <Card stack>
      {flash && <div className="connect-flash">{flash}</div>}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Fitbit &amp; Pixel Watch</strong>
        {status && (
          <span className="muted" style={{ fontSize: 13 }}>
            {!status.configured
              ? 'unavailable on this server'
              : status.needsReconnect
                ? 'needs reconnecting'
                : status.connected
                  ? 'connected'
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
          message={errorMessage(statusQuery.error, 'Failed to load the watch connection')}
          onRetry={() => void statusQuery.refetch()}
        />
      ) : status === null ? null : !status.configured ? (
        <span className="muted" style={{ fontSize: 14 }}>
          This server has no Google OAuth client configured.
        </span>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 14 }}>
            Atlas reads your sleep, steps, resting heart rate and workouts from Google Health, so they
            sit next to your mood, training and plans. Read-only — Atlas never changes your health
            data.
          </div>

          {status.needsReconnect && (
            <div className="connect-flash">
              Google stopped accepting Atlas&apos;s access, which it does every seven days while the
              app is being tested. Reconnect to keep your watch syncing.
            </div>
          )}

          <div className="row" style={{ flexWrap: 'wrap' }}>
            {status.connected && !status.needsReconnect ? (
              <>
                <Button onClick={() => sync.mutate()} disabled={busy}>
                  {sync.isPending ? 'Syncing…' : 'Sync now'}
                </Button>
                <Button variant="ghost" onClick={() => disconnect.mutate(false)} disabled={busy}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={connect} disabled={busy}>
                {connectStart.isPending ? '…' : status.needsReconnect ? 'Reconnect' : 'Connect your watch'}
              </Button>
            )}
          </div>

          {status.connected && (
            <div className="muted" style={{ fontSize: 13 }}>
              {status.lastSyncedAt
                ? `Last synced ${formatAgo(new Date(status.lastSyncedAt))}.`
                : 'Not synced yet.'}{' '}
              <button
                type="button"
                className="wear-forget"
                onClick={() => {
                  if (window.confirm('Disconnect your watch and delete everything Atlas imported from it?')) {
                    disconnect.mutate(true);
                  }
                }}
                disabled={busy}
              >
                Disconnect and delete watch data
              </button>
            </div>
          )}
        </>
      )}

      {status && status.configured && !status.connected && status.redirectUri && (
        <details className="gc-redirect">
          <summary>Connect sends you to a Google error?</summary>
          <p>
            Google must have this exact address in your OAuth client&apos;s{' '}
            <strong>Authorized redirect URIs</strong>, and the Google Health API must be enabled on the
            project:
          </p>
          <code>{status.redirectUri}</code>
        </details>
      )}

      {sync.data?.ran && (
        <div className="muted" style={{ fontSize: 13 }}>
          Synced {sync.data.days} day{sync.data.days === 1 ? '' : 's'} and {sync.data.activities}{' '}
          workout{sync.data.activities === 1 ? '' : 's'}.
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </Card>
  );
}
