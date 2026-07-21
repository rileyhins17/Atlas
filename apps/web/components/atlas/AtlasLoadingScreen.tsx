'use client';

import { useEffect, useState } from 'react';
import { Constellation } from './Constellation';

/**
 * The branded loading moment: the constellation drawing itself in, with a
 * staged message sequence that fades through ("Mapping your week…" →
 * "Learning about you…") and holds on the last one. Used by the auth gate and
 * the onboarding build step — anywhere Atlas is visibly thinking.
 */
export function AtlasLoadingScreen({
  messages,
  sublabel,
  intervalMs = 1600,
}: {
  /** Shown in order; the last message holds until unmount. */
  messages: string[];
  sublabel?: string;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= messages.length - 1) return;
    const id = setTimeout(() => setIndex((i) => i + 1), intervalMs);
    return () => clearTimeout(id);
  }, [index, messages.length, intervalMs]);

  return (
    <div className="atlas-loading" role="status" aria-live="polite">
      <Constellation size={96} animated loading />
      {/* Keyed so each message re-runs the fade-in. */}
      <p key={index} className="atlas-loading-msg">
        {messages[Math.min(index, messages.length - 1)]}
      </p>
      {sublabel && <p className="atlas-loading-sub">{sublabel}</p>}
    </div>
  );
}
