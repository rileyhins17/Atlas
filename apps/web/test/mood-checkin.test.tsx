import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, JournalApi: { ...actual.JournalApi, list: vi.fn(), create: vi.fn() } };
});
import { JournalApi } from '@/lib/api';
import { MoodCheckIn } from '@/components/canvas/MoodCheckIn';
import { ToastProvider } from '@/components/ui';

/**
 * Mood is the only thing Atlas cannot derive from use. Everything else arrives
 * as a by-product; how the day FEELS has to be volunteered, and it used to cost
 * a written journal entry — which is why the mood trend usually had nothing to
 * draw.
 *
 * The prompt therefore has exactly one job and two ways to fail: asking someone
 * who already answered today, and failing to ask someone who has not.
 */
const list = JournalApi.list as unknown as ReturnType<typeof vi.fn>;
const create = JournalApi.create as unknown as ReturnType<typeof vi.fn>;

const entry = (over: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2),
  entryDate: new Date().toISOString(),
  body: '',
  mood: null,
  tags: [],
  createdAt: new Date().toISOString(),
  ...over,
});

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

const QUESTION = /How are you, right now/i;

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue(entry({ mood: 4 }));
});

describe('MoodCheckIn', () => {
  it('asks when today has no mood yet', async () => {
    list.mockResolvedValue([]);
    wrap(<MoodCheckIn />);
    expect(await screen.findByText(QUESTION)).toBeTruthy();
  });

  it('records a mood in one tap, with no body', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue([]);
    wrap(<MoodCheckIn />);
    await user.click(await screen.findByRole('button', { name: /Low — 2 out of 5/i }));
    // An empty body is the point: a mood is a legitimate entry on its own.
    // TanStack v5 passes the mutation context as a second argument, so this
    // reads the first rather than the whole call.
    await waitFor(() => expect(create.mock.calls[0]?.[0]).toEqual({ body: '', mood: 2 }));
  });

  it('does not ask twice in one day', async () => {
    list.mockResolvedValue([entry({ mood: 3, entryDate: new Date().toISOString() })]);
    wrap(<MoodCheckIn />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  /** Yesterday's answer is not today's. */
  it('asks again the next day', async () => {
    list.mockResolvedValue([entry({ mood: 3, entryDate: daysAgo(1) })]);
    wrap(<MoodCheckIn />);
    expect(await screen.findByText(QUESTION)).toBeTruthy();
  });

  /** A written entry with no mood does not count as having been asked. */
  it('still asks when today has words but no mood', async () => {
    list.mockResolvedValue([entry({ body: 'Long day.', mood: null })]);
    wrap(<MoodCheckIn />);
    expect(await screen.findByText(QUESTION)).toBeTruthy();
  });

  /**
   * Same rule as "No habits yet" on Looking back: never make a claim about the
   * user's data from a response that has not arrived. Here the claim would be
   * "you have not logged a mood", shown to someone who did an hour ago.
   */
  it('says nothing while the journal is still loading', () => {
    list.mockImplementation(() => new Promise(() => {}));
    wrap(<MoodCheckIn />);
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it('says nothing when the journal could not be loaded', async () => {
    list.mockRejectedValue(new Error('network'));
    wrap(<MoodCheckIn />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(QUESTION)).toBeNull());
  });

  it('offers all five points on the scale', async () => {
    list.mockResolvedValue([]);
    wrap(<MoodCheckIn />);
    await screen.findByText(QUESTION);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole('button', { name: new RegExp(`${n} out of 5`) })).toBeTruthy();
    }
  });
});
