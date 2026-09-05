'use client';

import { useState } from 'react';
import { TRACKER_MAX, TRACKER_MIN, type TrackerDTO } from '@atlas/shared';
import { Check, Plus } from 'lucide-react';
import Link from 'next/link';
import { useLogTracker, useTrackers } from '@/lib/hooks/trackers';

/**
 * Today's ratings, on Today.
 *
 * One row per thing you have decided to watch, rated by tapping a number. No
 * dialog, no submit: the tap IS the answer, because a daily question with three
 * steps in it is a daily question nobody answers by Thursday.
 *
 * Rated ones stay on screen rather than disappearing. A row that vanishes when
 * you answer it gives you no way to correct a mis-tap, and correcting is an
 * edit here — one rating per day, by design.
 */
export function TrackerCheckIn() {
  const trackers = useTrackers();
  const rows = trackers.data ?? [];

  // Nothing set up: this is opt-in, so an empty state here would be a nag on a
  // screen that already has enough to say. The way in is Settings.
  if (trackers.isPending || rows.length === 0) return null;

  return (
    <section className="trk-card" aria-label="Today's ratings">
      <header className="trk-head">
        <h2 className="trk-title">How are these today?</h2>
        <Link href="/settings" className="trk-manage">
          Manage
        </Link>
      </header>
      <ul className="trk-list">
        {rows.map((tracker) => (
          <TrackerRow key={tracker.id} tracker={tracker} />
        ))}
      </ul>
    </section>
  );
}

const SCALE = Array.from({ length: TRACKER_MAX - TRACKER_MIN + 1 }, (_, i) => TRACKER_MIN + i);

function TrackerRow({ tracker }: { tracker: TrackerDTO }) {
  const log = useLogTracker();
  // Held locally so the row responds to the tap immediately. The query
  // invalidation behind it is what makes it true; this is what makes it feel
  // like a button rather than a form.
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const value = optimistic ?? tracker.todayValue;

  return (
    <li className="trk-row">
      <div className="trk-row-head">
        <span className="trk-name">
          {tracker.emoji && (
            <span className="trk-emoji" aria-hidden>
              {tracker.emoji}
            </span>
          )}
          {tracker.name}
        </span>
        {value !== null && (
          <span className="trk-answered">
            <Check size={12} aria-hidden />
            {value}/10
          </span>
        )}
      </div>

      <div
        className="trk-scale"
        role="radiogroup"
        aria-label={`${tracker.name}, 1 to 10`}
      >
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${tracker.name}: ${n} out of 10`}
            className={`trk-dot ${value === n ? 'on' : ''}`}
            disabled={log.isPending}
            onClick={() => {
              setOptimistic(n);
              log.mutate(
                { id: tracker.id, input: { value: n } },
                // Put it back if the write did not land. Leaving the tap on
                // screen after a failure is the app telling you it saved
                // something it did not.
                { onError: () => setOptimistic(null) },
              );
            }}
          >
            {n}
          </button>
        ))}
      </div>

      {(tracker.lowLabel || tracker.highLabel) && (
        <p className="trk-legend">
          <span>{tracker.lowLabel ? `1 · ${tracker.lowLabel}` : ''}</span>
          <span>{tracker.highLabel ? `${TRACKER_MAX} · ${tracker.highLabel}` : ''}</span>
        </p>
      )}
    </li>
  );
}

/** The empty-state entry point, for Settings. */
export function TrackerHint() {
  return (
    <p className="trk-hint">
      <Plus size={13} aria-hidden /> Track anything on a 1–10 scale — bloating, soreness, anxiety,
      focus — and Atlas will tell you what your worst days had in common.
    </p>
  );
}
