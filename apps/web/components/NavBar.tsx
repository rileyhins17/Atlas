'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Dumbbell, Home, LayoutGrid, Plus, Repeat, Rewind } from 'lucide-react';
import { SECTIONS, SOFT_NAV, sectionFor, softNavFor, type Section } from '@/lib/sections';
import { useUiStyle } from '@/lib/theme/style';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';

const ICONS = { home: Home, calendar: CalendarDays, rewind: Rewind } as const;
const SOFT_ICONS = { home: Home, calendar: CalendarDays, repeat: Repeat, dumbbell: Dumbbell } as const;

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
  const style = useUiStyle();

  if (style === 'soft') {
    return <SoftNav pathname={pathname} collapsed={collapsed} withMore={withEverything} />;
  }

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

/**
 * Soft style's destinations — see SOFT_NAV.
 *
 * On the phone the bar splits around a raised "+" in the middle: the one
 * action you take from any screen is putting something into Atlas, so it gets
 * the thumb's best spot instead of a text bar parked over every page's content.
 * It opens the command bar, which captures, asks and jumps. "Everything else"
 * is the avatar in the top bar, so the bar itself holds only destinations.
 */
function SoftNav({
  pathname,
  collapsed,
  withMore,
}: {
  pathname: string;
  collapsed: boolean;
  withMore: boolean;
}) {
  const active = softNavFor(pathname);
  const { setCommandOpen } = useAtlasUi();
  const half = Math.ceil(SOFT_NAV.length / 2);

  const link = (item: (typeof SOFT_NAV)[number]) => {
    const Icon = SOFT_ICONS[item.icon];
    const isActive = active?.href === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`nav-link ${isActive ? 'active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="nav-icon" size={20} aria-hidden />
        <span className="nav-label">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav className="app-nav" aria-label="Sections">
      {SOFT_NAV.slice(0, half).map(link)}
      {withMore && (
        <button
          type="button"
          className="nav-link sf-fab"
          aria-label="Add or ask anything"
          onClick={() => setCommandOpen(true)}
        >
          <span className="sf-fab-disc">
            <Plus size={24} aria-hidden />
          </span>
        </button>
      )}
      {SOFT_NAV.slice(half).map(link)}
    </nav>
  );
}
