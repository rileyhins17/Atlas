'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { useLogout } from '@/lib/hooks/auth';
import { useDeleteAccount, useExportData } from '@/lib/hooks/account';
import { Button, Card, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';

export function DataPrivacyPanel({ onSignOut }: { onSignOut: () => void }) {
  const logout = useLogout();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const exportData = useExportData();
  const deleteAccount = useDeleteAccount();

  const busy = exportData.isPending || deleteAccount.isPending;
  const error = exportData.error
    ? errorMessage(exportData.error, 'Export failed')
    : deleteAccount.error
      ? errorMessage(deleteAccount.error, 'Delete failed')
      : null;

  function submitDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!password || deleteAccount.isPending) return;
    // The session is dead server-side on success; drop straight back to the auth gate.
    deleteAccount.mutate(password, { onSuccess: onSignOut });
  }

  function cancelConfirm() {
    setConfirming(false);
    setPassword('');
    deleteAccount.reset();
    exportData.reset();
  }

  return (
    <>
      {/* Appearance and sign-out live here now. They used to exist only as two
          of SIX icon buttons in the phone top bar — on every screen, above the
          content, for two things you touch about twice a year. The section hint
          already promised a sign-out that was nowhere in the section. */}
      <Card stack>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>Appearance</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              Light or dark. Atlas follows your system by default.
            </div>
          </div>
          <ThemeToggle />
        </div>
      </Card>

      <Card stack style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>Sign out</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              Ends this session on this device. Your data stays exactly as it is.
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            {logout.isPending ? '…' : 'Sign out'}
          </Button>
        </div>
      </Card>

      <h2 className="section-title" style={{ marginTop: 20 }}>Data &amp; privacy</h2>

      <Card stack style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>Export my data</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              Download everything Atlas stores about you as a JSON file. Secrets (your API keys) are
              never included.
            </div>
          </div>
          <Button variant="secondary" onClick={() => exportData.mutate()} disabled={busy}>
            {exportData.isPending ? '…' : 'Export'}
          </Button>
        </div>
      </Card>

      <Card stack style={{ marginTop: 12, borderColor: 'var(--danger-role)' }}>
        <strong>Delete my account</strong>
        <div className="muted" style={{ fontSize: 13 }}>
          Permanently deletes your account and all your data — tasks, journal, notes, calendar,
          everything. This cannot be undone.
        </div>

        {!confirming ? (
          <div className="row">
            <Button variant="ghost" onClick={() => setConfirming(true)} disabled={busy}>
              Delete my account…
            </Button>
          </div>
        ) : (
          <form
            className="stack"
            onSubmit={submitDelete}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelConfirm();
            }}
          >
            <Input
              type="password"
              placeholder="Enter your password to confirm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
            <div className="row">
              <Button variant="danger" type="submit" disabled={busy || !password}>
                {deleteAccount.isPending ? 'Deleting…' : 'Permanently delete'}
              </Button>
              <Button variant="ghost" onClick={cancelConfirm} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {error && <div className="error">{error}</div>}
      </Card>
    </>
  );
}
