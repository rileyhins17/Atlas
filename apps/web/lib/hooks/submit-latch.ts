'use client';

import { useCallback, useRef } from 'react';

/**
 * Guards a submit handler against a double-click.
 *
 * `mutation.isPending` is not enough on its own. It only becomes true after a
 * render, so two clicks dispatched in the same frame both read `false` and both
 * fire — measured: two rapid clicks on the task composer created two identical
 * tasks. A ref closes synchronously, before React gets a chance to re-render.
 *
 * Pass the mutation call; release in `onSettled` so the latch reopens whether
 * the request succeeded or failed. Forgetting to release would wedge the form
 * shut, which is why `release` is handed to the caller rather than inferred.
 */
export function useSubmitLatch(): (start: (release: () => void) => void) => void {
  const closed = useRef(false);

  return useCallback((start: (release: () => void) => void) => {
    if (closed.current) return;
    closed.current = true;
    start(() => {
      closed.current = false;
    });
  }, []);
}
