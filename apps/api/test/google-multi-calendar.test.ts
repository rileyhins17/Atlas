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
        // Nothing already synced, so every remote event is an import.
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
          where['source'] === 'atlas' ? [] : [],
        ),
        createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
          created.push(...data);
          return { count: data.length };
        }),
        update: vi.fn(async () => ({})),
        deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          deleteArgs.push(where);
          return { count: 3 };
        }),
      },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    },
  };

  const connectors = {
    googleCalendar: connector,
    contextFor: vi.fn(() => ({})),
    saveCredentialMeta: vi.fn(async () => {}),
    saveCredential: vi.fn(async () => {}),
  };
  // Typed argument so the call tuple is not inferred as empty — asserting on
  // calls[0][0] is the point of the timeline tests below.
  const timeline = { write: vi.fn(async (_row: Record<string, unknown>) => {}) };

  const service = new GoogleSyncService(
    prisma as never,
    timeline as never,
    connectors as never,
  );
  return { service, connector, connectors, timeline, prisma, asked, created, deleteArgs };
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
    // One delete covering every de-selected calendar, not one each.
    expect(deleteArgs).toHaveLength(1);
    expect(JSON.stringify(deleteArgs[0])).toContain('work@example.com');
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

/**
 * The sync used to make three sequential round trips PER EVENT: a findUnique, a
 * create or update, and a timeline insert. Fine against a local database and
 * ruinous against a hosted one — measured 384ms to Supabase, 276 events, 318
 * seconds predicted and 305 observed. The HTTP request died at the proxy's
 * ~100-second ceiling long before that, so the calendars later in the list were
 * never reached: a real user watched two of her six calendars sync behind a
 * spinner that never finished.
 *
 * So these are performance tests written as behaviour: the number of database
 * calls must not grow with the number of events.
 */
describe('GoogleSyncService — writes in bulk, not per event', () => {
  const many = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => gEvent(`${prefix}${i}`));

  it('reads existing rows in one query however many events there are', async () => {
    const { service, prisma } = makeService({
      eventsByCalendar: { 'me@example.com': many(200, 'a'), 'work@example.com': many(200, 'b') },
    });
    await service.sync('u1');
    // One lookup for the remote ids, plus the unsynced-push query. Not 400.
    expect(prisma.client.event.findMany.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('creates them in one call', async () => {
    const { service, prisma } = makeService({
      eventsByCalendar: { 'me@example.com': many(150, 'a') },
    });
    const result = await service.sync('u1');
    expect(prisma.client.event.createMany).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(150);
  });

  /**
   * A meeting you are invited to carries the SAME Google id on every calendar
   * it appears on. Before the dedupe this reached createMany twice and violated
   * the unique index, failing the whole batch rather than one row.
   */
  it('writes an event shared by two calendars exactly once', async () => {
    const shared = gEvent('shared-1');
    const { service, created } = makeService({
      eventsByCalendar: { 'me@example.com': [shared], 'work@example.com': [shared] },
    });
    const result = await service.sync('u1');
    expect(created.filter((d) => d.externalId === 'shared-1')).toHaveLength(1);
    expect(result.imported).toBe(1);
  });

  /**
   * One timeline row for the sync, not one per event. The canvas already
   * discarded `event.imported` as noise, so those were 234 writes at 384ms each
   * to be thrown away — and they drowned the compact log the AI reads.
   */
  it('writes one timeline row for the whole sync', async () => {
    const { service, timeline } = makeService({
      eventsByCalendar: { 'me@example.com': many(50, 'a') },
    });
    await service.sync('u1');
    expect(timeline.write).toHaveBeenCalledTimes(1);
    expect(timeline.write.mock.calls[0]?.[0]).toMatchObject({ type: 'calendar.synced' });
  });

  /** Nothing changed is not an event worth logging. */
  it('writes no timeline row when nothing changed', async () => {
    const { service, timeline } = makeService();
    await service.sync('u1');
    expect(timeline.write).not.toHaveBeenCalled();
  });
});
