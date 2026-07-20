'use client';

import { useEffect, useState } from 'react';
import { useRoutine } from '@/lib/hooks/routine';
import { routineAt } from '@/lib/stream';
import { formatClock } from '@/lib/dates';

/**
 * The ⦿ divider between the plan (above) and the past (below) — the stream's
 * anchor. Ticks each minute, and when a routine exists it says what you're
 * SUPPOSED to be doing right now ("Now · 10:04 PM — Wind-down").
 */
export function NowLine() {
  const [now, setNow] = useState(() => new Date());
  const routine = useRoutine();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const block = routineAt(routine.data ?? [], now);
  const label = `Now · ${formatClock(now)}${block ? ` — ${block.label}` : ''}`;

  return (
    <div className="now-line" role="separator" aria-label={label}>
      <span className="now-line-dot" aria-hidden />
      <span className="now-line-label">{label}</span>
      <span className="now-line-rule" aria-hidden />
    </div>
  );
}
