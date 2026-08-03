/**
 * Capture that works with no AI at all.
 *
 * Capture is the one interaction Atlas asks everyone to learn, and until now it
 * routed entirely through the model — so a brand-new account, which has no
 * DeepSeek key yet, met an error at the exact moment the product was meant to
 * prove itself. A first run that fails is worse than no first run.
 *
 * This is deliberately small. It is not a natural-language engine and it does
 * not try to be: it recognises the handful of shapes people actually type into
 * a capture box — "gym at 6", "call mum tomorrow", "buy milk" — and otherwise
 * files the raw sentence as a task, which is never wrong, only unambitious.
 * The model still does the clever work whenever a key exists.
 *
 * Same rule as the fitness split setup: reach for the AI last.
 */

export type LocalCaptureKind = 'task' | 'event';

export interface LocalCapture {
  kind: LocalCaptureKind;
  /** The sentence with the time words removed, e.g. "gym". */
  title: string;
  /** Local ISO instant for an event's start, or a task's due date. */
  at: Date | null;
  /** Events get an hour by default; a task has no duration. */
  endAt: Date | null;
  /**
   * True when a date or time was actually recognised. False means "we filed
   * your words and guessed nothing", which the UI should be able to say.
   */
  understoodTime: boolean;
}

const DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/** "tomorrow", "tonight", "monday", "next friday" → a date at local midnight. */
function matchDay(text: string, now: Date): { date: Date; consumed: string } | null {
  const lower = text.toLowerCase();
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (/\btoday\b|\btonight\b/.test(lower)) {
    return { date: midnight(now), consumed: /\btonight\b/.test(lower) ? 'tonight' : 'today' };
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = midnight(now);
    d.setDate(d.getDate() + 1);
    return { date: d, consumed: 'tomorrow' };
  }

  for (let i = 0; i < DAYS.length; i += 1) {
    const name = DAYS[i]!;
    const re = new RegExp(`\\b(next\\s+)?${name}\\b`, 'i');
    const hit = re.exec(lower);
    if (!hit) continue;
    const d = midnight(now);
    // Always the NEXT one. "Monday" said on a Monday means the coming Monday,
    // not today — if someone meant today they would have said today.
    let delta = (i - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    if (hit[1]) delta += 7;
    d.setDate(d.getDate() + delta);
    return { date: d, consumed: hit[0] };
  }
  return null;
}

/**
 * A clock time, if one is in there.
 *
 * The bare-hour rule is a judgement call and worth stating: 1–6 reads as
 * afternoon, 7–11 as morning. "Gym at 6" is not a 6am gym session and
 * "standup at 9" is not 9pm. 12 is noon. Anything with am/pm is taken at its
 * word, and 24-hour times are unambiguous already.
 */
function matchTime(text: string): { hour: number; minute: number; consumed: string } | null {
  const re = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
  const hit = re.exec(text);
  if (!hit) return null;

  const raw = Number(hit[1]);
  const minute = hit[2] ? Number(hit[2]) : 0;
  const suffix = hit[3]?.toLowerCase();

  if (raw > 24 || minute > 59) return null;
  // A bare number with no "at", no colon and no am/pm is far more likely to be
  // a quantity than a time — "buy 2 pints" must not become 2pm.
  if (!suffix && !hit[2] && !/\bat\s/i.test(hit[0])) return null;

  let hour = raw;
  if (suffix === 'pm' && hour < 12) hour += 12;
  else if (suffix === 'am' && hour === 12) hour = 0;
  else if (!suffix) {
    if (hour >= 1 && hour <= 6) hour += 12;
    else if (hour === 12) hour = 12;
  }
  if (hour > 23) return null;
  return { hour, minute, consumed: hit[0] };
}

/** Strip the words we consumed, then tidy what is left into a title. */
function titleFrom(text: string, consumed: string[]): string {
  let out = text;
  for (const c of consumed) {
    if (c) out = out.replace(c, ' ');
  }
  return out
    .replace(/\b(on|at|this|the)\b\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
    .trim();
}

const DEFAULT_EVENT_MINUTES = 60;

export function parseCapture(text: string, now: Date = new Date()): LocalCapture {
  const trimmed = text.trim();
  const day = matchDay(trimmed, now);
  // Look for a time only in what the day match did not claim, so "next
  // Monday" cannot have its "1" read as an hour.
  const forTime = day ? trimmed.replace(day.consumed, ' ') : trimmed;
  const time = matchTime(forTime);

  const consumed = [day?.consumed ?? '', time?.consumed ?? ''];
  const title = titleFrom(trimmed, consumed) || trimmed;

  if (!day && !time) {
    return { kind: 'task', title, at: null, endAt: null, understoodTime: false };
  }

  const base = day ? new Date(day.date) : new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!time) {
    // A date with no clock time is a due date, not a meeting. End of that day,
    // never midnight — a task due at 00:00 is overdue the moment it is made.
    base.setHours(23, 59, 0, 0);
    return { kind: 'task', title, at: base, endAt: null, understoodTime: true };
  }

  base.setHours(time.hour, time.minute, 0, 0);
  // A time that has already gone today means tomorrow, unless a day was named.
  if (!day && base.getTime() < now.getTime()) base.setDate(base.getDate() + 1);

  return {
    kind: 'event',
    title,
    at: base,
    endAt: new Date(base.getTime() + DEFAULT_EVENT_MINUTES * 60_000),
    understoodTime: true,
  };
}

/** What Atlas should say it did, in the same voice the AI summaries use. */
export function describeLocalCapture(c: LocalCapture): string {
  if (c.kind === 'event' && c.at) {
    const time = c.at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const day = c.at.toLocaleDateString(undefined, { weekday: 'long' });
    return `Added to your calendar: ${c.title}, ${day} at ${time}.`;
  }
  if (c.at) {
    const day = c.at.toLocaleDateString(undefined, { weekday: 'long' });
    return `Added task: ${c.title}, due ${day}.`;
  }
  return `Added task: ${c.title}.`;
}
