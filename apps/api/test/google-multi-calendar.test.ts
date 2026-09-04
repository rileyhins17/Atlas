import { describe, expect, it, vi } from 'vitest';
import { ConnectorScopeError } from '@atlas/connectors';
import { GoogleSyncService } from '../src/modules/calendar/google-sync.service.js';

/**
 * Atlas could only ever see `primary`, which is wrong for almost everyone: the
 * calendars people organise their lives with are the ones they made — "Work",
 * "Climbing", the shared family one — and none of them were visible.
 *
 * The interesting cases are all about restraint and about not breaking the
 * accounts that already exist: a token granted before Atlas asked to read the
 * calendar LIST cannot, and that must degrade to primary rather than failing.
 */
const CALENDARS = [
  { id: 'me@example.com', summary: 'Riley', primary: true, selected: true, accessRole: 'owner' },
  { id: 'work@example.com', summary: 'Work', selected: true, accessRole: 'owner' },
  { id: 'holidays', summary: 'UK Holidays', selected: false, accessRole: 'reader' },
  { id: 'busy@example.com', summary: 'Sam', selected: true, accessRole: 'freeBusyReader' },
];

const gEvent = (id: string) => ({
  id,
  status: 'confirmed',
  summary: `Event ${id}`,
  start: { dateTime: '2026-09-10T09:00:00.000Z' },
  end: { dateTime: '2026-09-10T10:00:00.000Z' },
});

/** A service wired to fakes, plus handles on what the connector was asked. */
function makeService(opts: {
  calendars?: unknown;
  meta?: Record<string, unknown> | null;
  eventsByCalendar?: Record<string, ReturnType<typeof gEvent>[]>;
} = {}) {
  const asked: string[] = [];
  const created: Record<string, unknown>[] = [];
  const deleteArgs: Record<string, unknown>[] = [];

  const connector = {
    listCalendars: vi.fn(async () => {
      if (opts.calendars instanceof Error) throw opts.calendars;
      return opts.calendars ?? CALENDARS;
    }),
    listEvents: vi.fn(async (_ctx: unknown, o: { calendarId?: string }) => {
      asked.push(o.calendarId ?? 'primary');
      return opts.eventsByCalendar?.[o.calendarId ?? 'primary'] ?? [];
    }),
    createEvent: vi.fn(async () => ({ id: 'pushed_1' })),
  };

  const prisma = {
    client: {
      credential: {
        findUnique: vi.fn(async () => ({ meta: opts.meta ?? null })),
      },
      event: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: `row_${created.length}`, ...data };
        }),
        update: vi.fn(async () => ({})),
        findMany: vi.fn(async () => []),
        deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          deleteArgs.push(where);
          return { count: 3 };
        }),
      },
    },
  };

  const connectors = {
    googleCalendar: connector,
    contextFor: vi.fn(() => ({})),
    saveCredentialMeta: vi.fn(async () => {}),
    saveCredential: vi.fn(async () => {}),
  };
  const timeline = { write: vi.fn(async () => {}) };

  const service = new GoogleSyncService(
    prisma as never,
    timeline as never,
    connectors as never,
  );
  return { service, connector, connectors, asked, created, deleteArgs };
}

