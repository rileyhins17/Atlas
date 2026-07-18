'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useMe, useLogout } from '@/lib/hooks/auth';
import { IconButton } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { AuthGate } from '@/components/AuthGate';
import { AtlasAsks } from '@/components/AtlasAsks';
import { NavBar } from '@/components/NavBar';
import { InstallPrompt } from '@/components/InstallPrompt';

/**
 * The signed-in frame around every route: header (brand, user, sign-out),
 * nav, and the AtlasAsks question cards. Unauthenticated visitors see the
 * auth gate instead, whatever the URL — after signing in they land on the
 * route they asked for.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();

  if (me.isPending) {
    return (
      <div className="container center">
        <span className="muted">Loading…</span>
      </div>
    );
  }

  if (!me.data) {
    return (
      <div className="container">
        <div className="gate-brand">
          <Logo size={44} />
          <span className="wordmark" style={{ fontSize: 26 }}>
            Atlas
          </span>
        </div>
        <AuthGate />
      </div>
    );
  }

  return (
    <div className="container">
      <header className="app-header">
        <Link href="/today" className="brand" aria-label="Atlas home">
          <Logo size={28} />
          <span className="wordmark">Atlas</span>
        </Link>
        <div className="app-header-actions">
          <span className="app-header-user">Hi, {me.data.displayName ?? me.data.email}</span>
          <IconButton label="Sign out" onClick={() => logout.mutate()}>
            <LogOut size={18} aria-hidden />
          </IconButton>
        </div>
      </header>

      <NavBar />
      <InstallPrompt />
      <AtlasAsks />
      <main>{children}</main>
    </div>
  );
}
