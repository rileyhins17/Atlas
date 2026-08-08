'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { LayoutGrid, LogOut, MessageCircle, PanelLeft, Search } from 'lucide-react';
import { useMe, useLogout } from '@/lib/hooks/auth';
import { useTimezoneSync } from '@/lib/hooks/timezone';
import { IconButton, Kbd } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { AuthGate } from '@/components/AuthGate';
import { NavBar } from '@/components/NavBar';
import { SectionTabs } from '@/components/SectionTabs';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AtlasUiProvider, useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { AtlasLoadingScreen } from '@/components/atlas/AtlasLoadingScreen';
import { AsksBell } from '@/components/atlas/AsksPanel';
import { CaptureDock } from '@/components/atlas/CaptureDock';
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
  // Runs before the early returns — hooks cannot be conditional, and it no-ops
  // until `me` resolves anyway.
  useTimezoneSync(me.data);

  if (me.isPending) {
    return (
      <div className="gate-shell">
        <div className="gate-body">
          <AtlasLoadingScreen messages={['Waking Atlas…']} />
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
        {/* The brand lockup belongs to AuthGate, which owns the whole
            sign-in composition. The shell used to render its own copy as well,
            which produced two stacked Atlas headers and a screen of dead space
            between them. */}
        <div className="gate-body">
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
  const pathname = usePathname();
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
          {/* The domain pages, one level down. They are complete and unchanged
              — they simply stopped competing with the question you opened the
              app to answer. */}
          <Link
            href="/everything"
            className={`sidebar-everything ${pathname === '/everything' ? 'on' : ''}`}
            title="Every part of Atlas"
          >
            <LayoutGrid size={17} aria-hidden />
            {!sidebarCollapsed && <span>Everything</span>}
          </Link>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar" aria-hidden>
              {initial}
            </span>
            <span className="sidebar-user-name">{name}</span>
          </div>
          <div className="row sidebar-actions" style={{ gap: 2 }}>
            <AsksBell />
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

      {/* Three, not six.
          The phone bar carried search, asks, chat, theme, settings AND sign-out
          on every screen — six controls above the content before you had done
          anything, two of which (theme, sign out) are touched about twice a
          year. Both moved into Settings, which is one tap away and is where
          people look for them; settings itself is reachable from Everything and
          from ⌘K. What is left is the three ambient things you actually use
          from any screen. */}
      <header className="mobile-topbar">
        <Link href="/today" className="brand" aria-label="Atlas home">
          <Logo size={24} />
          <span className="wordmark">Atlas</span>
        </Link>
        <div className="row" style={{ gap: 2 }}>
          <IconButton label="Search and capture" onClick={() => setCommandOpen(true)}>
            <Search size={18} aria-hidden />
          </IconButton>
          <AsksBell />
          <IconButton
            label="Chat with Atlas"
            aria-pressed={chatOpen}
            onClick={() => setChatOpen(!chatOpen)}
          >
            <MessageCircle size={18} aria-hidden />
          </IconButton>
        </div>
      </header>

      <main className="main">
        <div className="main-inner">
          <InstallPrompt />
          {/* Second-level nav lives in the shell so every section places it
              identically, instead of each page inventing its own header. */}
          <SectionTabs />
          {children}
        </div>
      </main>

      {/* The phone's only navigation, so it carries "Everything" too — the
          sidebar that holds it is hidden below 901px. */}
      <div className="bottom-nav">
        <NavBar withEverything />
      </div>

      <CaptureDock />
      <CommandBar />
      <ChatRail />
    </div>
  );
}
