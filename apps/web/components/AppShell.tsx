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
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * The signed-in frame: a persistent sidebar (brand, nav, account) on desktop,
 * a top bar + fixed bottom tab bar on mobile, and the routed content in a
 * centred main column. Unauthenticated visitors get the sign-in screen at any
 * URL and land where they asked after signing in.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();

  if (me.isPending) {
    return (
      <div className="gate-shell">
        <div className="gate-body">
          <span className="muted">Loading…</span>
        </div>
      </div>
    );
  }

  if (!me.data) {
    return (
      <div className="gate-shell">
        <div className="gate-toolbar">
          <ThemeToggle />
        </div>
        <div className="gate-body">
          <div className="gate-brand">
            <Logo size={46} />
            <span className="wordmark" style={{ fontSize: 27 }}>
              Atlas
            </span>
          </div>
          <AuthGate />
        </div>
      </div>
    );
  }

  const name = me.data.displayName ?? me.data.email;
  const initial = name.trim().charAt(0).toUpperCase() || 'A';

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link href="/today" className="brand sidebar-brand" aria-label="Atlas home">
          <Logo size={26} />
          <span className="wordmark">Atlas</span>
        </Link>

        <div className="sidebar-nav">
          <NavBar />
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar" aria-hidden>
              {initial}
            </span>
            <span className="sidebar-user-name">Hi, {name}</span>
          </div>
          <div className="row" style={{ gap: 2 }}>
            <ThemeToggle />
            <IconButton label="Sign out" onClick={() => logout.mutate()}>
              <LogOut size={18} aria-hidden />
            </IconButton>
          </div>
        </div>
      </aside>

      <header className="mobile-topbar">
        <Link href="/today" className="brand" aria-label="Atlas home">
          <Logo size={24} />
          <span className="wordmark">Atlas</span>
        </Link>
        <div className="row" style={{ gap: 2 }}>
          <ThemeToggle />
          <IconButton label="Sign out" onClick={() => logout.mutate()}>
            <LogOut size={18} aria-hidden />
          </IconButton>
        </div>
      </header>

      <main className="main">
        <div className="main-inner">
          <InstallPrompt />
          <AtlasAsks />
          {children}
        </div>
      </main>

      <div className="bottom-nav">
        <NavBar />
      </div>
    </div>
  );
}
