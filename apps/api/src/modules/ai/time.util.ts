/**
 * Small timezone helpers for the proactive scheduler — no external tz library,
 * just `Intl`. These are heuristics for "roughly what local time is it for this
 * user", good enough to fire a daily brief near their chosen hour. On the two
 * DST-transition days a boundary can be off by an hour; that's acceptable for a
 * nudge scheduler and not worth a tz-data dependency.
 */

/** Fall back to UTC for an unknown/invalid timezone rather than throwing. */
function safeTz(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** Milliseconds to add to a UTC instant to get the wall-clock time in `tz`. */
export function tzOffsetMs(tz: string, date = new Date()): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  // en-US hour12:false can emit '24' at midnight — normalize to 0.
  const hour = parts.hour === '24' ? '0' : parts.hour;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - date.getTime();
}

/** The local hour (0-23) in `tz` at `date`. */
export function localHour(tz: string, date = new Date()): number {
  return new Date(date.getTime() + tzOffsetMs(tz, date)).getUTCHours();
}

/** The UTC instant of local midnight (start of day) in `tz`. */
export function localDayStartUtc(tz: string, date = new Date()): Date {
  const off = tzOffsetMs(tz, date);
  const wall = new Date(date.getTime() + off);
  const wallMidnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  return new Date(wallMidnight - off);
}

/** The UTC instant of the start of the local week (Monday midnight) in `tz`. */
export function localWeekStartUtc(tz: string, date = new Date()): Date {
  const dayStart = localDayStartUtc(tz, date);
  const off = tzOffsetMs(tz, dayStart);
  const wall = new Date(dayStart.getTime() + off);
  const backDays = (wall.getUTCDay() + 6) % 7; // Monday = 0 … Sunday = 6
  return new Date(dayStart.getTime() - backDays * 86_400_000);
}
