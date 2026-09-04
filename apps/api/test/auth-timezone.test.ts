import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import { ActivityService } from '../src/core/activity.service.js';

/**
 * `User.timezone` is the one clock every day rollup buckets by, using
 * `AT TIME ZONE` in raw SQL. The web client now sends the device's zone at
 * registration, which means an attacker — or a browser with an exotic Intl
 * build — controls that string. An unparseable zone would break the user's
 * whole Progress page, so it has to be neutralised at the boundary.
 */
function makeService() {
  const create = vi.fn(async ({ data }: { data: { timezone: string } }) => ({
    id: 'u1',
    email: 'a@b.c',
    displayName: null,
    timezone: data.timezone,
  }));
  const client = {
    user: { findUnique: vi.fn().mockResolvedValue(null), create },
  };
  // A real ActivityService, unmarked: registration is a request path, not a
  // sweep, so the idle gate is irrelevant to these cases.
  return { service: new AuthService({ client } as never, new ActivityService()), create };
}

const input = (timezone: string) => ({
  email: 'a@b.c',
  password: 'password123',
  timezone,
  // The service takes the PARSED input shape, where zod has already applied
  // the default — so the fixture has to supply it exactly as the boundary does.
  remember: true,
});

describe('register: timezone', () => {
  it('stores a real IANA zone as given', async () => {
    const { service, create } = makeService();
    const user = await service.register(input('America/Toronto'));
    expect(create.mock.calls[0]![0].data.timezone).toBe('America/Toronto');
    expect(user.timezone).toBe('America/Toronto');
  });

  it('falls back to UTC for a zone Postgres could not use', async () => {
    const { service, create } = makeService();
    await service.register(input('Mars/Olympus_Mons'));
    expect(create.mock.calls[0]![0].data.timezone).toBe('UTC');
  });

  it('falls back to UTC for an injection-shaped string', async () => {
    const { service, create } = makeService();
    await service.register(input("UTC'; DROP TABLE users; --"));
    expect(create.mock.calls[0]![0].data.timezone).toBe('UTC');
  });
});
