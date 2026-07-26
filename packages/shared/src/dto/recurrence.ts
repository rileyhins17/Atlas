/**
 * A deliberately small RFC 5545 RRULE subset: the patterns the preset UI can
 * produce, and the ones Google Calendar emits in practice.
 *
 * Design rule: **never destroy a rule we don't understand.** An unparseable
 * RRULE round-trips verbatim and is treated as non-repeating locally, so a
 * Google sync can hand us an exotic rule, we'll store and return it unchanged,
 * and only our own expansion declines to guess at it.
 */
import { z } from 'zod';

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

/** RFC 5545 weekday codes, Monday-first to match the rest of Atlas. */
export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export interface Recurrence {
  freq: Freq;
  /** Every N periods. Defaults to 1. */
  interval: number;
  /** WEEKLY only: which weekdays. Empty = same weekday as the start date. */
  byDay: WeekdayCode[];
  /** Stop after this many occurrences (mutually exclusive with `until`). */
  count?: number;
  /** Stop on/after this date (mutually exclusive with `count`). */
  until?: Date;
}

const WEEKDAYS: WeekdayCode[] = ['MO', 'TU', 'WE', 'TH', 'FR'];
const DAY_LABEL: Record<WeekdayCode, string> = {
  MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
};

/** JS `getDay()` (Sun=0) → RFC weekday code. */
function codeOf(date: Date): WeekdayCode {
  return WEEKDAY_CODES[(date.getDay() + 6) % 7]!;
}

function indexOfCode(code: WeekdayCode): number {
  return WEEKDAY_CODES.indexOf(code);
}

/**
 * Parse an RRULE string. Returns null for anything outside the supported
 * subset — callers must treat null as "store it, don't expand it".
 */
export function parseRrule(rule: string | null | undefined): Recurrence | null {
  if (!rule) return null;
  const body = rule.trim().replace(/^RRULE:/i, '');
  if (!body) return null;

  const parts = new Map<string, string>();
  for (const segment of body.split(';')) {
    const [rawKey, rawValue] = segment.split('=');
    if (!rawKey || rawValue === undefined) return null; // malformed
    parts.set(rawKey.trim().toUpperCase(), rawValue.trim());
  }

  const freq = parts.get('FREQ')?.toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return null;

  const interval = parts.has('INTERVAL') ? Number(parts.get('INTERVAL')) : 1;
  if (!Number.isInteger(interval) || interval < 1) return null;

  let byDay: WeekdayCode[] = [];
  const rawByDay = parts.get('BYDAY');
  if (rawByDay) {
    // Positional prefixes ("2MO" = second Monday) are outside the subset.
    const codes = rawByDay.split(',').map((d) => d.trim().toUpperCase());
    if (!codes.every((c) => (WEEKDAY_CODES as readonly string[]).includes(c))) return null;
    byDay = codes as WeekdayCode[];
  }

  const count = parts.has('COUNT') ? Number(parts.get('COUNT')) : undefined;
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) return null;

  let until: Date | undefined;
  const rawUntil = parts.get('UNTIL');
  if (rawUntil) {
    // Basic-format iCal date or date-time: 20260731 / 20260731T235900Z
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(rawUntil);
    if (!m) return null;
    const [, y, mo, d, h = '23', mi = '59', sec = '59'] = m;
    until = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec));
    if (Number.isNaN(until.getTime())) return null;
  }
  if (count !== undefined && until) return null; // RFC forbids both

  return { freq, interval, byDay, count, until };
}

