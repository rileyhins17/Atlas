/**
 * Timezone maths for the API — no tz library, just `Intl`.
 *
 * Every question here is "which LOCAL day is this for the user", because that
 * is what a person means by today, a streak, a due date or a brief's date. A
 * UTC day is wrong for them for four or five hours of every evening in
 * Toronto, which is when people check in on habits and write journals.
 *
 * Days are carried as "YYYY-MM-DD" keys and stepped with calendar arithmetic,
 * never with `+ 86_400_000`: a local day is 23 or 25 hours on the DST
 * transitions. The only conversion back to an instant is `dayKeyStartUtc`,
 * which resolves the offset at local midnight itself, so it is exact on those
 * days too.
 */

/** Fall back to UTC for an unknown/invalid timezone rather than throwing. */
export function safeTz(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/**
 * Building an `Intl.DateTimeFormat` costs far more than using one, and these
 * run once per row when a year of habit logs is bucketed into days. There is
 * one formatter per zone per shape for the life of the process.
 */
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(
  cache: Map<string, Intl.DateTimeFormat>,
  tz: string,
  make: (zone: string) => Intl.DateTimeFormat,
): Intl.DateTimeFormat {
  let f = cache.get(tz);
  if (!f) {
    // Keyed by the raw string, so a stream of junk zones cannot grow it forever.
    if (cache.size > 512) cache.clear();
    f = make(safeTz(tz));
    cache.set(tz, f);
  }
  return f;
}

/** The local calendar day of an instant in `tz`, as "YYYY-MM-DD". */
export function dayKeyInTz(instant: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD, which is also how the SQL rollups key days.
  return formatter(
    dayFormatters,
    tz,
    (timeZone) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
  ).format(instant);
}

/** Milliseconds to add to a UTC instant to get the wall-clock time in `tz`. */
export function tzOffsetMs(tz: string, date = new Date()): number {
  const dtf = formatter(
    partsFormatters,
    tz,
    (timeZone) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
  );
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

/** Calendar arithmetic on a "YYYY-MM-DD" key; no timezone is involved. */
export function shiftDayKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + deltaDays)).toISOString().slice(0, 10);
}

/** Monday = 0 … Sunday = 6, for a day key. */
export function weekdayOfDayKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
}

/**
 * The UTC instant at which local day `key` begins in `tz`.
 *
 * The offset is read AT local midnight, not at some other moment of the day:
 * on a DST transition day those differ by an hour, and reading it "now" put
 * the start of the day an hour off. Two passes settle it for any real zone.
 */
export function dayKeyStartUtc(key: string, tz: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  const wall = Date.UTC(y!, m! - 1, d!);
  const guess = wall - tzOffsetMs(tz, new Date(wall));
  return new Date(wall - tzOffsetMs(tz, new Date(guess)));
}

/**
 * The UTC instant of local midnight (start of day) in `tz` — of the day
 * containing `date`, or of the day `shiftDays` calendar days from it. Use the
 * shift rather than adding multiples of 24h to the result, which lands an
 * hour off whenever the span crosses a DST change.
 */
export function localDayStartUtc(tz: string, date = new Date(), shiftDays = 0): Date {
  return dayKeyStartUtc(shiftDayKey(dayKeyInTz(date, tz), shiftDays), tz);
}

/** The UTC instant of the start of the local week (Monday midnight) in `tz`. */
export function localWeekStartUtc(tz: string, date = new Date()): Date {
  const today = dayKeyInTz(date, tz);
  return dayKeyStartUtc(shiftDayKey(today, -weekdayOfDayKey(today)), tz);
}
