'use client';

import { useEffect, useState } from 'react';
import { useEvents } from './events';
import { useTasks } from './tasks';

/**
 * Set once the account has real data in it, and never cleared.
 *
 * Shared with `FirstCapture`, which set it first — one key, imported, because
 * two components deciding "is this person new?" from two copies of the same
 * string is exactly how they end up disagreeing.
 */
export const ESTABLISHED_KEY = 'atlas.firstCapture.done';

/**
 * Has this person actually started using Atlas?
 *
 * Onboarding copy earns its place on day one and becomes furniture by day
 * thirty. The explaining that a new account needs is the same explaining a
 * returning one has to scroll past every single morning, so the things that
 * teach have to know when to stop.
 *
 * Latched through localStorage rather than read live, for a reason worth
 * keeping: a user who clears their task list for the afternoon has not become a
 * new user, and re-teaching them the premise would read as the app forgetting
 * who they are.
 *
 * DEFAULTS TO ESTABLISHED. localStorage does not exist during SSR, and guessing
 * "new" would flash beginner copy at a long-standing user on every cold load —
 * far worse than a first-time user waiting one paint for it to appear.
 */
export function useEstablished(): boolean {
  const tasks = useTasks();
  const events = useEvents();
  const [latched, setLatched] = useState(true);

  useEffect(() => {
    try {
      setLatched(localStorage.getItem(ESTABLISHED_KEY) === '1');
    } catch {
      // Private mode: fall back to the live signal below.
      setLatched(false);
    }
  }, []);

  const hasData = (tasks.data?.length ?? 0) > 0 || (events.data?.length ?? 0) > 0;

  useEffect(() => {
    if (!hasData) return;
    try {
      localStorage.setItem(ESTABLISHED_KEY, '1');
    } catch {
      /* private mode */
    }
  }, [hasData]);

  // While the first fetch is in flight nothing is known, and showing beginner
  // copy that vanishes a moment later is a flicker on the app's main screen.
  if (tasks.isPending || events.isPending) return true;
  return latched || hasData;
}
