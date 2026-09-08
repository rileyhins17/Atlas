import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Strictly disposable CI data. No env files, production hosts, row deletion or cleanup writes.
const testUrl = 'postgresql://atlas:atlas@localhost:5432/atlas_test';
assert.equal(process.env.CI, 'true', 'Habit timezone check is CI-only');
assert.equal(process.env.DATABASE_URL, testUrl, 'Requires disposable CI database');
assert.equal(process.env.DIRECT_DATABASE_URL, testUrl, 'Requires disposable CI direct URL');
const { PrismaClient } = await import('../../packages/db/dist/index.js');
const { HabitsService } = await import('../../apps/api/dist/modules/habits/habits.service.js');
const { UserTimezoneService } = await import('../../apps/api/dist/core/user-timezone.service.js');
const db = new PrismaClient({ datasourceUrl: testUrl });
const NativeDate = Date;
const cases = [
  { label: 'Toronto evening', timezone: 'America/Toronto', now: '2026-09-09T01:00:00Z', target: 2,
    logs: [['2026-09-07T16:00:00Z', 2], ['2026-09-09T00:30:00Z', 1]],
    days: [{ day: '2026-09-07', count: 2 }, { day: '2026-09-08', count: 1 }], count: 1, done: false, streak: 1 },
  { label: 'Tokyo morning', timezone: 'Asia/Tokyo', now: '2026-09-08T18:00:00Z', target: 1,
    logs: [['2026-09-08T17:00:00Z', 1]], days: [{ day: '2026-09-09', count: 1 }], count: 1, done: true, streak: 1 },
  { label: 'Toronto spring transition', timezone: 'America/Toronto', now: '2026-03-09T02:00:00Z', target: 2,
    logs: [['2026-03-08T05:15:00Z', 1], ['2026-03-09T01:15:00Z', 1]], days: [{ day: '2026-03-08', count: 2 }], count: 2, done: true, streak: 1 },
  { label: 'Toronto fall transition', timezone: 'America/Toronto', now: '2026-11-02T03:00:00Z', target: 2,
    logs: [['2026-11-01T04:15:00Z', 1], ['2026-11-02T02:15:00Z', 1]], days: [{ day: '2026-11-01', count: 2 }], count: 2, done: true, streak: 1 },
];
try {
  for (const entry of cases) {
    const suffix = randomUUID();
    const owner = `habit-tz-owner-${suffix}`;
    const other = `habit-tz-other-${suffix}`;
    await db.user.createMany({ data: [owner, other].map(id => ({ id, email: `${id}@example.invalid`, passwordHash: 'synthetic-no-login', timezone: entry.timezone })) });
    const habit = await db.habit.create({ data: { userId: owner, name: `Synthetic ${entry.label}`, cadence: 'daily', target: entry.target } });
    await db.habitLog.createMany({ data: [
      ...entry.logs.map(([at, value]) => ({ userId: owner, habitId: habit.id, loggedAt: new NativeDate(at), value })),
      // A different owner with the same habit id must not contaminate the aggregate.
      { userId: other, habitId: habit.id, loggedAt: new NativeDate(entry.logs[0][0]), value: 99 },
    ] });
    const before = await db.habitLog.findMany({ where: { habitId: habit.id }, orderBy: { id: 'asc' }, take: 10 });
    const service = new HabitsService({ client: db }, { write: async () => {} }, new UserTimezoneService({ client: db }));
    const instant = new NativeDate(entry.now).getTime();
    // Freeze only this script's JS clock; persisted timestamps are explicit and the DB clock is untouched.
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [instant])); }
      static now() { return instant; }
    };
    try {
      const [dto] = await service.list(owner);
      assert.deepEqual({ count: dto.todayCount, done: dto.doneToday, streak: dto.streak }, { count: entry.count, done: entry.done, streak: entry.streak });
      assert.deepEqual(await service.history(owner, 7), [{ habitId: habit.id, days: entry.days }]);
      assert.deepEqual(await service.history(owner, 1), [{ habitId: habit.id, days: [entry.days.at(-1)] }]);
    } finally { globalThis.Date = NativeDate; }
    const after = await db.habitLog.findMany({ where: { habitId: habit.id }, orderBy: { id: 'asc' }, take: 10 });
    assert.deepEqual(after, before, 'Read-side timezone conversion must not rewrite check-ins');
  }
  process.stdout.write('Habit local days verified: Toronto evening, Tokyo morning, both DST transitions; complete-day windows, counts, streaks, tenant isolation and unchanged raw logs.\n');
} finally {
  globalThis.Date = NativeDate;
  await db.$disconnect();
}
