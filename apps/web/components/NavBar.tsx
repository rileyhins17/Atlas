'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flame, Home, Target, Wallet } from 'lucide-react';
import { SECTIONS, sectionFor, type Section } from '@/lib/sections';

const ICONS = { home: Home, target: Target, flame: Flame, wallet: Wallet } as const;

/**
 * Four destinations, identical on phone and desktop.
 *
 * This replaced eleven peers in a list plus a collapsible "Manage" group. The
 * group was the tell: needing to hide half your navigation means there is too
 * much of it. Everything still exists — it lives one tab inside a section now,
 * so the choice is "which part of my life", not "which of eleven pages".
 *
 * Settings is deliberately absent: it is a gear in the account row, because
 * configuring the app is not one of the four things you came here to do.
 */
export function NavBar({ collapsed = false }: { collapsed?: boolean }) {
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
    </nav>
  );
}
