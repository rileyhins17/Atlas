'use client';

import { useState } from 'react';
import { Clock, Undo2 } from 'lucide-react';
import { useShiftSchedule } from '@/lib/hooks/events';
import { useToast } from '@/components/ui';

const OFFSETS = [15, 30, 60];

/**
 * "I'm running 30 minutes late" — push the rest of today in one tap.
 *
 * When something runs long every later block is wrong, and correcting them one
 * at a time is enough work that nobody does it, so the day silently stops
 * matching reality. This is the most common real-life planning action there is.
 *
 * Only rendered on today, because it is meaningless anywhere else: shifting
 * "the rest of the day" on a date that has already happened, or has not started,
 * has no meaning to push from.
 *
 * What it will NOT move is the part worth knowing: anything synced from another
 * calendar (a commitment with other people in it), anything all-day, and
 * anything already under way. The server decides that — see `planShift` — and
 * says in the toast how many it held back, so a surprising result explains
 * itself rather than looking like a bug.
 */
export function RunningLate() {
  const shift = useShiftSchedule();
  const { toast } = useToast();
  // Remembered only until the next shift or reload. Long enough to fix a
  // mis-tap, short enough that it never becomes a second history to reason about.
  const [lastShift, setLastShift] = useState<number | null>(null);

  /**
   * `remember` is what stops the undo becoming its own history. Undoing is
   * itself a shift, so recording it would put the button straight back — and
   * pressing it again would silently re-apply the shift just abandoned.
   */
  function apply(minutes: number, remember = true) {
    shift.mutate(
      { minutes },
      {
        onSuccess: (result) => {
          // The server wrote this sentence, so the toast and the timeline say
          // exactly the same thing about what happened.
          toast(result.message, result.moved.length > 0 ? 'success' : 'info');
          setLastShift(remember && result.moved.length > 0 ? minutes : null);
        },
      },
    );
  }

  return (
    <div className="runlate" role="group" aria-label="Running late">
      <span className="runlate-label">
        <Clock size={12} aria-hidden /> Running late
      </span>
      {OFFSETS.map((m) => (
        <button
          key={m}
          type="button"
          className="runlate-btn"
          disabled={shift.isPending}
          onClick={() => apply(m)}
          aria-label={`Push the rest of today ${m} minutes later`}
        >
          +{m}m
        </button>
      ))}
      {lastShift !== null && (
        <button
          type="button"
          className="runlate-btn runlate-undo"
          disabled={shift.isPending}
          onClick={() => apply(-lastShift, false)}
          aria-label={`Undo — move the rest of today back ${lastShift} minutes`}
        >
          <Undo2 size={12} aria-hidden /> Undo
        </button>
      )}
    </div>
  );
}
