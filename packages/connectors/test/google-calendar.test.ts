import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleCalendarConnector,
  isAllDay,
  parseGoogleDate,
  type GoogleCredential,
} from '../src/google-calendar.js';
import type { ConnectorContext } from '../src/connector.js';

const CONFIG = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:4000/connectors/google/callback',
};

function ctxWith(secret: GoogleCredential | null) {
  const saved: Record<string, unknown>[] = [];
  const ctx: ConnectorContext = {
    getSecret: async () => secret as unknown as Record<string, unknown> | null,
    saveSecret: async (s) => {
      saved.push(s);
    },
  };
  return { ctx, saved };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => fetchMock.mockReset());

describe('parseGoogleDate / isAllDay', () => {
  it('reads timed events from dateTime', () => {
    expect(parseGoogleDate({ dateTime: '2026-08-01T10:00:00Z' })?.toISOString()).toBe('2026-08-01T10:00:00.000Z');
  });

  it('reads all-day events from date', () => {
    expect(parseGoogleDate({ date: '2026-08-01' })?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('returns null for a missing or unparseable slot', () => {
    expect(parseGoogleDate(undefined)).toBeNull();
    expect(parseGoogleDate({})).toBeNull();
    expect(parseGoogleDate({ dateTime: 'not-a-date' })).toBeNull();
  });

  it('detects all-day only when date is present without dateTime', () => {
    expect(isAllDay({ id: '1', start: { date: '2026-08-01' } })).toBe(true);
    expect(isAllDay({ id: '1', start: { dateTime: '2026-08-01T10:00:00Z' } })).toBe(false);
    expect(isAllDay({ id: '1' })).toBe(false);
  });
});

describe('GoogleCalendarConnector.authUrl', () => {
  it('requests offline access and forces consent so a refresh token comes back', () => {
    const url = new URL(new GoogleCalendarConnector(CONFIG).authUrl('state-123'));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('client_id')).toBe(CONFIG.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri);
  });

  it('asks only for the events scope, not full calendar access', () => {
    const url = new URL(new GoogleCalendarConnector(CONFIG).authUrl('s'));
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.events');
  });
});

describe('GoogleCalendarConnector token handling', () => {
  it('exchanges a code into a credential with an absolute expiry', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'sc' }),
    );
    const before = Date.now();
    const cred = await new GoogleCalendarConnector(CONFIG).exchangeCode('code-1');
    expect(cred.accessToken).toBe('at');
    expect(cred.refreshToken).toBe('rt');
    expect(cred.expiresAt).toBeGreaterThanOrEqual(before + 3600_000 - 50);
  });

  it('reuses a still-valid access token without calling Google', async () => {
    const { ctx } = ctxWith({ accessToken: 'good', refreshToken: 'rt', expiresAt: Date.now() + 600_000 });
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    await new GoogleCalendarConnector(CONFIG).listEvents(ctx, { timeMin: new Date(), timeMax: new Date() });
    // exactly one call: the events list, no token refresh
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('calendar/v3');
  });

  it('refreshes an expired token, persists it, and keeps the refresh token', async () => {
    // Google omits refresh_token on refresh responses; dropping it would break
    // every subsequent refresh.
    const { ctx, saved } = ctxWith({ accessToken: 'stale', refreshToken: 'rt', expiresAt: Date.now() - 1 });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'fresh', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    await new GoogleCalendarConnector(CONFIG).listEvents(ctx, { timeMin: new Date(), timeMax: new Date() });

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ accessToken: 'fresh', refreshToken: 'rt' });
    const authHeader = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(authHeader.Authorization).toBe('Bearer fresh');
  });

  it('refreshes proactively when the token is within the expiry skew', async () => {
    const { ctx, saved } = ctxWith({ accessToken: 'about-to-die', refreshToken: 'rt', expiresAt: Date.now() + 5_000 });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'fresh', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    await new GoogleCalendarConnector(CONFIG).listEvents(ctx, { timeMin: new Date(), timeMax: new Date() });
    expect(saved).toHaveLength(1);
  });

  it('fails clearly when expired with no refresh token', async () => {
    const { ctx } = ctxWith({ accessToken: 'stale', expiresAt: Date.now() - 1 });
    await expect(
      new GoogleCalendarConnector(CONFIG).listEvents(ctx, { timeMin: new Date(), timeMax: new Date() }),
    ).rejects.toThrow(/reconnect/i);
  });

  it('fails clearly when nothing is stored', async () => {
    const { ctx } = ctxWith(null);
    await expect(
      new GoogleCalendarConnector(CONFIG).listEvents(ctx, { timeMin: new Date(), timeMax: new Date() }),
    ).rejects.toThrow(/not connected/i);
  });

  it('verify() returns false rather than throwing when the credential is bad', async () => {
    const { ctx } = ctxWith(null);
    await expect(new GoogleCalendarConnector(CONFIG).verify(ctx)).resolves.toBe(false);
  });
});

describe('GoogleCalendarConnector.listEvents', () => {
  const validCtx = () => ctxWith({ accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 600_000 }).ctx;

  it('expands recurring events and includes deletions so they can propagate', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    await new GoogleCalendarConnector(CONFIG).listEvents(validCtx(), {
      timeMin: new Date('2026-01-01'),
      timeMax: new Date('2026-02-01'),
    });
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('showDeleted')).toBe('true');
  });

  it('follows pagination', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'a' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'b' }] }));
    const events = await new GoogleCalendarConnector(CONFIG).listEvents(validCtx(), {
      timeMin: new Date(),
      timeMax: new Date(),
    });
    expect(events.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('surfaces API errors with the status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden', json: async () => ({}) });
    await expect(
      new GoogleCalendarConnector(CONFIG).listEvents(validCtx(), { timeMin: new Date(), timeMax: new Date() }),
    ).rejects.toThrow(/403/);
  });
});

describe('GoogleCalendarConnector.createEvent', () => {
  const validCtx = () => ctxWith({ accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 600_000 }).ctx;

  it('sends timed events as dateTime', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'new' }));
    await new GoogleCalendarConnector(CONFIG).createEvent(validCtx(), {
      title: 'Dentist',
      startAt: new Date('2026-08-01T10:00:00Z'),
      endAt: new Date('2026-08-01T11:00:00Z'),
      allDay: false,
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.summary).toBe('Dentist');
    expect(body.start).toEqual({ dateTime: '2026-08-01T10:00:00.000Z' });
  });

  it('sends all-day events as a bare date', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'new' }));
    await new GoogleCalendarConnector(CONFIG).createEvent(validCtx(), {
      title: 'Holiday',
      startAt: new Date('2026-08-01T00:00:00Z'),
      endAt: new Date('2026-08-02T00:00:00Z'),
      allDay: true,
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.start).toEqual({ date: '2026-08-01' });
  });
});
