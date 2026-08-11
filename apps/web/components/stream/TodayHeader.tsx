'use client';

import { useMe } from '@/lib/hooks/auth';
import { HeroBrief } from '@/components/home/HeroBrief';
import { greeting } from '@/lib/dates';
import { firstNameFrom } from '@/lib/name';

/**
 * Atlas's voice on Today: it greets you, then briefs you — one line, one voice.
 * Rendered below the actionable blocks, because it's context, not action.
 */
export function BriefBlock() {
  const me = useMe();
  const first = firstNameFrom(me.data?.displayName, me.data?.email);
  const hello = `${greeting()}${first ? `, ${first}` : ''}.`;

  return (
    <section className="nowstrip" aria-label="From Atlas">
      <HeroBrief compact greeting={hello} />
    </section>
  );
}
