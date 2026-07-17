'use client';

import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api';
import {
  useGoogleConnectStart,
  useGoogleDisconnect,
  useGoogleStatus,
  useGoogleSync,
} from '@/lib/hooks/google';
import { Button, Card } from '@/components/ui';
import { DataPrivacyPanel } from './DataPrivacyPanel';

export function SettingsPanel({ onSignOut }: { onSignOut: () => void }) {
  // Set by the OAuth callback redirect (?google=connected|denied).
  const [flash, setFlash] = useState<string | null>(null);
  const statusQuery = useGoogleStatus();
  const connectStart = useGoogleConnectStart();
  const sync = useGoogleSync();
  const disconnect = useGoogleDisconnect();

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('google');
    if (param === 'connected') setFlash('Google Calendar connected. Run a sync to pull your events in.');
    if (param === 'denied') setFlash('Google Calendar connection was cancelled.');
    if (param) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const status = statusQuery.data ?? null;
  const busy = connectStart.isPending || sync.isPending || disconnect.isPending;
  const result = sync.data ?? null;
  const error = statusQuery.error
    ? errorMessage(statusQuery.error, 'Failed to load connector status')
    : connectStart.error
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

  return (
    <>
      <div className="section-title">Settings — connections</div>
      {flash && <Card style={{ borderColor: 'var(--brand-alt)' }}>{flash}</Card>}

      <Card stack style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Google Calendar</strong>
          {status && (
            <span className="muted" style={{ fontSize: 12 }}>
              {!status.configured ? 'unavailable on this server' : status.connected ? 'connected' : 'not connected'}
            </span>
          )}
        </div>

        {status === null ? (
          <span className="muted" style={{ fontSize: 13 }}>Loading…</span>
        ) : !status.configured ? (
          <span className="muted" style={{ fontSize: 13 }}>
            This server has no Google OAuth client configured.
          </span>
        ) : (
          <>
            <div className="muted" style={{ fontSize: 13 }}>
              Two-way sync. Your Google events appear in Atlas and events you add here are pushed to
              Google. If the same event changes in both places, Google wins. Atlas never deletes
              anything from your Google calendar.
            </div>
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

      <DataPrivacyPanel onSignOut={onSignOut} />
    </>
  );
}
