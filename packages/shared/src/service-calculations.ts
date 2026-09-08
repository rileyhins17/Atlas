import type { SettingsDTO } from './dto/settings.js';
import type { EventDTO } from './dto/event.js';
import type { NoteRecord, EventRecord } from './response-serialization.js';
import { serializeEvent as toDto } from './response-serialization.js';
import { nextOccurrences } from './dto/recurrence.js';
import type { MetricRow, StatsMetric } from './stats-assemble.js';

/** Ceiling on instances generated from one rule inside a single window. */
const MAX_OCCURRENCES_PER_SERIES = 100;

/**
 * Postgres stores `weightUnit` as TEXT, so Prisma types it as `string`. Narrow
 * it here rather than casting: a row written before the column existed, or by
 * hand, must not produce a DTO that lies about its own type.
 */
export function serializeSettings(row: {
  displayName: string | null;
  timezone: string;
  briefHour: number;
  proactiveEnabled: boolean;
  weightUnit: string;
}): SettingsDTO {
  return { ...row, weightUnit: row.weightUnit === 'kg' ? 'kg' : 'lb' };
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function journalSnippet(text: string, n = 80): string {
  const s = text.trim().replace(/\s+/g, ' ');
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function noteEmbeddingText(n: Pick<NoteRecord, 'title' | 'body'>): string {
  return n.title ? `${n.title}\n${n.body}` : n.body;
}

export function routineClockLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** YYYY-MM-DD arithmetic without touching timezones. */
export function shiftCalendarDayKey(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d!));
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
}

/**
 * Project a stored series onto a window as read-only occurrence rows. The
 * stored row IS the first occurrence, so it comes back from the query normally
 * and only the later ones are synthesised here.
 *
 * Synthetic rows carry `id = "<rootId>@<epochMs>"` and `isOccurrence: true` so
 * the UI can render them but never PATCH/DELETE them as if they were rows.
 */
export function expandEventSeries(event: EventRecord, from: Date, to: Date): EventDTO[] {
  const durationMs = event.endAt.getTime() - event.startAt.getTime();
  // `after` is exclusive, so step back a millisecond to keep an occurrence
  // landing exactly on the window start.
  const after = new Date(Math.max(from.getTime() - 1, event.startAt.getTime()));
  const dates = nextOccurrences(
    event.recurrence,
    event.startAt,
    after,
    MAX_OCCURRENCES_PER_SERIES,
  );
  const base = toDto(event);
  const out: EventDTO[] = [];
  for (const startAt of dates) {
    if (startAt.getTime() >= to.getTime()) break;
    out.push({
      ...base,
      id: `${event.id}@${startAt.getTime()}`,
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + durationMs).toISOString(),
      isOccurrence: true,
    });
  }
  return out;
}

/**
 * "incline db press" → "Incline Db Press". Words already containing a capital
 * are left alone, so "RDL" and "EZ-Bar" survive.
 */
export function workoutTemplateTitleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/[A-Z]/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function truncateNotification(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export function serviceErrorText(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

/** `JSON.stringify`, with bigints as strings — Prisma returns them for money. */
export function exportJson(value: unknown, space?: number): string {
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), space);
}

/** Re-indent a stringified value so it sits correctly inside the document. */
export function indentJson(text: string, depth: number): string {
  const pad = '  '.repeat(depth);
  return text.split('\n').join('\n' + pad);
}

export function tagStatsRows(metric: StatsMetric, rows: { day: string; value: number }[]): MetricRow[] {
  return rows.map((r) => ({ metric, day: r.day, value: Number(r.value) }));
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

