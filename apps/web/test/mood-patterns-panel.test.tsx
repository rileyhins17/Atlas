import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, StatsApi: { ...actual.StatsApi, patterns: vi.fn() } };
});
import { StatsApi } from '@/lib/api';
import { MoodPatterns } from '@/components/progress/MoodPatterns';

/**
 * The feature most able to embarrass Atlas. Every test here is about what it
 * refuses to say — a confident claim about why someone feels bad, made from a
 * fortnight of counting, is worse than no feature at all.
 */
const patterns = StatsApi.patterns as unknown as ReturnType<typeof vi.fn>;

const line = (over: Record<string, unknown> = {}) => ({
  factor: 'trained',
  line: 'On the 10 days you trained, your mood averaged 4.2 — against 3.1 on the other 11.',
  withMean: 4.2,
  withoutMean: 3.1,
  withDays: 10,
  withoutDays: 11,
  delta: 1.1,
  ...over,
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const HEADING = /What your better days have in common/i;

beforeEach(() => vi.clearAllMocks());

describe('MoodPatterns', () => {
  it('shows the observation once there is one', async () => {
    patterns.mockResolvedValue({ daysLogged: 21, daysNeeded: 14, patterns: [line()] });
    wrap(<MoodPatterns />);
    expect(await screen.findByText(/On the 10 days you trained/)).toBeTruthy();
  });

  /**
   * The check-in on Today is already asking. A second nudge on Looking back,
   * to someone who has logged nothing, is nagging.
   */
  it('says nothing at all before the first mood is logged', async () => {
    patterns.mockResolvedValue({ daysLogged: 0, daysNeeded: 14, patterns: [] });
    wrap(<MoodPatterns />);
    await waitFor(() => expect(patterns).toHaveBeenCalled());
    expect(screen.queryByText(HEADING)).toBeNull();
  });

  /** Under the threshold it explains the wait — that is what the daily tap buys. */
  it('says how far off it is while there is not enough history', async () => {
    patterns.mockResolvedValue({ daysLogged: 6, daysNeeded: 14, patterns: [] });
    wrap(<MoodPatterns />);
    expect(await screen.findByText(/6 of 14 days logged/)).toBeTruthy();
  });

  /** "Nothing correlates" is a real answer, not an empty state. */
  it('says plainly when enough history turns up nothing', async () => {
    patterns.mockResolvedValue({ daysLogged: 40, daysNeeded: 14, patterns: [] });
    wrap(<MoodPatterns />);
    expect(await screen.findByText(/Nothing stands out/)).toBeTruthy();
  });

  it('disclaims causation whenever it reports anything', async () => {
    patterns.mockResolvedValue({ daysLogged: 21, daysNeeded: 14, patterns: [line()] });
    wrap(<MoodPatterns />);
    expect(await screen.findByText(/counts, not causes/i)).toBeTruthy();
  });

  /** A page of correlations is a horoscope. */
  it('shows at most three', async () => {
    patterns.mockResolvedValue({
      daysLogged: 60,
      daysNeeded: 14,
      patterns: [
        line({ factor: 'a', line: 'Pattern A.' }),
        line({ factor: 'b', line: 'Pattern B.' }),
        line({ factor: 'c', line: 'Pattern C.' }),
        line({ factor: 'd', line: 'Pattern D.' }),
      ],
    });
    wrap(<MoodPatterns />);
    expect(await screen.findByText('Pattern A.')).toBeTruthy();
    expect(screen.queryByText('Pattern D.')).toBeNull();
  });

  it('says nothing while the answer is still loading', () => {
    patterns.mockImplementation(() => new Promise(() => {}));
    wrap(<MoodPatterns />);
    expect(screen.queryByText(HEADING)).toBeNull();
  });

  it('says nothing when the answer could not be loaded', async () => {
    patterns.mockRejectedValue(new Error('network'));
    wrap(<MoodPatterns />);
    await waitFor(() => expect(patterns).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(HEADING)).toBeNull());
  });
});
