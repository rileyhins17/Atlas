'use client';

import { CalendarDays, Flame, HeartPulse, ListTodo } from 'lucide-react';
import { useMe } from '@/lib/hooks/auth';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { AtlasAsks } from '@/components/AtlasAsks';
import { Kbd } from '@/components/ui';
import { greeting } from '@/lib/dates';
import { HeroBrief } from './HeroBrief';
import { DaySpine } from './DaySpine';
import { FocusTasks } from './FocusTasks';
import { HabitRings } from './HabitRings';
import { PulseCard } from './PulseCard';

/**
 * Home — the command center. Hero brief (the AI speaking), the day's spine,
 * the focus task set, habit rings, and the mood pulse. Composed, glanceable,
 * alive: the anti-"task list in a void".
 */
export function HomeDashboard() {
  const me = useMe();
  const { setCommandOpen } = useAtlasUi();
  const first = (me.data?.displayName ?? me.data?.email ?? '').split('@')[0].split(' ')[0];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="page-wide">
      <header className="greeting">
        <p className="home-date">{today}</p>
        <h1 className="page-title">
          {greeting()}
          {first ? `, ${first}` : ''}.
        </h1>
      </header>

      <section className="hero-card" aria-label="Daily brief">
        <HeroBrief />
        <button type="button" className="hero-capture" onClick={() => setCommandOpen(true)}>
          <span className="muted">Add a task, a thought, anything…</span>
          <Kbd>⌘K</Kbd>
        </button>
      </section>

      <AtlasAsks />

      <div className="home-grid">
        <section className="home-zone" aria-labelledby="zone-day">
          <h2 className="zone-title" id="zone-day">
            <CalendarDays size={15} aria-hidden /> Your day
          </h2>
          <DaySpine />
        </section>

        <section className="home-zone" aria-labelledby="zone-focus">
          <h2 className="zone-title" id="zone-focus">
            <ListTodo size={15} aria-hidden /> Focus
          </h2>
          <FocusTasks />
        </section>

        <section className="home-zone" aria-labelledby="zone-habits">
          <h2 className="zone-title" id="zone-habits">
            <Flame size={15} aria-hidden /> Habits
          </h2>
          <HabitRings />
        </section>

        <section className="home-zone" aria-labelledby="zone-pulse">
          <h2 className="zone-title" id="zone-pulse">
            <HeartPulse size={15} aria-hidden /> Pulse
          </h2>
          <PulseCard />
        </section>
      </div>
    </div>
  );
}
