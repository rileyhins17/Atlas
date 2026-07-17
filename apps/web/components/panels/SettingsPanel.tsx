'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, GoogleApi, type GoogleStatus, type SyncResult } from '@/lib/api';
import { DataPrivacyPanel } from './DataPrivacyPanel';

export function SettingsPanel({ onSignOut }: { onSignOut: () => void }) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set by the OAuth callback redirect (?google=connected|denied).
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await GoogleApi.status());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load connector status');
    }
  }, []);

  useEffect(() => {
    void load();
    const param = new URLSearchParams(window.location.search).get('google');
    if (param === 'connected') setFlash('Google Calendar connected. Run a sync to pull your events in.');
    if (param === 'denied') setFlash('Google Calendar connection was cancelled.');
    if (param) window.history.replaceState({}, '', window.location.pathname);
  }, [load]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await GoogleApi.start();
      // Full navigation, not a popup: Google blocks its consent screen in many
      // embedded/popup contexts, and the callback needs our session cookie.
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start Google connect');
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await GoogleApi.sync());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await GoogleApi.disconnect();
      setResult(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to disconnect');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-title">Settings — connections</div>
      {flash && <div className="card" style={{ borderColor: 'var(--accent-2)' }}>{flash}</div>}

      <div className="card stack" style={{ marginTop: 12 }}>
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
                  <button className="btn" onClick={sync} disabled={busy}>
                    {busy ? 'Syncing…' : 'Sync now'}
                  </button>
                  <button className="btn ghost" onClick={disconnect} disabled={busy}>
                    Disconnect
                  </button>
                </>
              ) : (
                <button className="btn" onClick={connect} disabled={busy}>
                  {busy ? '…' : 'Connect Google Calendar'}
                </button>
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
      </div>

      <DataPrivacyPanel onSignOut={onSignOut} />
    </>
  );
}
