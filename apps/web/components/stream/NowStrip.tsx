'use client';

import { useMe } from '@/lib/hooks/auth';
import { HeroBrief } from '@/components/home/HeroBrief';
import { AtlasAsks } from '@/components/AtlasAsks';
import { greeting } from '@/lib/dates';
import { HabitChips } from './HabitChips';

/**
 * The compact "now" strip above the Day Canvas: greeting, the AI's brief,
 * today's habit chips, and Atlas's questions — one slim band, never a stacked
 * dashboard. The canvas below carries the plan itself.
 */
export function NowStrip() {
  const me = useMe();
  const first = (me.data?.displayName ?? me.data?.email ?? '').split('@')[0].split(' ')[0];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <section className="nowstrip" aria-label="Now">
      <div className="nowstrip-head">
        <h1 className="nowstrip-greet">
          {greeting()}
          {first ? `, ${first}` : ''}
        </h1>
        <span className="nowstrip-date">{today}</span>
      </div>

      <HeroBrief compact />

      <div className="nowstrip-foot">
        <HabitChips />
      </div>

      <AtlasAsks />
    </section>
  );
}
