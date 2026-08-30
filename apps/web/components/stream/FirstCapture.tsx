'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, Check } from 'lucide-react';
import { useEvents } from '@/lib/hooks/events';
import { useTasks } from '@/lib/hooks/tasks';
import { ESTABLISHED_KEY as SEEN_KEY } from '@/lib/hooks/established';

/**
 * The first thing Atlas teaches, taught by doing it.
 *
 * A new account used to land on an empty day and a box, and an empty app
 * explains nothing — the one interaction the whole product is built around was
 * left to be guessed at. So this points at the box, gives three real examples,
 * and gets out of the way the moment something is written.
 *
 * It watches for actual data rather than for a click. Nothing here can be
 * satisfied by dismissing it: the card disappears when a task or an event
 * exists, which is the same thing as the user having learned what capture does.
 * That is also why it needs no key — capture parses locally when there is no
 * DeepSeek key, so the tour cannot dead-end on the very first step.
 */
export function FirstCapture() {
  const tasks = useTasks();
  const events = useEvents();
  const [dismissed, setDismissed] = useState(true);

  // Read after mount: localStorage does not exist during SSR, and defaulting to
  // dismissed means a hydration mismatch can never flash the card at someone
  // who has already done this.
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(SEEN_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const hasWritten = (tasks.data?.length ?? 0) > 0 || (events.data?.length ?? 0) > 0;

  // Once anything exists, remember it — so the card does not reappear later on
  // an empty day, when it would read as the app forgetting who you are.
  useEffect(() => {
    if (!hasWritten) return;
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode */
    }
  }, [hasWritten]);

  if (dismissed || tasks.isPending || events.isPending) return null;

  if (hasWritten) {
    return (
      <section className="fc-card done" aria-label="First capture complete">
        <Check size={15} aria-hidden />
        <p>
          That is the whole app. Anything you type there — a task, a plan, how the day went — lands
          in the right place.
        </p>
      </section>
    );
  }

  return (
    <section className="fc-card" aria-label="Try your first capture">
      <h2 className="fc-head">Start here</h2>
      <p className="fc-body">
        Type one real thing into the box at the bottom, in your own words. Atlas works out what it
        is and files it.
      </p>
      <ul className="fc-examples">
        <li>gym at 6</li>
        <li>call mum tomorrow</li>
        <li>buy milk</li>
      </ul>
      <p className="fc-point">
        <ArrowDown size={14} aria-hidden />
        The box is always there, on every screen.
      </p>
    </section>
  );
}
