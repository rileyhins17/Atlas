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
 *   Progress — what changed, and what should I do about it?
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
    href: '/progress',
    label: 'Progress',
    icon: 'rewind',
    tabs: [{ key: 'progress', label: 'Progress', href: '/progress' }],
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
  /** Lucide icon name, resolved in the panel so this file stays React-free. */
  icon: 'calendar' | 'check' | 'target' | 'repeat' | 'dumbbell' | 'pen' | 'wallet' | 'settings';
}

export const EVERYTHING: DomainLink[] = [
  { label: 'Calendar', href: '/calendar', blurb: 'Every event, day by day.', icon: 'calendar' },
  { label: 'Tasks', href: '/tasks', blurb: 'Everything open, in one list.', icon: 'check' },
  { label: 'Goals', href: '/goals', blurb: 'What the work is for.', icon: 'target' },
  { label: 'Habits', href: '/habits', blurb: 'The things you are trying to keep up.', icon: 'repeat' },
  { label: 'Training', href: '/fitness', blurb: 'Sessions, lifts and progress.', icon: 'dumbbell' },
  {
    label: 'Writing',
    href: '/journal',
    blurb: 'How the day went, and what Atlas should remember.',
    icon: 'pen',
  },
  { label: 'Money', href: '/finance', blurb: 'Accounts and spending.', icon: 'wallet' },
  {
    label: 'Settings',
    href: '/settings',
    blurb: 'Your week, connections and your data.',
    icon: 'settings',
  },
];

/**
 * Everywhere ⌘K can send you, derived from the two lists above.
 *
 * The command bar used to carry its OWN hand-written copy of the destinations,
 * and it silently kept the pre-restructure eleven: typing "week", "money",
 * "goals" or "training" matched nothing at all, while "Notes" and "Progress"
 * still offered screens that had been folded into other places. A second list
 * of the app's structure will always drift from the first, so there is now one.
 *
 * `keywords` carries the OLD names on purpose. Someone who learnt this app as
 * Journal/Notes/Progress/History should still find the screen those became,
 * and every one of those routes still resolves.
 */
export interface Destination {
  href: string;
  label: string;
  /** Lucide icon name, resolved by the command bar — this file stays React-free. */
  icon: string;
  /** Lower-case search terms, including superseded names. */
  keywords: string;
}

const EXTRA_KEYWORDS: Record<string, string> = {
  '/today': 'home now day canvas',
  '/week': 'week calendar schedule upcoming soon',
  '/progress': 'progress stats statistics trends history timeline story review past looking back',
  '/calendar': 'events schedule',
  '/tasks': 'todo to-do',
  '/goals': 'objectives ambitions',
  '/habits': 'streaks routines',
  '/fitness': 'training workout gym lifts exercise',
  '/journal': 'writing journal notes diary mood memory facts remember',
  '/finance': 'money finance bank spending accounts transactions',
  '/settings': 'account google connections export data api key',
};

export const DESTINATIONS: Destination[] = [
  ...SECTIONS.map((s) => ({
    href: s.tabs[0]!.href,
    label: s.label,
    icon: s.icon,
    keywords: `${s.label.toLowerCase()} ${EXTRA_KEYWORDS[s.tabs[0]!.href] ?? ''}`.trim(),
  })),
  ...EVERYTHING.map((d) => ({
    href: d.href,
    label: d.label,
    icon: d.icon,
    keywords: `${d.label.toLowerCase()} ${EXTRA_KEYWORDS[d.href] ?? ''}`.trim(),
  })),
].filter(
  // Week's first tab IS /week, and Everything lists /calendar separately; keep
  // the first occurrence of each route so nothing is offered twice.
  (d, i, all) => all.findIndex((x) => x.href === d.href) === i,
);

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
