import {
  ConnectorScopeError,
  type Connector,
  type ConnectorContext,
} from './connector.js';
import {
  GoogleCredentialSchema,
  GoogleOAuth,
  type GoogleCredential,
  type GoogleOAuthConfig,
} from './google-oauth.js';

export type GoogleCalendarConfig = GoogleOAuthConfig;

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

const API_BASE = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_LIST_URL = `${API_BASE}/users/me/calendarList`;

/** The events endpoint for one calendar. Ids are email-shaped, so encode them. */
function eventsUrl(calendarId: string): string {
  return `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
}

/**
 * Still as narrow as it can be.
 *
 * `calendar.events` reads and writes events on calendars the user has already
 * granted, but it cannot ENUMERATE them — listing "Work", "Climbing", the
 * shared family calendar — so Atlas could only ever see `primary`. The second
 * scope is the granular read-only one for exactly that list, and nothing else:
 * it does not permit changing calendar settings, sharing, or subscriptions.
 */
const SCOPE = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ');
const MAX_PAGES = 10;

function toGoogleDate(date: Date, allDay: boolean): { dateTime?: string; date?: string } {
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

/**
 * Google Calendar connector: OAuth + the Calendar v3 event endpoints.
 *
 * It deliberately does NOT reconcile against Atlas's `events` table — a
 * connector never touches the DB. `GoogleSyncService` (apps/api) owns that.
 */
export class GoogleCalendarConnector implements Connector {
  readonly id = 'google-calendar';
  readonly label = 'Google Calendar';
  readonly credentialSchema = GoogleCredentialSchema;
  readonly capabilities = ['calendar.read', 'calendar.write'] as const;

  private readonly oauth: GoogleOAuth;

  constructor(config: GoogleCalendarConfig) {
    this.oauth = new GoogleOAuth(config, 'google-calendar', 'Google Calendar', SCOPE);
  }

  /** URL to send the user to for consent — see GoogleOAuth.authUrl. */
  authUrl(state: string): string {
    return this.oauth.authUrl(state);
  }

  /** Exchange the one-time callback code for tokens. */
  exchangeCode(code: string): Promise<GoogleCredential> {
    return this.oauth.exchangeCode(code);
  }

  private async call<T>(ctx: ConnectorContext, url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.oauth.accessToken(ctx);
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // A 403 naming the scope means the stored grant is older than the
      // permission being asked for — everyone who connected before Atlas could
      // read the calendar LIST is in exactly this position. It is fixed by
      // reconnecting, not by retrying, and it must not read as a server fault.
      if (res.status === 403 && /insufficient|scope|ACCESS_TOKEN_SCOPE/i.test(text)) {
        throw new ConnectorScopeError(
          'google-calendar',
          'Reconnect Google Calendar to let Atlas see your other calendars.',
        );
      }
      throw new Error(`Google Calendar API ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  async verify(ctx: ConnectorContext): Promise<boolean> {
    try {
      await this.call(ctx, `${eventsUrl('primary')}?maxResults=1`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Every calendar this Google account can see — not just `primary`.
   *
   * Deleted entries are dropped; everything else is returned WITH its `selected`
   * and `accessRole` intact so the caller can decide. Deciding here would hide
   * the choice from the user, and "why is my climbing calendar missing" is a
   * question the answer to should be visible in Settings.
   *
   * Throws ConnectorScopeError when the stored grant predates the calendar-list
   * scope, which is the case for everyone who connected before this existed.
   */
  async listCalendars(ctx: ConnectorContext): Promise<GoogleCalendarSummary[]> {
    const calendars: GoogleCalendarSummary[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ maxResults: '250', showDeleted: 'false' });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await this.call<{
        items?: GoogleCalendarSummary[];
        nextPageToken?: string;
      }>(ctx, `${CALENDAR_LIST_URL}?${params.toString()}`);
      calendars.push(...(data.items ?? []).filter((c) => !c.deleted));
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    return calendars;
  }

  /**
   * Events in a window. `singleEvents` expands recurring series into concrete
   * instances, so Atlas stores real occurrences rather than an RRULE it would
   * have to interpret. Cancelled events are included so deletions propagate.
   */
  async listEvents(
    ctx: ConnectorContext,
    opts: { timeMin: Date; timeMax: Date; calendarId?: string },
  ): Promise<GoogleEvent[]> {
    const url = eventsUrl(opts.calendarId ?? 'primary');
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        timeMin: opts.timeMin.toISOString(),
        timeMax: opts.timeMax.toISOString(),
        singleEvents: 'true',
        showDeleted: 'true',
        maxResults: '250',
        orderBy: 'startTime',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await this.call<{ items?: GoogleEvent[]; nextPageToken?: string }>(
        ctx,
        `${url}?${params.toString()}`,
      );
      events.push(...(data.items ?? []));
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    return events;
  }

  /** Writes land on `primary` unless a calendar is named. */
  async createEvent(
    ctx: ConnectorContext,
    input: EventInput,
    calendarId = 'primary',
  ): Promise<GoogleEvent> {
    return this.call<GoogleEvent>(ctx, eventsUrl(calendarId), {
      method: 'POST',
      body: JSON.stringify({
        summary: input.title,
        description: input.description ?? undefined,
        location: input.location ?? undefined,
        start: toGoogleDate(input.startAt, input.allDay),
        end: toGoogleDate(input.endAt, input.allDay),
      }),
    });
  }

  async updateEvent(
    ctx: ConnectorContext,
    eventId: string,
    input: EventInput,
    calendarId = 'primary',
  ): Promise<GoogleEvent> {
    return this.call<GoogleEvent>(ctx, `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        summary: input.title,
        description: input.description ?? undefined,
        location: input.location ?? undefined,
        start: toGoogleDate(input.startAt, input.allDay),
        end: toGoogleDate(input.endAt, input.allDay),
      }),
    });
  }
}