describe('GoogleSyncService — every calendar, not just primary', () => {
  it('reads the calendars Google itself shows', async () => {
    const { service, asked } = makeService();
    await service.sync('u1');
    expect(asked).toContain('me@example.com');
    expect(asked).toContain('work@example.com');
  });

  /**
   * A holidays feed the user unticked in Google is not something they asked
   * Atlas for. Dragging it in would put a row on a hundred days.
   */
  it('leaves alone a calendar the user unticked in Google', async () => {
    const { service, asked } = makeService();
    await service.sync('u1');
    expect(asked).not.toContain('holidays');
  });

  /**
   * freeBusyReader can see THAT someone is busy and never what by, so every
   * event would import as an untitled block. Worse than nothing.
   */
  it('skips a calendar it can only read free/busy from', async () => {
    const { service, asked } = makeService();
    await service.sync('u1');
    expect(asked).not.toContain('busy@example.com');
  });

  it('honours an explicit choice over Google defaults', async () => {
    const { service, asked } = makeService({ meta: { syncedCalendarIds: ['holidays'] } });
    await service.sync('u1');
    expect(asked).toContain('holidays');
    expect(asked).not.toContain('work@example.com');
  });

  /**
   * Primary is where Atlas's own pushes land. Not reading it back is how the
   * same event gets pushed again on every sync.
   */
  it('always reads primary, even when the user unticked it', async () => {
    const { service, asked } = makeService({ meta: { syncedCalendarIds: ['work@example.com'] } });
    await service.sync('u1');
    expect(asked).toContain('me@example.com');
  });

  it('records which calendar an event came from, and leaves primary null', async () => {
    const { service, created } = makeService({
      eventsByCalendar: {
        'me@example.com': [gEvent('a')],
        'work@example.com': [gEvent('b')],
      },
    });
    await service.sync('u1');
    expect(created.find((d) => d.externalId === 'a')?.sourceCalendarId).toBeNull();
    expect(created.find((d) => d.externalId === 'b')?.sourceCalendarId).toBe('work@example.com');
  });

  /**
   * The upgrade path. Every account connected before this existed holds a token
   * without the calendar-list scope, and Google answers 403. Their calendar is
   * syncing perfectly well, so reporting a failure would be a lie — it degrades
   * to primary and says what would fix it.
   */
  it('falls back to primary when the stored grant predates the scope', async () => {
    const { service, asked } = makeService({
      calendars: new ConnectorScopeError('google-calendar', 'Reconnect Google Calendar.'),
    });
    const result = await service.sync('u1');
    expect(asked).toEqual(['primary']);
    expect(result.errors.join(' ')).toMatch(/Reconnect/i);
  });

  /** One unreadable calendar must not abandon the rest. */
  it('carries on when a single calendar fails', async () => {
    const { service, connector, asked } = makeService();
    connector.listEvents.mockImplementation(async (_ctx: unknown, o: { calendarId?: string }) => {
      asked.push(o.calendarId ?? 'primary');
      if (o.calendarId === 'me@example.com') throw new Error('410 gone');
      return [gEvent('b')];
    });
    const result = await service.sync('u1');
    expect(asked).toContain('work@example.com');
    expect(result.imported).toBe(1);
    expect(result.errors.join(' ')).toMatch(/me@example.com/);
  });
});

describe('GoogleSyncService.setCalendars', () => {
  it('removes the events a de-selected calendar brought in', async () => {
    const { service, deleteArgs } = makeService({
      meta: { syncedCalendarIds: ['me@example.com', 'work@example.com'] },
    });
    const res = await service.setCalendars('u1', ['me@example.com']);
    expect(deleteArgs).toHaveLength(1);
    expect(deleteArgs[0]).toMatchObject({ sourceCalendarId: 'work@example.com' });
    expect(res.removed).toBe(3);
  });

  /**
   * Rows written before the column existed have a null sourceCalendarId and are
   * primary. Unticking primary has to clear them too, or they would be stranded
   * forever with nothing able to match them.
   */
  it('treats a null source calendar as primary when clearing', async () => {
    const { service, deleteArgs } = makeService({
      meta: { syncedCalendarIds: ['me@example.com'] },
    });
    await service.setCalendars('u1', []);
    const where = deleteArgs[0] as { OR?: Record<string, unknown>[] };
    expect(where.OR).toEqual(
      expect.arrayContaining([{ sourceCalendarId: null }, { sourceCalendarId: 'primary' }]),
    );
  });

  it('deletes nothing when a calendar is only being added', async () => {
    const { service, deleteArgs } = makeService({
      meta: { syncedCalendarIds: ['me@example.com'] },
    });
    await service.setCalendars('u1', ['me@example.com', 'holidays']);
    expect(deleteArgs).toHaveLength(0);
  });

  it('stores the choice against the connection', async () => {
    const { service, connectors } = makeService({ meta: { syncedCalendarIds: [] } });
    await service.setCalendars('u1', ['work@example.com', 'work@example.com']);
    expect(connectors.saveCredentialMeta).toHaveBeenCalledWith('u1', 'google-calendar', {
      syncedCalendarIds: ['work@example.com'],
    });
  });
});
