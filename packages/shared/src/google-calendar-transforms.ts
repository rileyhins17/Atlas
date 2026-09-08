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

export interface SyncCalendar {
  id: string;
  primary: boolean;
}

export interface RemoteEventData {
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  sourceCalendarId: string | null;
}

export function eventToGoogleInput(event: EventInput) {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
  };
}

export function googleEventRow(gEvent: GoogleEvent, calendar: SyncCalendar) {
  const startAt = parseGoogleDate(gEvent.start);
  const endAt = parseGoogleDate(gEvent.end);
  // Google can return events without usable times (rare, but they exist).
  // Skipping beats writing a row that violates endAt >= startAt.
  if (!startAt || !endAt || endAt < startAt) return null;
  return {
    title: gEvent.summary?.trim() || '(untitled)',
    description: gEvent.description ?? null,
    location: gEvent.location ?? null,
    startAt,
    endAt,
    allDay: isAllDay(gEvent),
    // Primary stays null, matching every row written before this column
    // existed. Writing 'primary' for some and the account's own address for
    // others would make one calendar look like two.
    sourceCalendarId: calendar.primary ? null : calendar.id,
  };
}

export function googleEventDiffers(row: RemoteEventData, data: RemoteEventData) {
  return (
    row.title !== data.title ||
    row.description !== data.description ||
    row.location !== data.location ||
    row.startAt.getTime() !== data.startAt.getTime() ||
    row.endAt.getTime() !== data.endAt.getTime() ||
    row.allDay !== data.allDay ||
    row.sourceCalendarId !== data.sourceCalendarId
  );
}

export function selectSyncCalendars(all: GoogleCalendarSummary[], chosen: string[] | null, limit: number): SyncCalendar[] {
  const wanted = all.filter((c) => {
    if (c.accessRole === 'freeBusyReader') return false;
    return chosen ? chosen.includes(c.id) : c.selected !== false;
  });
  const primary = all.find((c) => c.primary);
  if (primary && !wanted.some((c) => c.primary)) wanted.unshift(primary);
  return wanted.slice(0, limit).map((c) => ({ id: c.id, primary: Boolean(c.primary) }));
}
