'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Calendar,
  Flame,
  ListTodo,
  Settings,
  Sparkles,
  StickyNote,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/today', label: 'Today', icon: ListTodo },
  { href: '/habits', label: 'Habits', icon: Flame },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/notes', label: 'Notes', icon: StickyNote },
  { href: '/ai', label: 'Atlas AI', icon: Sparkles },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/**
 * One nav, two renderings via CSS: a button row under the header on desktop,
 * a fixed bottom tab bar (with safe-area padding) on mobile. See .app-nav in
 * globals.css.
 */
export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Sections">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`nav-link ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="nav-icon" size={20} aria-hidden />
            <span className="nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
