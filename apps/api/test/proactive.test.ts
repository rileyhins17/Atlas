import { describe, expect, it, vi } from 'vitest';
import { ProactiveService } from '../src/modules/ai/proactive.service.js';
import { localHour } from '../src/modules/ai/time.util.js';

function makeService() {
  const user = { findMany: vi.fn() };
  const insight = { count: vi.fn().mockResolvedValue(0) };
  const prisma = { client: { user, insight } };
  const orchestrator = {
    generateDailyBrief: vi.fn().mockResolvedValue({ id: 'insight_1', title: 'Daily brief', body: 'body' }),
    generateWeeklyReview: vi.fn().mockResolvedValue({ id: 'review_1', title: 'Weekly review', body: 'body' }),
  };
  const push = { sendToUser: vi.fn().mockResolvedValue(1) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ProactiveService(prisma as any, orchestrator as any, push as any);
  return { service, user, insight, orchestrator, push };
}

// briefHour 0 in UTC ⇒ the hour-gate is always open, isolating the eligibility logic.
const alwaysDue = (id: string) => ({ id, timezone: 'UTC', briefHour: 0 });

describe('ProactiveService.sweep', () => {
  it('generates a daily brief and weekly review for each eligible user', async () => {
    const { service, user, orchestrator, push } = makeService();
    user.findMany.mockResolvedValue([alwaysDue('u1'), alwaysDue('u2')]);

    await service.sweep();

    expect(orchestrator.generateDailyBrief).toHaveBeenCalledTimes(2);
    expect(orchestrator.generateWeeklyReview).toHaveBeenCalledTimes(2);
    // A push nudge fires for each generated insight (2 users × 2 kinds).
    expect(push.sendToUser).toHaveBeenCalledTimes(4);
  });

  it('skips a period that already has an insight', async () => {
    const { service, user, insight, orchestrator } = makeService();
    user.findMany.mockResolvedValue([alwaysDue('u1')]);
    // A daily brief already exists today; the weekly review does not.
    insight.count.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ where }: any) => Promise.resolve(where.kind === 'daily_brief' ? 1 : 0),
    );

    await service.sweep();

    expect(orchestrator.generateDailyBrief).not.toHaveBeenCalled();
    expect(orchestrator.generateWeeklyReview).toHaveBeenCalledWith('u1');
  });

  it('does nothing when no user is eligible', async () => {
    const { service, user, insight, orchestrator } = makeService();
    user.findMany.mockResolvedValue([]);

    await service.sweep();

    expect(insight.count).not.toHaveBeenCalled();
    expect(orchestrator.generateDailyBrief).not.toHaveBeenCalled();
  });

  it('respects briefHour — skips a user before their local hour', async () => {
    const nowHour = localHour('UTC', new Date());
    if (nowHour >= 23) return; // 23:xx UTC: can't set a strictly-greater hour, skip
    const { service, user, orchestrator } = makeService();
    user.findMany.mockResolvedValue([{ id: 'u1', timezone: 'UTC', briefHour: nowHour + 1 }]);

    await service.sweep();

    expect(orchestrator.generateDailyBrief).not.toHaveBeenCalled();
    expect(orchestrator.generateWeeklyReview).not.toHaveBeenCalled();
  });

  it('keeps going when one user fails, never throws', async () => {
    const { service, user, orchestrator } = makeService();
    user.findMany.mockResolvedValue([alwaysDue('u1'), alwaysDue('u2')]);
    orchestrator.generateDailyBrief
      .mockRejectedValueOnce(new Error('daily token cap reached'))
      .mockResolvedValueOnce({ id: 'insight_2' });

    await expect(service.sweep()).resolves.toBeUndefined();
    expect(orchestrator.generateDailyBrief).toHaveBeenCalledTimes(2);
  });
});
