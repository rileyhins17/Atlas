'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Home, LayoutGrid, Rewind } from 'lucide-react';
import { SECTIONS, sectionFor, type Section } from '@/lib/sections';

const ICONS = { home: Home, calendar: CalendarDays, rewind: Rewind } as const;

/**
 * Three destinations, identical on phone and desktop.
 *
 * Eleven peers became four sections, and four sections still hid a tab strip
 * that put the eleven back. Now the axis is time — now, soon, and how it went —
 * and the domains stop being places you navigate to at all.
 *
 * Settings and the domain pages are deliberately absent: they live behind
 * "Everything", because configuring the app and browsing one silo are not the
 * things you opened it to do.
 *
 * `withEverything` puts that entry in the bar itself, for the phone. The
 * sidebar renders its own copy under a rule, but the sidebar is hidden below
 * 901px — so on the primary platform "Everything" was reachable from nowhere,
 * and with it Habits, Training, Writing, Money and Settings. The one route in
 * was the command bar, which is a search box: half the app was behind a text
 * query you had to already know to type.
 */
export function NavBar({
  collapsed = false,
  withEverything = false,
}: {
  collapsed?: boolean;
  withEverything?: boolean;
}) {
  const pathname = usePathname();
  const active = sectionFor(pathname);

  return (
    <nav className="app-nav" aria-label="Sections">
      {SECTIONS.map((section: Section) => {
        const Icon = ICONS[section.icon];
        const isActive = active?.href === section.href;
        // Land on the section's first tab, which is its real page.
        const href = section.tabs[0]!.href;
        return (
          <Link
            key={section.href}
            href={href}
            className={`nav-link ${isActive ? 'active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            title={collapsed ? section.label : undefined}
          >
            <Icon className="nav-icon" size={20} aria-hidden />
            <span className="nav-label">{section.label}</span>
          </Link>
        );
      })}

      {withEverything && (
        <Link
          href="/everything"
          className={`nav-link ${pathname === '/everything' ? 'active' : ''}`}
          aria-current={pathname === '/everything' ? 'page' : undefined}
        >
          <LayoutGrid className="nav-icon" size={20} aria-hidden />
          <span className="nav-label">Everything</span>
        </Link>
      )}
    </nav>
  );
}
