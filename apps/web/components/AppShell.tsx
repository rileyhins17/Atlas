'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogOut, MessageCircle, PanelLeft, Search, Settings as SettingsIcon } from 'lucide-react';
import { useMe, useLogout } from '@/lib/hooks/auth';
import { IconButton, Kbd } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { AuthGate } from '@/components/AuthGate';
import { NavBar } from '@/components/NavBar';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AtlasUiProvider, useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { CommandBar } from '@/components/atlas/CommandBar';
import { ChatRail } from '@/components/atlas/ChatRail';

/**
 * The signed-in frame: collapsible sidebar (⌘\), main canvas, and the ambient
 * AI — command bar (⌘K) and chat rail (⌘J) — mounted once for every screen.
 * Mobile: top bar + fixed bottom tabs. Unauthenticated visitors get the
 * sign-in screen at any URL and land where they asked after signing in.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();

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
  return (
    <AtlasUiProvider>
      <Frame name={name}>{children}</Frame>
    </AtlasUiProvider>
  );
}

function Frame({ name, children }: { name: string; children: ReactNode }) {
  const logout = useLogout();
  const { sidebarCollapsed, toggleSidebar, setCommandOpen, setChatOpen, chatOpen } = useAtlasUi();
  const initial = name.trim().charAt(0).toUpperCase() || 'A';

  return (
    <div className="app-layout">
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-top">
          <Link href="/today" className="brand sidebar-brand" aria-label="Atlas home">
            <Logo size={26} />
            <span className="wordmark">Atlas</span>
          </Link>
          <IconButton
            label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title="⌘\"
            onClick={toggleSidebar}
          >
            <PanelLeft size={17} aria-hidden />
          </IconButton>
        </div>

        <button type="button" className="sidebar-search" onClick={() => setCommandOpen(true)}>
          <Search size={15} aria-hidden />
          <span className="sidebar-search-label">Ask or add…</span>
          <Kbd>⌘K</Kbd>
        </button>

        <div className="sidebar-nav">
          <NavBar collapsed={sidebarCollapsed} />
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar" aria-hidden>
              {initial}
            </span>
            <span className="sidebar-user-name">{name}</span>
          </div>
          <div className="row sidebar-actions" style={{ gap: 2 }}>
            <IconButton
              label="Chat with Atlas"
              title="⌘J"
              aria-pressed={chatOpen}
              onClick={() => setChatOpen(!chatOpen)}
            >
              <MessageCircle size={17} aria-hidden />
            </IconButton>
            <ThemeToggle />
            <IconButton label="Sign out" onClick={() => logout.mutate()}>
              <LogOut size={17} aria-hidden />
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
          <IconButton label="Search and capture" onClick={() => setCommandOpen(true)}>
            <Search size={18} aria-hidden />
          </IconButton>
          <IconButton
            label="Chat with Atlas"
            aria-pressed={chatOpen}
            onClick={() => setChatOpen(!chatOpen)}
          >
            <MessageCircle size={18} aria-hidden />
          </IconButton>
          <ThemeToggle />
          <Link href="/settings" className="icon-btn" aria-label="Settings">
            <SettingsIcon size={18} aria-hidden />
          </Link>
          <IconButton label="Sign out" onClick={() => logout.mutate()}>
            <LogOut size={18} aria-hidden />
          </IconButton>
        </div>
      </header>

      <main className="main">
        <div className="main-inner">
          <InstallPrompt />
          {children}
        </div>
      </main>

      <div className="bottom-nav">
        <NavBar />
      </div>

      <CommandBar />
      <ChatRail />
    </div>
  );
}
