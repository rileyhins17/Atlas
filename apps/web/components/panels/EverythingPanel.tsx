'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Dumbbell,
  Flame,
  LogOut,
  Moon,
  PenLine,
  Repeat,
  Settings as SettingsIcon,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { EVERYTHING } from '@/lib/sections';
import { PageHeader } from '@/components/PageHeader';
import { useLogout, useMe } from '@/lib/hooks/auth';
import { useTasks } from '@/lib/hooks/tasks';
import { useHabits } from '@/lib/hooks/habits';
import { useWorkoutHistory } from '@/lib/hooks/fitness';
import { useUiStyle } from '@/lib/theme/style';
import { weekAtAGlance } from '@/lib/you';
import { useThemeMode } from '@/components/ThemeToggle';
import { Skeleton } from '@/components/ui';

const ICONS = {
  calendar: CalendarDays,
  check: CheckCircle2,
  target: Target,
  repeat: Repeat,
  dumbbell: Dumbbell,
  chart: TrendingUp,
  pen: PenLine,
  wallet: Wallet,
  settings: SettingsIcon,
} as const;

/**
 * The domain pages, one level down.
 *
 * They are complete and unchanged — they simply stopped competing with the
 * question you opened the app to answer. Each carries a line saying what it is
 * for, because "Journal" and "Notes" sitting side by side told nobody which was
 * which.
 *
 * A GRID of cards, not a stack of full-width rows: eight identical 735px pills
 * with a chevron floating 600px from the label they belonged to read as a
 * settings menu, and the label was the only thing distinguishing one from the
 * next. An icon and a two-column grid make it a place you can scan.
 */
export function EverythingPanel() {
  const style = useUiStyle();
  return (
    <>
      {style === 'soft' ? (
        <>
          <YouHeader />
          <WeekGlanceCard />
        </>
      ) : (
        <PageHeader
          title="Everything"
          subtitle="Every part of Atlas, whole. Most days you will not need to come here."
        />
      )}
      <ul className="evy-list">
        {EVERYTHING.map((d) => {
          const Icon = ICONS[d.icon];
          return (
            <li key={d.href}>
              <Link className="evy-item" href={d.href}>
                <span className="evy-icon" aria-hidden>
                  <Icon size={17} />
                </span>
                <span className="evy-body">
                  <span className="evy-label">{d.label}</span>
                  <span className="evy-blurb">{d.blurb}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {style === 'soft' && <QuickSettings />}
    </>
  );
}

/**
 * In soft this page is reached from your avatar, so it opens on you: who is
 * signed in, then every part of Atlas below.
 */
function YouHeader() {
  const me = useMe();
  const name = me.data?.displayName ?? me.data?.email ?? '';
  const initial = name.trim().charAt(0).toUpperCase() || 'A';
  return (
    <header className="you-head">
      <span className="avatar you-avatar" aria-hidden>
        {initial}
      </span>
      <div className="you-text">
        <h1 className="page-title">{me.data?.displayName ?? 'You'}</h1>
        {me.data?.email && <p className="you-email">{me.data.email}</p>}
      </div>
    </header>
  );
}

/**
 * The last seven days in three numbers. Rendered only from answers that
 * arrived: a zero from a query that failed would be a false statement about
 * someone's week, so a failure drops the card instead.
 */
function WeekGlanceCard() {
  const tasks = useTasks();
  const workouts = useWorkoutHistory();
  const habits = useHabits();
  const glance = useMemo(
    () =>
      tasks.data && workouts.data && habits.data
        ? weekAtAGlance(tasks.data, workouts.data, habits.data, new Date())
        : null,
    [tasks.data, workouts.data, habits.data],
  );

  if (tasks.isError || workouts.isError || habits.isError) return null;
  if (!glance) return <Skeleton height={104} />;

  return (
    <section className="sf-card you-week" aria-labelledby="you-week-title">
      <h2 id="you-week-title" className="you-week-title">
        Last 7 days
      </h2>
      <dl className="you-stats">
        <div className="you-stat">
          <dt>Tasks done</dt>
          <dd>{glance.tasksDone}</dd>
        </div>
        <div className="you-stat">
          <dt>Workouts</dt>
          <dd>{glance.workouts}</dd>
        </div>
        <div className="you-stat">
          <dt>Best streak</dt>
          <dd>
            {glance.bestStreak > 0 && <Flame size={18} aria-hidden className="you-flame" />}
            {glance.bestStreak}
            <span className="you-unit">{glance.bestStreak === 1 ? ' day' : ' days'}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** The two settings people reach for from here: light/dark, and signing out. */
function QuickSettings() {
  const [theme, toggleTheme] = useThemeMode();
  const logout = useLogout();

  return (
    <section className="sf-card you-quick" aria-label="Quick settings">
      <button
        type="button"
        className="you-row"
        role="switch"
        aria-checked={theme === 'dark'}
        disabled={theme === null}
        onClick={toggleTheme}
      >
        <Moon size={18} aria-hidden className="you-row-icon" />
        <span className="you-row-label">Dark mode</span>
        <span className="you-switch" aria-hidden />
      </button>
      <button
        type="button"
        className="you-row"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut size={18} aria-hidden className="you-row-icon" />
        <span className="you-row-label">Sign out</span>
      </button>
    </section>
  );
}
