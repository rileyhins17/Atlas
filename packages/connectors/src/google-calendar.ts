import { z } from 'zod';
import type { Connector, ConnectorContext } from './connector.js';

/**
 * OAuth tokens for one Google account. Stored AES-GCM encrypted in the
 * `credentials` table — never on disk, never in env (the *client* id/secret are
 * app-level config and do live in env; these are the user's tokens).
 */
export const GoogleCredentialSchema = z.object({
  accessToken: z.string().min(1),
  /**
   * Google only returns a refresh token on the FIRST consent unless
   * prompt=consent is forced. Optional here so a re-consent that omits it
   * doesn't fail validation and wipe the one we already hold.
   */
  refreshToken: z.string().optional(),
  /** Epoch ms when accessToken expires. */
  expiresAt: z.number(),
  scope: z.string().optional(),
});
export type GoogleCredential = z.infer<typeof GoogleCredentialSchema>;

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

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

export interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
/** Events-only: enough to read/write events, but not to touch calendar settings or other scopes. */
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
/** Refresh a bit early so a token can't expire mid-request. */
const EXPIRY_SKEW_MS = 60_000;
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

  constructor(private readonly config: GoogleCalendarConfig) {}

  /**
   * URL to send the user to for consent. `state` is caller-supplied and MUST be
   * verified on callback — it's the CSRF defence for the OAuth handshake.
   *
   * access_type=offline + prompt=consent are what make Google return a refresh
   * token; without them a re-consent yields access-only tokens and sync dies an
   * hour later.
   */
  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  /** Exchange the one-time callback code for tokens. */
  async exchangeCode(code: string): Promise<GoogleCredential> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google token exchange failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      scope: data.scope,
    };
  }

  /**
   * A valid access token, refreshing and re-persisting if it's expired/expiring.
   * Google omits refresh_token from refresh responses, so the existing one is
   * carried forward — dropping it would silently break the next refresh.
   */
  private async accessToken(ctx: ConnectorContext): Promise<string> {
    const parsed = GoogleCredentialSchema.safeParse(await ctx.getSecret());
    if (!parsed.success) {
      throw new Error('Google Calendar is not connected. Connect it in Settings.');
    }
    const cred = parsed.data;
    if (cred.expiresAt - EXPIRY_SKEW_MS > Date.now()) return cred.accessToken;

    if (!cred.refreshToken) {
      throw new Error('Google access token expired and no refresh token is stored. Reconnect Google Calendar.');
    }
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: cred.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google token refresh failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in?: number; scope?: string };
    const refreshed: GoogleCredential = {
      accessToken: data.access_token,
      refreshToken: cred.refreshToken,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      scope: data.scope ?? cred.scope,
    };
    await ctx.saveSecret(refreshed);
    return refreshed.accessToken;
  }

  private async call<T>(ctx: ConnectorContext, url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.accessToken(ctx);
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
      throw new Error(`Google Calendar API ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  async verify(ctx: ConnectorContext): Promise<boolean> {
    try {
      await this.call(ctx, `${CALENDAR_URL}?maxResults=1`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Events in a window. `singleEvents` expands recurring series into concrete
   * instances, so Atlas stores real occurrences rather than an RRULE it would
   * have to interpret. Cancelled events are included so deletions propagate.
   */
  async listEvents(
    ctx: ConnectorContext,
    opts: { timeMin: Date; timeMax: Date },
  ): Promise<GoogleEvent[]> {
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
        `${CALENDAR_URL}?${params.toString()}`,
      );
      events.push(...(data.items ?? []));
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    return events;
  }

  async createEvent(ctx: ConnectorContext, input: EventInput): Promise<GoogleEvent> {
    return this.call<GoogleEvent>(ctx, CALENDAR_URL, {
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

  async updateEvent(ctx: ConnectorContext, eventId: string, input: EventInput): Promise<GoogleEvent> {
    return this.call<GoogleEvent>(ctx, `${CALENDAR_URL}/${encodeURIComponent(eventId)}`, {
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
