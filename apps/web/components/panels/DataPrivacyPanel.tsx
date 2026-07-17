'use client';

import { useState } from 'react';
import { AccountApi, ApiError } from '@/lib/api';

export function DataPrivacyPanel({ onSignOut }: { onSignOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');

  async function exportData() {
    setBusy(true);
    setError(null);
    try {
      await AccountApi.downloadExport();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await AccountApi.deleteAccount(password);
      // The session is dead server-side; drop straight back to the auth gate.
      onSignOut();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-title" style={{ marginTop: 20 }}>Data &amp; privacy</div>

      <div className="card stack" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>Export my data</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              Download everything Atlas stores about you as a JSON file. Secrets (your API keys) are
              never included.
            </div>
          </div>
          <button className="btn secondary" onClick={exportData} disabled={busy}>
            {busy ? '…' : 'Export'}
          </button>
        </div>
      </div>

      <div className="card stack" style={{ marginTop: 12, borderColor: 'var(--danger, #c0392b)' }}>
        <strong>Delete my account</strong>
        <div className="muted" style={{ fontSize: 13 }}>
          Permanently deletes your account and all your data — tasks, journal, notes, calendar,
          everything. This cannot be undone.
        </div>

        {!confirming ? (
          <div className="row">
            <button className="btn ghost" onClick={() => setConfirming(true)} disabled={busy}>
              Delete my account…
            </button>
          </div>
        ) : (
          <form className="stack" onSubmit={deleteAccount}>
            <input
              className="input"
              type="password"
              placeholder="Enter your password to confirm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <div className="row">
              <button className="btn" type="submit" disabled={busy || !password}
                style={{ background: 'var(--danger, #c0392b)' }}>
                {busy ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setConfirming(false);
                  setPassword('');
                  setError(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    </>
  );
}
