/**
 * Three places, along one axis: time.
 *
 * The history of this file is the whole design problem. It began as eleven
 * destinations competing as peers — a directory, not a navigation. That became
 * four sections (Today, Plan, Life, Money), which was better but re-introduced
 * the eleven one layer down as tab strips, and a third time in the sidebar.
 *
 * A measured audit of every screen found 19–30 controls on all of them: one
 * density applied everywhere, so nothing looked more important than anything
 * else, and the app's own best idea — one graph rather than seven apps — was
 * presented as a menu of seven silos.
 *
 * So: the domains stop being destinations. They are where data lives, not where
 * you go. What a person actually asks is a question about *time*:
 *
 *   Today        — what is happening now?
 *   Week         — what is coming?
 *   Looking back — how did it actually go?
 *
 * Everything that existed still exists and keeps its own URL. The domain pages
 * are reachable from "Everything" and from search; nothing was deleted, and no
 * bookmark breaks.
 */
export interface SectionTab {
  key: string;
  label: string;
  /** The standalone route, still valid and still linkable. */
  href: string;
}

export interface Section {
  href: string;
  label: string;
  /** Lucide icon name, resolved in NavBar so this file stays React-free. */
  icon: 'home' | 'calendar' | 'rewind';
  tabs: SectionTab[];
}

export const SECTIONS: Section[] = [
  {
    href: '/today',
    label: 'Today',
    icon: 'home',
    // One tab: no strip renders, and Today is finally just Today.
    tabs: [{ key: 'now', label: 'Now', href: '/today' }],
  },
  {
    href: '/week',
    label: 'Week',
    icon: 'calendar',
    tabs: [
      { key: 'calendar', label: 'Calendar', href: '/week' },
      { key: 'tasks', label: 'Tasks', href: '/tasks' },
      { key: 'goals', label: 'Goals', href: '/goals' },
    ],
  },
  {
    href: '/looking-back',
    label: 'Looking back',
    icon: 'rewind',
    tabs: [{ key: 'back', label: 'Looking back', href: '/looking-back' }],
  },
];

/**
 * The domain pages, demoted.
 *
 * Still complete, still linkable, no longer competing for attention with the
 * question you actually opened the app to answer. Finance is deliberately in
 * here rather than in the nav: it is one screen, mostly a connect-your-bank
 * prompt, and it was occupying a quarter of the primary navigation. Every
 * route and every row of data is untouched.
 */
export interface DomainLink {
  label: string;
  href: string;
  /** One line each, because "Journal" and "Notes" were indistinguishable. */
  blurb: string;
}

export const EVERYTHING: DomainLink[] = [
  { label: 'Calendar', href: '/calendar', blurb: 'Every event, day by day.' },
  { label: 'Tasks', href: '/tasks', blurb: 'Everything open, in one list.' },
  { label: 'Goals', href: '/goals', blurb: 'What the work is for.' },
  { label: 'Habits', href: '/habits', blurb: 'The things you are trying to keep up.' },
  { label: 'Training', href: '/fitness', blurb: 'Sessions, lifts and progress.' },
  { label: 'Journal', href: '/journal', blurb: 'How the day went, dated.' },
  { label: 'Notes', href: '/notes', blurb: 'Durable facts Atlas should remember.' },
  { label: 'Money', href: '/finance', blurb: 'Accounts and spending.' },
  { label: 'Settings', href: '/settings', blurb: 'Your week, connections and your data.' },
];

/** Which section a path belongs to, for highlighting the nav. */
export function sectionFor(pathname: string): Section | null {
  for (const s of SECTIONS) {
    if (pathname === s.href || pathname.startsWith(`${s.href}/`)) return s;
    if (s.tabs.some((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))) return s;
  }
  return null;
}

/** Which tab within a section a path is, defaulting to the first. */
export function tabFor(section: Section, pathname: string): string {
  const hit = section.tabs.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return hit?.key ?? section.tabs[0]!.key;
}
