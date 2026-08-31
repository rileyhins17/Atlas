import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    HabitsApi: { ...actual.HabitsApi, list: vi.fn(), history: vi.fn() },
  };
});
import { HabitsApi } from '@/lib/api';
import { HabitConsistency } from '@/components/progress/HabitConsistency';

/**
 * "No habits yet" is a claim about the user's life. It was being made from
 * `habits.data ?? []` — an empty array standing in for a question that had not
 * been answered yet.
 *
 * On Looking back that produced a page contradicting itself: the summary tiles
 * read from the stats rollup, which resolves first, so a real screenshot showed
 * "3% of days with a habit" directly above "No habits yet". Someone with three
 * habits was told they had none.
 *
 * It also hides from the suite's stuck-loading tripwire, because it renders
 * confident prose while loading rather than a skeleton. Only a test that
 * distinguishes "pending" from "empty" catches it.
 */
const list = HabitsApi.list as unknown as ReturnType<typeof vi.fn>;
const history = HabitsApi.history as unknown as ReturnType<typeof vi.fn>;

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const NO_HABITS = /No habits yet/i;

beforeEach(() => {
  vi.clearAllMocks();
  history.mockResolvedValue([]);
});

describe('HabitConsistency empty states', () => {
  it('does not say you have no habits while it is still asking', () => {
    list.mockImplementation(() => new Promise(() => {}));
    wrap(<HabitConsistency days={30} />);
    expect(screen.queryByText(NO_HABITS)).toBeNull();
  });

  it('says it only once the server has actually said none', async () => {
    list.mockResolvedValue([]);
    wrap(<HabitConsistency days={30} />);
    expect(await screen.findByText(NO_HABITS)).toBeTruthy();
  });

  it('never says it to someone who has habits', async () => {
    list.mockResolvedValue([
      { id: 'h1', name: 'Gym', target: 1, streak: 1, todayCount: 1 },
      { id: 'h2', name: 'Read', target: 1, streak: 0, todayCount: 0 },
    ]);
    wrap(<HabitConsistency days={30} />);
    await waitFor(() => expect(screen.getByText('Gym')).toBeTruthy());
    expect(screen.queryByText(NO_HABITS)).toBeNull();
  });

  /**
   * A failed request is not an empty life either. It must not resolve into a
   * confident statement about the user's data.
   */
  it('does not turn a failed request into "you have none"', async () => {
    list.mockRejectedValue(new Error('network'));
    wrap(<HabitConsistency days={30} />);
    // Asserted POSITIVELY. Waiting only for the request to have been made and
    // then checking the sentence is absent passes before the rejection has even
    // reached the component — the test would have gone green against the bug.
    expect(await screen.findByText(/Could not load your habits/i)).toBeTruthy();
    expect(screen.queryByText(NO_HABITS)).toBeNull();
  });
});
