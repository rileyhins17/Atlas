/** A Google Calendar event, trimmed to the fields Atlas maps. */
export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  updated?: string;
}

/**
 * One entry from the user's calendar list.
 *
 * `selected` is whether the calendar is ticked in Google's own UI, and it is
 * the honest default for what to sync: someone subscribed to a national
 * holidays feed and three sports schedules did not ask Atlas for any of it, and
 * a first sync that drags in six hundred fixtures makes the app worse. The user
 * can still turn any of them on.
 */
export interface GoogleCalendarSummary {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  selected?: boolean;
  deleted?: boolean;
  /** owner | writer | reader | freeBusyReader. Writing needs owner or writer. */
  accessRole?: string;
  backgroundColor?: string;
  timeZone?: string;
}

export interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
}

export function toGoogleDate(date: Date, allDay: boolean): { dateTime?: string; date?: string } {
  return allDay ? { date: date.toISOString().slice(0, 10) } : { dateTime: date.toISOString() };
}

/** Google sends `date` for all-day events and `dateTime` otherwise. */
export function parseGoogleDate(slot: { dateTime?: string; date?: string } | undefined): Date | null {
  const raw = slot?.dateTime ?? slot?.date;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isAllDay(event: GoogleEvent): boolean {
  return Boolean(event.start?.date && !event.start?.dateTime);
}