/** Serialise back to an RRULE string. */
export function formatRrule(r: Recurrence): string {
  const parts = [`FREQ=${r.freq}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.byDay.length > 0) parts.push(`BYDAY=${r.byDay.join(',')}`);
  if (r.count !== undefined) parts.push(`COUNT=${r.count}`);
  if (r.until) {
    const p = (n: number) => String(n).padStart(2, '0');
    parts.push(
      `UNTIL=${r.until.getFullYear()}${p(r.until.getMonth() + 1)}${p(r.until.getDate())}`,
    );
  }
  return parts.join(';');
}

/** Plain-English description for a row: "Every weekday", "Weekly on Mon, Wed". */
export function describeRrule(rule: string | null | undefined): string | null {
  const r = parseRrule(rule);
  if (!r) return null;

  const sameSet = (a: WeekdayCode[], b: WeekdayCode[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();

  let base: string;
  if (r.freq === 'DAILY') {
    base = r.interval === 1 ? 'Daily' : `Every ${r.interval} days`;
  } else if (r.freq === 'WEEKLY') {
    if (r.byDay.length === 0) {
      base = r.interval === 1 ? 'Weekly' : `Every ${r.interval} weeks`;
    } else if (r.interval === 1 && sameSet(r.byDay, WEEKDAYS)) {
      base = 'Every weekday';
    } else {
      const days = [...r.byDay]
        .sort((a, b) => indexOfCode(a) - indexOfCode(b))
        .map((d) => DAY_LABEL[d])
        .join(', ');
      base = r.interval === 1 ? `Weekly on ${days}` : `Every ${r.interval} weeks on ${days}`;
    }
  } else {
    base = r.interval === 1 ? 'Monthly' : `Every ${r.interval} months`;
  }

  if (r.count !== undefined) return `${base}, ${r.count}×`;
  if (r.until) {
    return `${base}, until ${r.until.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })}`;
  }
  return base;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Copy the wall-clock time of `from` onto the date `day`. */
function withTimeOf(day: Date, from: Date): Date {
  const x = new Date(day);
  x.setHours(from.getHours(), from.getMinutes(), from.getSeconds(), 0);
  return x;
}

/**
 * The next `count` occurrences strictly AFTER `after`, seeded from `start`
 * (the series' first occurrence, which supplies the time of day).
 *
 * Returns fewer than `count` — possibly none — when COUNT/UNTIL exhausts the
 * series. Unsupported rules yield an empty list rather than a guess.
 */
export function nextOccurrences(
  rule: string | null | undefined,
  start: Date,
  after: Date,
  count = 1,
): Date[] {
  const r = parseRrule(rule);
  if (!r || count < 1) return [];

  const out: Date[] = [];
  // Hard stop: enough iterations to cross a year of any supported frequency,
  // so a pathological rule can never spin forever.
  const MAX_STEPS = 4000;
  // Per RFC 5545 the seed (DTSTART) is itself the first occurrence, so COUNT=1
  // means "the seed and nothing more" and yields no *next* occurrence.
  let seen = 1;

  /** Record an occurrence; returns false when the series is exhausted. */
  const take = (at: Date): boolean => {
    if (r.until && at.getTime() > r.until.getTime()) return false;
    seen++;
    if (r.count !== undefined && seen > r.count) return false;
    if (at.getTime() > after.getTime()) out.push(new Date(at));
    return true;
  };

  if (r.freq === 'WEEKLY') {
    const days = r.byDay.length > 0 ? r.byDay : [codeOf(start)];
    const wanted = new Set(days.map(indexOfCode));
    // Week index is measured from the start's week so INTERVAL lands correctly.
    const weekAnchor = startOfDayLocal(addDays(start, -((start.getDay() + 6) % 7)));
    let cursor = startOfDayLocal(start);
    for (let step = 0; step < MAX_STEPS && out.length < count; step++, cursor = addDays(cursor, 1)) {
      if (!wanted.has((cursor.getDay() + 6) % 7)) continue;
      const weeks = Math.floor(
        (startOfDayLocal(cursor).getTime() - weekAnchor.getTime()) / (7 * 86_400_000),
      );
      if (weeks % r.interval !== 0) continue;
      const at = withTimeOf(cursor, start);
      if (at.getTime() <= start.getTime()) continue; // the seed itself isn't "next"
      if (!take(at)) break;
    }
    return out;
  }

  // DAILY / MONTHLY: step the unit directly.
  let cursor = new Date(start);
  for (let step = 0; step < MAX_STEPS && out.length < count; step++) {
    if (r.freq === 'DAILY') {
      cursor = addDays(cursor, r.interval);
    } else {
      const next = new Date(cursor);
      const targetDay = start.getDate();
      next.setDate(1); // avoid the Jan-31 → Mar-3 overflow
      next.setMonth(next.getMonth() + r.interval);
      // Clamp to the last valid day of the target month (31st → 30th/28th).
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(targetDay, lastDay));
      cursor = withTimeOf(next, start);
    }
    if (!take(cursor)) break;
  }
  return out;
}

/** Convenience for the task flow: the single next due date, or null. */
export function nextOccurrence(
  rule: string | null | undefined,
  start: Date,
  after: Date,
): Date | null {
  return nextOccurrences(rule, start, after, 1)[0] ?? null;
}

/** Presets the UI offers; `custom` is the escape hatch. */
export const RECURRENCE_PRESETS = [
  { key: 'none', label: 'Does not repeat', rule: null },
  { key: 'daily', label: 'Daily', rule: 'FREQ=DAILY' },
  { key: 'weekdays', label: 'Every weekday', rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { key: 'weekly', label: 'Weekly', rule: 'FREQ=WEEKLY' },
  { key: 'monthly', label: 'Monthly', rule: 'FREQ=MONTHLY' },
] as const;

/**
 * An RRULE accepted from a CLIENT — the preset picker or an AI tool call.
 *
 * Distinct from the preserve-verbatim rule at the top of this file, which
 * governs rules arriving from a *sync*. Those are written through Prisma
 * directly and never pass through a zod DTO, so validating here cannot lose a
 * Google rule.
 *
 * Length alone used to be the only check, which meant `FREQ=NONSENSE;;;` was
 * stored happily and then silently never recurred — the worst kind of failure,
 * because the UI showed a repeat was set and nothing ever came of it.
 */
export const RruleString = z
  .string()
  .max(500)
  .refine((v) => parseRrule(v) !== null, {
    message: 'That repeat rule is not one Atlas can schedule',
  });
