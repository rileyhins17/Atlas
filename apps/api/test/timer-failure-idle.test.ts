import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { ActivityService } from '../src/core/activity.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { EmbeddingService } from '../src/modules/ai/embedding.service.js';
import { ProactiveService } from '../src/modules/ai/proactive.service.js';

beforeEach(() => { vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('database failures do not turn idle timers into retry loops', () => {
  it.each(['sessions', 'embeddings', 'proactive'] as const)('%s waits for new activity after a failed sweep', async kind => {
    const query = vi.fn().mockRejectedValue(new Error('synthetic database outage'));
    const prisma = { client: {
      session: { deleteMany: query }, embedding: { findMany: query }, user: { findMany: query },
    } };
    const activity = new ActivityService();
    const auth = new AuthService(prisma as never, activity);
    const embeddings = new EmbeddingService(prisma as never, {} as never, activity);
    const proactive = new ProactiveService(prisma as never, {} as never, {} as never, activity);
    const sweep = {
      sessions: () => auth.purgeExpiredSessions(),
      embeddings: () => embeddings.sweepPending(),
      proactive: () => proactive.sweep(),
    }[kind];

    activity.mark();
    await sweep();
    expect(query.mock.calls.length).toBe(1);
    for (let tick = 0; tick < 5; tick++) await sweep();
    expect(query.mock.calls.length).toBe(1);

    activity.mark();
    await sweep();
    expect(query.mock.calls.length).toBe(2);
  });
});
