'use client';

import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api';
import {
  useGoogleConnectStart,
  useGoogleDisconnect,
  useGoogleStatus,
  useGoogleSync,
} from '@/lib/hooks/google';
import { Button, Card, ErrorState, Skeleton } from '@/components/ui';

/**
 * Connect / sync / disconnect Google Calendar.
 *
 * Lives here rather than inline in Settings because connecting your calendar is
 * something you think of ON the calendar, not while hunting through settings.
 * Both surfaces render the same component, so the two can never drift.
 *
 * `compact` trims the explanation for the domain page, where the surrounding
 * context already makes it obvious what a calendar connection is for.
 */
export function GoogleCalendarCard({ compact = false }: { compact?: boolean }) {
  const [flash, setFlash] = useState<string | null>(null);
  const statusQuery = useGoogleStatus();
  const connectStart = useGoogleConnectStart();
  const sync = useGoogleSync();
  const disconnect = useGoogleDisconnect();

  // Set by the OAuth callback redirect (?google=connected|denied). Handled here
  // so the message appears on whichever page started the flow.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('google');
    if (param === 'connected') setFlash('Google Calendar connected. Run a sync to pull your events in.');
    if (param === 'denied') setFlash('Google Calendar connection was cancelled.');
    if (param) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const status = statusQuery.data ?? null;
  const busy = connectStart.isPending || sync.isPending || disconnect.isPending;
  const result = sync.data ?? null;
  const error = connectStart.error
    ? errorMessage(connectStart.error, 'Failed to start Google connect')
    : sync.error
      ? errorMessage(sync.error, 'Sync failed')
      : disconnect.error
        ? errorMessage(disconnect.error, 'Failed to disconnect')
        : null;

  function connect() {
    connectStart.mutate(undefined, {
      onSuccess: ({ url }) => {
        // Full navigation, not a popup: Google blocks its consent screen in many
        // embedded/popup contexts, and the callback needs our session cookie.
        window.location.href = url;
      },
    });
  }

  // A server with no Google OAuth client cannot connect anything, so on a domain
  // page it shows nothing at all rather than a button that cannot work.
  if (compact && status && !status.configured) return null;

  return (
    <Card stack>
      {flash && <div className="connect-flash">{flash}</div>}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Google Calendar</strong>
        {status && (
          <span className="muted" style={{ fontSize: 12 }}>
            {!status.configured
              ? 'unavailable on this server'
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
          message={errorMessage(statusQuery.error, 'Failed to load connector status')}
          onRetry={() => void statusQuery.refetch()}
        />
      ) : status === null ? null : !status.configured ? (
        <span className="muted" style={{ fontSize: 13 }}>
          This server has no Google OAuth client configured.
        </span>
      ) : (
        <>
          {!compact && (
            <div className="muted" style={{ fontSize: 13 }}>
              Two-way sync. Your Google events appear in Atlas and events you add here are pushed to
              Google. If the same event changes in both places, Google wins. Atlas never deletes
              anything from your Google calendar.
            </div>
          )}
          {compact && !status.connected && (
            <div className="muted" style={{ fontSize: 13 }}>
              Pull your Google events in and push the ones you add here back out.
            </div>
          )}
          <div className="row">
            {status.connected ? (
              <>
                <Button onClick={() => sync.mutate()} disabled={busy}>
                  {sync.isPending ? 'Syncing…' : 'Sync now'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => disconnect.mutate(undefined, { onSuccess: () => sync.reset() })}
                  disabled={busy}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={connect} disabled={busy}>
                {connectStart.isPending ? '…' : 'Connect Google Calendar'}
              </Button>
            )}
          </div>
        </>
      )}

      {result && (
        <div className="muted" style={{ fontSize: 13 }}>
          Synced: {result.imported} imported, {result.updated} updated, {result.pushed} pushed,{' '}
          {result.deleted} removed.
          {result.errors.length > 0 && ` ${result.errors.length} error(s).`}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </Card>
  );
}
