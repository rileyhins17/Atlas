import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    GoogleApi: { ...actual.GoogleApi, status: vi.fn() },
    GoalsApi: { ...actual.GoalsApi, list: vi.fn() },
  };
});
import { GoalsApi, GoogleApi } from '@/lib/api';
import { useGoogleStatus } from '@/lib/hooks/google';
import { useGoals } from '@/lib/hooks/goals';

/**
 * A query that has not answered yet is not a query that answered "no".
 *
 * This is the bug class the Phase 6 sweep was written to find, and the sweep
 * found two live instances. Settings rendered `status?.connected ? … : 'not
 * connected'`, so anyone whose Google Calendar WAS connected opened Settings
 * and was told it was not, until the request came back. The goal picker said
 * "No active goals yet" for the same reason.
 *
 * Both are cheap to get wrong — `data ?? null` and `data ?? []` read as careful
 * defensive code — and both state something false about the user's own data.
 */
const googleStatus = GoogleApi.status as unknown as ReturnType<typeof vi.fn>;
const goalsList = GoalsApi.list as unknown as ReturnType<typeof vi.fn>;

function wrapper(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** The exact expression Settings uses for its section hint. */
function GoogleHint() {
  const google = useGoogleStatus();
  const hint = google.isSuccess
    ? google.data?.connected
      ? 'connected'
      : 'not connected'
    : undefined;
  return <span data-testid="hint">{hint ?? '—'}</span>;
}

/** The expression the goal picker uses for its empty branch. */
function GoalMenu() {
  const goals = useGoals();
  const active = (goals.data ?? []).filter((g) => g.status === 'active');
  return (
    <span data-testid="menu">
      {!goals.isSuccess ? 'Loading your goals…' : active.length === 0 ? 'No active goals yet.' : `${active.length} goals`}
    </span>
  );
}

describe('the Google Calendar hint', () => {
  it('says nothing while the answer is unknown', async () => {
    let resolve!: (value: unknown) => void;
    googleStatus.mockReturnValue(new Promise((r) => (resolve = r)));

    render(wrapper(<GoogleHint />));
    expect(screen.getByTestId('hint').textContent).toBe('—');

    resolve({ connected: true, configured: true });
    await waitFor(() => expect(screen.getByTestId('hint').textContent).toBe('connected'));
  });

  /** The regression: a connected account must never be told it is not. */
  it('never says "not connected" before the request answers', async () => {
    let resolve!: (value: unknown) => void;
    googleStatus.mockReturnValue(new Promise((r) => (resolve = r)));

    render(wrapper(<GoogleHint />));
    expect(screen.getByTestId('hint').textContent).not.toBe('not connected');

    resolve({ connected: true, configured: true });
    await waitFor(() => expect(screen.getByTestId('hint').textContent).toBe('connected'));
  });

  it('still says so once it really is not connected', async () => {
    googleStatus.mockResolvedValue({ connected: false, configured: true });
    render(wrapper(<GoogleHint />));
    await waitFor(() => expect(screen.getByTestId('hint').textContent).toBe('not connected'));
  });
});

describe('the goal picker', () => {
  it('does not claim there are no goals while it is still asking', async () => {
    let resolve!: (value: unknown) => void;
    goalsList.mockReturnValue(new Promise((r) => (resolve = r)));

    render(wrapper(<GoalMenu />));
    expect(screen.getByTestId('menu').textContent).toBe('Loading your goals…');

    resolve([{ id: 'g1', title: 'Ship it', status: 'active', horizon: 'short' }]);
    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('1 goals'));
  });

  it('says there are none when there really are none', async () => {
    goalsList.mockResolvedValue([]);
    render(wrapper(<GoalMenu />));
    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('No active goals yet.'));
  });
});
