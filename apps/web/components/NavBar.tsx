'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Calendar,
  Flame,
  Home,
  ListTodo,
  Settings,
  StickyNote,
  Wallet,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/today', label: 'Home', icon: Home },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/habits', label: 'Habits', icon: Flame },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/notes', label: 'Notes', icon: StickyNote },
  { href: '/finance', label: 'Finance', icon: Wallet },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/** The five that fit a mobile bottom bar; the rest live in ⌘K + the top bar. */
const MOBILE_ITEMS = new Set(['/today', '/tasks', '/calendar', '/habits', '/journal']);

/**
 * One nav, two renderings via CSS: a vertical sidebar list on desktop, a
 * fixed bottom tab bar (with safe-area padding) on mobile. When the sidebar
 * is collapsed the labels hide and icons get a title tooltip.
 */
export function NavBar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Sections">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`nav-link ${active ? 'active' : ''} ${MOBILE_ITEMS.has(href) ? '' : 'nav-desktop-only'}`}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? label : undefined}
          >
            <Icon className="nav-icon" size={20} aria-hidden />
            <span className="nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
