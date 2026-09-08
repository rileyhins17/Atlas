import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { GoalsService } from '../src/modules/goals/goals.service.js';
import { RoutineService } from '../src/modules/routine/routine.service.js';
import { MemoryService } from '../src/core/memory.service.js';
import { FitnessService } from '../src/modules/fitness/fitness.service.js';

/**
 * Anything a user — or the model — can create in a loop needs a ceiling.
 *
 * Every list in this app is read whole by something: the picker reads every
 * exercise, `/ai/questions` reads every open question, and the routine is fed
 * back into the AI's own context on the next call. Without a cap the cost of
 * each of those grows with use and never comes back down.
 */
const timeline = () => ({ write: vi.fn(async () => {}) });
const timezones = () => ({ get: async () => 'America/Toronto', prime() {}, forget() {} });

describe('goals', () => {
  /**
   * A quota is not a missing thing. This threw `NotFoundException`, so the UI
   * told people their goal could not be FOUND when the real answer was that
   * they already had a hundred.
   */
  it('refuses past the cap with 400 and says what the limit is', async () => {
    const prisma = {
      client: {
        goal: { count: vi.fn(async () => 100), create: vi.fn() },
      },
    };
    const service = new GoalsService(prisma as never, timeline() as never, { get: async () => 'UTC' } as never);
    await expect(service.create('u1', { title: 'One more' } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create('u1', { title: 'One more' } as never)).rejects.toThrow(/100 goals/);
    expect(prisma.client.goal.create).not.toHaveBeenCalled();
  });

  it('allows one below the cap', async () => {
    const prisma = {
      client: {
        goal: {
          count: vi.fn(async () => 99),
          create: vi.fn(async () => ({
            id: 'g1',
            title: 'Fine',
            horizon: 'short',
            status: 'active',
            position: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            targetDate: null,
            notes: null,
          })),
        },
      },
    };
    const service = new GoalsService(prisma as never, timeline() as never, { get: async () => 'UTC' } as never);
    await service.create('u1', { title: 'Fine' } as never);
    expect(prisma.client.goal.create).toHaveBeenCalled();
  });
});

describe('routine blocks', () => {
  /**
   * This one matters more than a typical quota: `routine.add_block` is a tool
   * the MODEL can call, and the routine is part of the context the model is
   * handed on the next call. Uncapped, a chatty brain-dump inflates its own
   * future context, which costs tokens on every request afterwards.
   */
  it('refuses past the cap rather than letting the AI grow its own context', async () => {
    const prisma = {
      client: { routineBlock: { count: vi.fn(async () => 200), create: vi.fn() } },
    };
    const service = new RoutineService(prisma as never, timezones() as never);
    await expect(
      service.addBlock('u1', { label: 'Another', kind: 'work', days: 1, startMin: 0, endMin: 60 } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.routineBlock.create).not.toHaveBeenCalled();
  });
});

describe('AI questions', () => {
  const make = (openCount: number) => {
    const create = vi.fn(async () => ({}));
    const prisma = {
      client: {
        aiQuestion: {
          findFirst: vi.fn(async () => null),
          count: vi.fn(async () => openCount),
          create,
        },
      },
    };
    return { service: new MemoryService(prisma as never), create };
  };

  /** Nothing forces anyone to answer these, and the model writes a new one
   *  every brief. An unanswered backlog is a wall, not a prompt. */
  it('stops asking once the unanswered pile is deep enough', async () => {
    const { service, create } = make(20);
    await service.askUser({ userId: 'u1', question: 'One more?' });
    expect(create).not.toHaveBeenCalled();
  });

  it('still asks below the cap', async () => {
    const { service, create } = make(19);
    await service.askUser({ userId: 'u1', question: 'A fair question' });
    expect(create).toHaveBeenCalled();
  });

  /** Declining to ask is not an error — the caller is a background brief. */
  it('returns quietly rather than throwing at the cap', async () => {
    const { service } = make(50);
    await expect(service.askUser({ userId: 'u1', question: 'Quiet' })).resolves.toBeUndefined();
  });
});

describe('custom exercises', () => {
  const make = (count: number) => {
    const create = vi.fn(async () => ({}));
    const prisma = {
      client: {
        exercise: { findFirst: vi.fn(async () => null), count: vi.fn(async () => count), create },
      },
    };
    return { service: new FitnessService(prisma as never, timeline() as never, { get: async () => 'UTC' } as never), create };
  };

  it('refuses past the cap, because the picker reads all of them on every open', async () => {
    const { service, create } = make(200);
    await expect(
      service.createExercise('u1', { name: 'Yet another', muscle: 'other', kind: 'weight_reps' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('allows one below the cap', async () => {
    const { service, create } = make(199);
    await service
      .createExercise('u1', { name: 'Fine', muscle: 'other', kind: 'weight_reps' } as never)
      .catch(() => undefined);
    expect(create).toHaveBeenCalled();
  });
});
