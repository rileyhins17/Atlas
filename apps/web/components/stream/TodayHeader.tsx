'use client';

import { useMe } from '@/lib/hooks/auth';
import { HeroBrief } from '@/components/home/HeroBrief';
import { AtlasAsks } from '@/components/AtlasAsks';
import { greeting } from '@/lib/dates';

/** One warm line at the very top. The date lives on the day pager. */
export function Greeting() {
  const me = useMe();
  const first = (me.data?.displayName ?? me.data?.email ?? '').split('@')[0].split(' ')[0];
  return (
    <p className="today-greeting">
      {greeting()}
      {first ? `, ${first}` : ''}
    </p>
  );
}

/**
 * The AI's voice on Today: the brief, plus anything Atlas wants to ask. This is
 * context, so Today renders it BELOW the blocks you can act on.
 */
export function BriefBlock() {
  return (
    <section className="nowstrip" aria-label="From Atlas">
      <HeroBrief compact />
      <AtlasAsks />
    </section>
  );
}
