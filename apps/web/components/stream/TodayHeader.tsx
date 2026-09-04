'use client';

import { useMe } from '@/lib/hooks/auth';
import { HeroBrief } from '@/components/home/HeroBrief';
import { greeting } from '@/lib/dates';
import { firstNameFrom } from '@/lib/name';
import { NameNudge } from './NameNudge';

/**
 * Atlas's voice on Today: it greets you, then briefs you — one line, one voice.
 * Rendered below the actionable blocks, because it's context, not action.
 */
export function BriefBlock() {
  const me = useMe();
  const first = firstNameFrom(me.data?.displayName, me.data?.email);
  const hello = `${greeting()}${first ? `, ${first}` : ''}.`;

  // The greeting is where a name would go, so it is where Atlas asks for one.
  // Only once there is genuinely nothing to use: an explicit displayName wins,
  // and an address that looks like a person's name is derived from. Waiting for
  // `isSuccess` rather than for "not pending" — a failed /auth/me leaves data
  // undefined, and offering to learn a name you already gave reads as amnesia.
  const askForName = me.isSuccess && !first;

  return (
    <section className="nowstrip" aria-label="From Atlas">
      <HeroBrief compact greeting={hello} />
      {askForName && <NameNudge />}
    </section>
  );
}
