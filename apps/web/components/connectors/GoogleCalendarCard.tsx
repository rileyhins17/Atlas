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
 *
 * `inline` goes further and drops the card entirely for a single row. On the
 * calendar page the full card was the loudest thing on the screen — a 170px
 * setup prompt with the page's only filled button, sitting above the events.
 * At phone width it pushed every event below the fold, so the answer to "what
 * is on this week" was "connect your Google account". Setup is not content.
 * The row keeps the same accessible names, so the same button is still there
 * for anyone looking for it.
 */
export function GoogleCalendarCard({
  compact = false,
  inline = false,
}: {
  compact?: boolean;
  inline?: boolean;
}) {
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
    if (param === 'state')
      setFlash('That took too long, so the sign-in link expired. Press Connect and it will work.');
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
  if ((compact || inline) && status && !status.configured) return null;

  if (inline) {
    // Nothing at all until the status is known: a row that appears a beat late
    // is far better than one that shifts the events down as it resolves.
    if (!status?.configured) return null;
    return (
      <div className="gc-inline">
        <div className="gc-inline-row">
          <span className={`gc-dot ${status.connected ? 'on' : ''}`} aria-hidden />
          <span className="gc-inline-label">
            Google Calendar{' '}
            <span className="gc-inline-state">{status.connected ? 'connected' : 'not connected'}</span>
          </span>
          {status.connected ? (
            <>
              <button
                type="button"
                className="gc-inline-act"
                onClick={() => sync.mutate()}
                disabled={busy}
              >
                {sync.isPending ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                type="button"
                className="gc-inline-act quiet"
                onClick={() => disconnect.mutate(undefined, { onSuccess: () => sync.reset() })}
                disabled={busy}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="gc-inline-act"
              aria-label="Connect Google Calendar"
              onClick={connect}
              disabled={busy}
            >
              {connectStart.isPending ? '…' : 'Connect'}
            </button>
          )}
        </div>
        {/* Everything below only exists once you have acted, so it costs no
            space on the screen you actually came to read. */}
        {flash && <p className="gc-inline-note">{flash}</p>}
        {result && (
          <p className="gc-inline-note">
            Synced: {result.imported} imported, {result.updated} updated, {result.pushed} pushed,{' '}
            {result.deleted} removed.
            {result.errors.length > 0 && ` ${result.errors.length} error(s).`}
          </p>
        )}
        {error && <p className="error gc-inline-note">{error}</p>}
        {!status.connected && status.redirectUri && (
          <details className="gc-redirect">
            <summary>Connect button sends you to a Google error?</summary>
            <p>
              Google must have this exact address in your OAuth client&apos;s{' '}
              <strong>Authorized redirect URIs</strong>:
            </p>
            <code>{status.redirectUri}</code>
          </details>
        )}
      </div>
    );
  }

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

      {/* `redirect_uri_mismatch` is Google refusing before Atlas is involved,
          and nothing in the app can fix it — but it is trivially fixed by
          whoever can paste this exact string into the OAuth client's authorized
          redirect URIs. Showing it beats a dead end on Google's error page.
          Not a secret: it appears in the browser's URL bar during consent. */}
      {status && status.configured && !status.connected && status.redirectUri && (
        <details className="gc-redirect">
          <summary>Connect button sends you to a Google error?</summary>
          <p>
            Google must have this exact address in your OAuth client&apos;s{' '}
            <strong>Authorized redirect URIs</strong>:
          </p>
          <code>{status.redirectUri}</code>
        </details>
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
