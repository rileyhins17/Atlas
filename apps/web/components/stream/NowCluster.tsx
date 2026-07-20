'use client';

import { useMe } from '@/lib/hooks/auth';
import { AtlasAsks } from '@/components/AtlasAsks';
import { HeroBrief } from '@/components/home/HeroBrief';
import { HabitRings } from '@/components/home/HabitRings';
import { greeting } from '@/lib/dates';

/**
 * The "now" neighborhood at the top of the stream: who you are, what Atlas
 * thinks (brief), what your body owes you (rings), and what Atlas wants to
 * know (asks).
 */
export function NowCluster() {
  const me = useMe();
  const first = (me.data?.displayName ?? me.data?.email ?? '').split('@')[0].split(' ')[0];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <header className="greeting">
        <p className="home-date">{today}</p>
        <h1 className="page-title">
          {greeting()}
          {first ? `, ${first}` : ''}.
        </h1>
      </header>

      <section className="hero-card" aria-label="Daily brief">
        <HeroBrief />
      </section>

      <div className="stream-rings">
        <HabitRings />
      </div>

      <AtlasAsks />
    </>
  );
}
