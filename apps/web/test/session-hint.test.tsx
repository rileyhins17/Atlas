import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, AuthApi: { ...actual.AuthApi, me: vi.fn(), logout: vi.fn() } };
});
import { ApiError, AuthApi } from '@/lib/api';
import { useMe } from '@/lib/hooks/auth';
import { hasSignedInBefore, markSignedIn } from '@/lib/session-hint';

/**
 * A returning user waited ~900ms on a centred "Waking Atlas…" splash while
 * `/auth/me` answered, because the session lives in an httpOnly cookie the app
 * cannot read. This hint is the one thing that CAN be known locally, so the
 * shell can draw their app instead of a splash.
 *
 * IT IS NOT AUTHENTICATION and the tests that matter are the ones proving it is
 * never treated as any: it grants nothing, and it must stop claiming a session
 * the moment the server says otherwise.
 */
const me = AuthApi.me as unknown as ReturnType<typeof vi.fn>;

function Probe() {
  const q = useMe();
  return <span data-testid="v">{q.isPending ? 'pending' : q.data ? 'user' : 'anon'}</span>;
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('session hint', () => {
  it('is false for a browser that has never signed in', () => {
    expect(hasSignedInBefore()).toBe(false);
  });

  it('is set once a session actually resolves', async () => {
    me.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('user'));
    // Set from /auth/me, not only from sign-in: a session that predates this
    // would otherwise never get the fast path despite being perfectly valid.
    expect(hasSignedInBefore()).toBe(true);
  });

  /**
   * The one that keeps it honest. A stale hint would draw the app frame on
   * every load and then drop the user on the sign-in screen, every time.
   */
  it('is cleared when the server rejects the cookie', async () => {
    markSignedIn();
    me.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('anon'));
    expect(hasSignedInBefore()).toBe(false);
  });

  /**
   * A network blip is not a sign-out. Clearing here would punish a flaky
   * connection by making the next load look like a first visit — and this repo
   * already has a spec about never mistaking an established account for a new
   * one.
   */
  it('survives a failure that is not a rejection', async () => {
    markSignedIn();
    me.mockRejectedValue(new ApiError(500, 'Server error'));
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).not.toBe('pending'));
    expect(hasSignedInBefore()).toBe(true);
  });

  it('reports false rather than throwing when storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    try {
      // Private browsing falls back to the splash everyone used to get.
      expect(hasSignedInBefore()).toBe(false);
    } finally {
      getItem.mockRestore();
    }
  });

  it('grants nothing on its own', async () => {
    markSignedIn();
    me.mockResolvedValue(null);
    wrap(<Probe />);
    // The hint says "this browser had a session". Only the server says whether
    // there is one now, and the app follows the server.
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('anon'));
  });
});
