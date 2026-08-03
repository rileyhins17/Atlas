'use client';

import {
  describeMissingEvidence,
  findConnections,
  type ConnectionDomain,
} from '@atlas/shared';
import { Dumbbell, Link2, ListChecks, Repeat, Smile, Wallet } from 'lucide-react';
import { useStats } from '@/lib/hooks/stats';

const DOMAIN_ICON: Record<ConnectionDomain, typeof Dumbbell> = {
  training: Dumbbell,
  tasks: ListChecks,
  habits: Repeat,
  mood: Smile,
  money: Wallet,
};

/** A month is long enough for a pattern and short enough to still be true. */
const WINDOW_DAYS = 30;

/**
 * The one thing no single-purpose app could have told you.
 *
 * Everything else on Today reports a single domain. This card exists to make
 * the premise visible: Atlas holds your training, your tasks, your habits, your
 * mood and your money in one place, so it can compare them.
 *
 * It shows the STRONGEST observation only. A wall of correlations is a
 * dashboard, and a dashboard is something you stop reading — one sentence you
 * did not know is something you remember.
 *
 * When there is nothing honest to say it says nothing, which is the property
 * that makes it worth believing on the days it does speak.
 */
export function ConnectionCard() {
  const stats = useStats(WINDOW_DAYS);

  // No skeleton: this sits below what you came here to do, and a placeholder
  // for a card that may correctly render nothing is just a flash of furniture.
  if (!stats.isSuccess) return null;

  const days = stats.data.days;
  const connections = findConnections(days);
  const top = connections[0];

  if (!top) {
    const missing = describeMissingEvidence(days);
    // Rich data and no pattern is a real answer, and the honest response to it
    // is silence rather than an empty card explaining itself.
    if (!missing) return null;
    return (
      <section className="conn-card thin" aria-label="Connections across your life">
        <span className="conn-icons" aria-hidden>
          <Link2 size={13} />
        </span>
        <p className="conn-missing">{missing}</p>
      </section>
    );
  }

  const [a, b] = top.domains;
  const IconA = DOMAIN_ICON[a];
  const IconB = DOMAIN_ICON[b];

  return (
    <section className="conn-card" aria-label="A connection across your life">
      <span className="conn-icons" aria-hidden>
        <IconA size={13} />
        <Link2 size={11} className="conn-join" />
        <IconB size={13} />
      </span>
      <div className="conn-body">
        <p className="conn-headline">{top.headline}</p>
        {/* The numbers are shown, always. An observation you cannot check is
            indistinguishable from one that was invented. */}
        <p className="conn-detail">
          {top.detail} <span className="conn-window">Last {WINDOW_DAYS} days.</span>
        </p>
      </div>
    </section>
  );
}
