import { expect, it, vi } from 'vitest';
vi.mock('../src/config/env.js', () => ({ loadEnv: () => ({ AI_MODEL: 'synthetic-model', AI_DAILY_TOKEN_CAP: 1000 }) }));
import { AiController } from '../src/modules/ai/ai.controller.js';

it('reports only the signed-in member usage against their allowance', async () => {
  const tokensUsedToday = vi.fn(async (id?: string) => id === 'member' ? 70 : 990);
  const controller = new AiController(
    { list: () => [] } as never,
    { deepseek: { verify: async () => true }, contextFor: () => ({}) } as never,
    { enabled: true, tokensUsedToday } as never,
    {} as never, {} as never, {} as never,
  );
  const result = await controller.status({ id: 'member', email: 'member@example.test', displayName: null, timezone: 'America/Toronto' });
  expect(result.tokensUsedToday).toBe(70);
  expect(tokensUsedToday).toHaveBeenCalledWith('member');
});
