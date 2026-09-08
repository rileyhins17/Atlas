/** Fall back to UTC for an unknown/invalid timezone rather than throwing. */
export function safeTz(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** The local calendar day of an instant in `tz`, as "YYYY-MM-DD". */
export function dayKeyInTz(instant: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD, which is also how the SQL rollups key days.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
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
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/** The local hour (0-23) in `tz` at `date`. */
export function localHour(tz: string, date = new Date()): number {
  return new Date(date.getTime() + tzOffsetMs(tz, date)).getUTCHours();
}


/**
 * Midnight of the user's calendar day, optionally stepped by calendar days.
 * Resolve the offset at the boundary itself, not at the current instant.
 * When midnight repeats, use its first occurrence; when it is skipped, use
 * the first representable time after the gap.
 */
export function localDayStartUtc(tz: string, date = new Date(), days = 0): Date {
  const zone = safeTz(tz);
  const wall = new Date(date.getTime() + tzOffsetMs(zone, date));
  const midnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + days);
  // Elapsed hours discover offsets around a transition; they do not step days.
  const offsets = new Set([-36, -12, 0, 12, 36].map(
    (hours) => tzOffsetMs(zone, new Date(midnight + hours * 3_600_000)),
  ));
  const candidates = [...offsets].map((offset) => {
    const instant = midnight - offset;
    return { instant, wall: instant + tzOffsetMs(zone, new Date(instant)) };
  });
  const exact = candidates.filter((c) => c.wall === midnight);
  if (exact.length) return new Date(Math.min(...exact.map((c) => c.instant)));
  const after = candidates.filter((c) => c.wall > midnight).sort((a, b) => a.wall - b.wall);
  if (!after.length) throw new RangeError('Unable to resolve local day boundary');
  return new Date(after[0]!.instant);
}

/** The UTC instant of Monday midnight in the user's local week. */
export function localWeekStartUtc(tz: string, date = new Date()): Date {
  const wall = new Date(date.getTime() + tzOffsetMs(tz, date));
  return localDayStartUtc(tz, date, -((wall.getUTCDay() + 6) % 7));
}
