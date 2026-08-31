'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LayoutGrid, LogOut, MessageCircle, PanelLeft, Search } from 'lucide-react';
import { useMe, useLogout } from '@/lib/hooks/auth';
import { useTimezoneSync } from '@/lib/hooks/timezone';
import { IconButton, Kbd, Skeleton } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { AuthGate } from '@/components/AuthGate';
import { NavBar } from '@/components/NavBar';
import { SectionTabs } from '@/components/SectionTabs';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AtlasUiProvider, useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { AtlasLoadingScreen } from '@/components/atlas/AtlasLoadingScreen';
import { hasSignedInBefore } from '@/lib/session-hint';
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

  if (me.isPending) return <BootScreen />;

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
  const { sidebarCollapsed, toggleSidebar, setCommandOpen, setChatOpen, chatOpen, focusMode } =
    useAtlasUi();
  const initial = name.trim().charAt(0).toUpperCase() || 'A';

  return (
    // `chat-open` lets a wide screen make ROOM for the rail instead of being
    // covered by it — see the rule in globals.css.
    <div className={`app-layout ${chatOpen ? 'chat-open' : ''}`}>
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
      {/* Stands down during a flow that owns the screen, for the same reason
          the bottom nav and the capture dock already do: search, notifications
          and chat can do nothing for an account with no data yet, and offering
          three dead controls above someone's first question is the difference
          between a setup flow and an app they have been dropped into.
          Measured on the first-run frames — the ones the rig had never
          captured — where this bar was the only thing on screen that was not
          part of the wizard. */}
      {!focusMode && (
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
      )}

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
          sidebar that holds it is hidden below 901px. Both it and the capture
          dock stand down while a flow owns the screen (first-run onboarding):
          neither can do anything useful for an account with no data yet, and
          the nav is four ways out of a three-step wizard. */}
      {!focusMode && (
        <div className="bottom-nav">
          <NavBar withEverything />
        </div>
      )}

      {!focusMode && <CaptureDock />}
      <CommandBar />
      <ChatRail />
    </div>
  );
}

/**
 * What a returning user looks at while `/auth/me` answers.
 *
 * That round trip is ~900ms against a hosted database, and it used to be a
 * centred logo reading "Waking Atlas…" — a splash screen, which is what an app
 * shows when it has nothing better to say. For someone who has signed in on
 * this browser before, there IS something better: the shape of their own app,
 * so the wait reads as their screen arriving rather than the product booting.
 *
 * The hint is not authentication and is never treated as any part of it (see
 * `session-hint.ts`). Being wrong costs an empty frame for a moment before the
 * sign-in screen replaces it.
 *
 * Resolved in an effect rather than read during render: localStorage does not
 * exist on the server, so reading it inline would be a hydration mismatch. The
 * splash therefore shows for one frame before the frame appears, which is
 * invisible next to the ~900ms it replaces.
 */
function BootScreen() {
  const [returning, setReturning] = useState(false);
  useEffect(() => setReturning(hasSignedInBefore()), []);

  if (!returning) {
    return (
      <div className="gate-shell">
        <div className="gate-body">
          <AtlasLoadingScreen messages={['Waking Atlas…']} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout" role="status" aria-label="Loading Atlas">
      <aside className="sidebar">
        <div className="sidebar-top">
          <span className="brand sidebar-brand">
            <Logo size={26} />
            <span className="wordmark">Atlas</span>
          </span>
        </div>
        <nav className="sidebar-nav" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={34} />
          ))}
        </nav>
      </aside>
      <main className="main" aria-hidden>
        <div className="stream">
          <Skeleton height={22} width="38%" />
          <Skeleton height={150} />
          <Skeleton height={96} />
          <Skeleton height={54} />
        </div>
      </main>
    </div>
  );
}
