'use client';

import type { ReactNode } from 'react';
import { useMe, useLogout } from '@/lib/hooks/auth';
import { Button } from '@/components/ui';
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
        <Brand />
        <AuthGate />
      </div>
    );
  }

  return (
    <div className="container">
      <header className="app-header">
        <Brand />
        <div className="row" style={{ gap: 8 }}>
          <span className="muted app-header-user">Hi, {me.data.displayName ?? me.data.email}</span>
          <Button variant="ghost" onClick={() => logout.mutate()}>
            Sign out
          </Button>
        </div>
      </header>

      <NavBar />
      <InstallPrompt />
      <AtlasAsks />
      <main>{children}</main>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <h1>Atlas</h1>
      <span className="tag">your life, in one place</span>
    </div>
  );
}
