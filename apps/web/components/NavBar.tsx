'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Calendar,
  ChevronDown,
  Flame,
  History,
  Home,
  ListTodo,
  Settings,
  StickyNote,
  TrendingUp,
  Wallet,
} from 'lucide-react';

/** Live your life (primary) vs. manage the data behind it (grouped). */
const PRIMARY = [
  { href: '/today', label: 'Today', icon: Home },
  { href: '/history', label: 'History', icon: History },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
] as const;

const MANAGE = [
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/habits', label: 'Habits', icon: Flame },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/notes', label: 'Notes', icon: StickyNote },
  { href: '/finance', label: 'Finance', icon: Wallet },
] as const;

const SETTINGS = { href: '/settings', label: 'Settings', icon: Settings } as const;

/** The five that fit the mobile bottom bar. */
const MOBILE_ITEMS = new Set(['/today', '/history', '/progress', '/tasks', '/settings']);

const MANAGE_PREF_KEY = 'atlas.nav.manage-open';

type NavItem = { href: string; label: string; icon: typeof Home };

function NavLink({
  item,
  active,
  collapsed,
  desktopOnly,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  desktopOnly: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`nav-link ${active ? 'active' : ''} ${desktopOnly ? 'nav-desktop-only' : ''}`}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
    >
      <Icon className="nav-icon" size={20} aria-hidden />
      <span className="nav-label">{item.label}</span>
    </Link>
  );
}

/**
 * v4 navigation: Today · History · Progress up top, the six domain pages in a
 * collapsible "Manage" group (state persisted), Settings last. One nav, two
 * renderings via CSS: sidebar list on desktop, fixed bottom tabs on mobile.
 */
export function NavBar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const [manageOpen, setManageOpen] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(MANAGE_PREF_KEY);
    if (stored !== null) setManageOpen(stored === '1');
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const manageActive = MANAGE.some((i) => isActive(i.href));

  function toggleManage() {
    setManageOpen((open) => {
      window.localStorage.setItem(MANAGE_PREF_KEY, open ? '0' : '1');
      return !open;
    });
  }

  return (
    <nav className="app-nav" aria-label="Sections">
      {PRIMARY.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          active={isActive(item.href)}
          collapsed={collapsed}
          desktopOnly={!MOBILE_ITEMS.has(item.href)}
        />
      ))}

      <button
        type="button"
        className={`nav-group-toggle nav-desktop-only ${manageActive && !manageOpen ? 'has-active' : ''}`}
        aria-expanded={manageOpen}
        onClick={toggleManage}
      >
        <span className="nav-group-label">Manage</span>
        <ChevronDown
          size={14}
          aria-hidden
          className="nav-group-chevron"
          style={{ transform: manageOpen ? undefined : 'rotate(-90deg)' }}
        />
      </button>
      {/* Mobile always shows its five tabs; the group only collapses on desktop. */}
      {MANAGE.map((item) => (
        <span
          key={item.href}
          className={!manageOpen && !MOBILE_ITEMS.has(item.href) ? 'nav-group-hidden' : undefined}
        >
          <NavLink
            item={item}
            active={isActive(item.href)}
            collapsed={collapsed}
            desktopOnly={!MOBILE_ITEMS.has(item.href)}
          />
        </span>
      ))}

      <NavLink
        item={SETTINGS}
        active={isActive(SETTINGS.href)}
        collapsed={collapsed}
        desktopOnly={!MOBILE_ITEMS.has(SETTINGS.href)}
      />
    </nav>
  );
}
