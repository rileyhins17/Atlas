import { expect, it, vi } from 'vitest';
vi.mock('../src/config/env.js', () => ({ loadEnv: () => ({ ATLAS_DEEPSEEK_API_KEY: 'synthetic-key' }) }));
import { ActivityService } from '../src/core/activity.service.js';
import { ProactiveService } from '../src/modules/ai/proactive.service.js';

it('includes active invited accounts in bounded brief eligibility after activity', async () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const activity = new ActivityService();
  const service = new ProactiveService({ client: { user: { findMany } } } as never, {} as never, {} as never, activity);
  await service.sweep();
  expect(findMany).not.toHaveBeenCalled();
  activity.mark();
  await service.sweep();
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { proactiveEnabled: true, OR: [
      { credentials: { some: { connector: 'deepseek', status: 'active' } } },
      { aiAccessGrantedAt: { not: null }, aiAccessRevokedAt: null },
    ] },
    take: 50,
  }));
});
