/**
 * The four places Atlas has.
 *
 * There used to be eleven destinations competing as peers in one list — Today,
 * History, Progress, Tasks, Calendar, Habits, Journal, Notes, Training,
 * Finance, Settings. That is the "messy" problem: eleven equal choices is not a
 * navigation, it is a directory, and it makes you decide where something lives
 * before you can do anything.
 *
 * Four sections, each answering one question:
 *   Today — what is happening now?
 *   Plan  — what am I working toward, and when? (goals, tasks, calendar)
 *   Life  — who am I becoming? (habits, training, journal, notes)
 *   Money — where do I stand?
 *
 * Everything that existed still exists and keeps its own URL; the old routes
 * redirect into the right tab, so nothing bookmarked breaks.
 */
export interface SectionTab {
  key: string;
  label: string;
  /** The legacy standalone route, still valid and still linkable. */
  href: string;
}

export interface Section {
  href: string;
  label: string;
  /** Lucide icon name, resolved in NavBar so this file stays React-free. */
  icon: 'home' | 'target' | 'flame' | 'wallet';
  tabs: SectionTab[];
}

export const SECTIONS: Section[] = [
  {
    href: '/today',
    label: 'Today',
    icon: 'home',
    tabs: [
      { key: 'now', label: 'Now', href: '/today' },
      { key: 'progress', label: 'Progress', href: '/progress' },
      { key: 'history', label: 'History', href: '/history' },
    ],
  },
  {
    href: '/plan',
    label: 'Plan',
    icon: 'target',
    tabs: [
      { key: 'goals', label: 'Goals', href: '/goals' },
      { key: 'tasks', label: 'Tasks', href: '/tasks' },
      { key: 'calendar', label: 'Calendar', href: '/calendar' },
    ],
  },
  {
    href: '/life',
    label: 'Life',
    icon: 'flame',
    tabs: [
      { key: 'habits', label: 'Habits', href: '/habits' },
      { key: 'training', label: 'Training', href: '/fitness' },
      { key: 'journal', label: 'Journal', href: '/journal' },
      { key: 'notes', label: 'Notes', href: '/notes' },
    ],
  },
  {
    href: '/money',
    label: 'Money',
    icon: 'wallet',
    tabs: [{ key: 'finance', label: 'Accounts', href: '/finance' }],
  },
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
