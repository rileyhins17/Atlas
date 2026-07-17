import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AccountService } from '../src/modules/account/account.service.js';
import { hashPassword } from '../src/auth/password.util.js';

// A prisma stub where every findMany returns [] and the calls are inspectable.
function makePrisma(overrides: Record<string, unknown> = {}) {
  const findMany = vi.fn(async (_args?: unknown) => [] as unknown[]);
  const client = {
    user: {
      findUniqueOrThrow: vi.fn(async (_args?: unknown) => ({
        id: 'u1',
        email: 'a@b.com',
        displayName: null,
        timezone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findUnique: vi.fn(async (_args?: unknown) => null),
      delete: vi.fn(async (_args?: unknown) => ({ id: 'u1' })),
    },
    task: { findMany },
    event: { findMany },
    habit: { findMany },
    habitLog: { findMany },
    journalEntry: { findMany },
    note: { findMany },
    goal: { findMany },
    account: { findMany },
    transaction: { findMany },
    timelineEvent: { findMany },
    insight: { findMany },
    aiQuestion: { findMany },
    embedding: { findMany },
    credential: { findMany },
    ...overrides,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new AccountService({ client } as any), client, findMany };
}

describe('AccountService.exportData', () => {
  it('scopes every collection query to the requesting user', async () => {
    const { service, findMany } = makePrisma();
    await service.exportData('u1');
    // Every table read must carry where: { userId }.
    for (const call of findMany.mock.calls) {
      expect((call[0] as { where: { userId: string } }).where.userId).toBe('u1');
    }
  });

  it('never selects secret columns (password hash, session tokens, credential ciphertext)', async () => {
    const credentialFindMany = vi.fn(async (_args?: unknown) => [] as unknown[]);
    const { service, client } = makePrisma({ credential: { findMany: credentialFindMany } });
    await service.exportData('u1');

    // credential export must select explicit non-secret fields and NOT dataEnc.
    const credSelect = (credentialFindMany.mock.calls[0]![0] as { select: Record<string, boolean> }).select;
    expect(credSelect.dataEnc).toBeUndefined();
    expect(credSelect.connector).toBe(true);

    // user export must not pull passwordHash.
    const userSelect = (client.user.findUniqueOrThrow.mock.calls[0]![0] as { select: Record<string, boolean> })
      .select;
    expect(userSelect.passwordHash).toBeUndefined();
    expect(userSelect.email).toBe(true);

    // sessions are not part of the export at all.
    expect(client).not.toHaveProperty('session.findMany.mock');
  });

  it('produces a versioned, timestamped envelope with connections (not credentials)', async () => {
    const { service } = makePrisma();
    const out = await service.exportData('u1');
    expect(out.format).toBe('atlas.account-export.v1');
    expect(typeof out.exportedAt).toBe('string');
    expect(out).toHaveProperty('connections');
    expect(out).not.toHaveProperty('credentials');
  });
});

describe('AccountService.deleteAccount', () => {
  let stored: string;
  beforeEach(async () => {
    stored = await hashPassword('correct-horse');
  });

  it('deletes the user when the password is correct', async () => {
    const { service, client } = makePrisma({
      user: {
        findUnique: vi.fn(async (_args?: unknown) => ({ id: 'u1', passwordHash: stored })),
        delete: vi.fn(async (_args?: unknown) => ({ id: 'u1' })),
      },
    });
    await service.deleteAccount('u1', 'correct-horse');
    expect(client.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('rejects a wrong password and does NOT delete', async () => {
    const del = vi.fn(async (_args?: unknown) => ({ id: 'u1' }));
    const { service } = makePrisma({
      user: { findUnique: vi.fn(async (_args?: unknown) => ({ id: 'u1', passwordHash: stored })), delete: del },
    });
    await expect(service.deleteAccount('u1', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(del).not.toHaveBeenCalled();
  });

  it('rejects (without leaking the difference) when the user is already gone', async () => {
    const del = vi.fn(async (_args?: unknown) => ({ id: 'u1' }));
    const { service } = makePrisma({
      user: { findUnique: vi.fn(async (_args?: unknown) => null), delete: del },
    });
    await expect(service.deleteAccount('u1', 'anything')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(del).not.toHaveBeenCalled();
  });
});
