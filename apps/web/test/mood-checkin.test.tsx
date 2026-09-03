import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    JournalApi: { ...actual.JournalApi, list: vi.fn(), create: vi.fn() },
    RoutineApi: { ...actual.RoutineApi, list: vi.fn() },
  };
});
import { JournalApi, RoutineApi } from '@/lib/api';
import { MoodCheckIn } from '@/components/canvas/MoodCheckIn';
import { ToastProvider } from '@/components/ui';

/**
 * Mood is the only thing Atlas cannot derive from use. Everything else arrives
 * as a by-product; how the day FEELS has to be volunteered.
 *
 * It is asked TWICE — shortly after waking and shortly before bed — because one
 * reading tells you how a day went and two bracket it: the difference between
 * them is caused by the hours in between, which is the comparison Looking back
 * is built on. So the failures worth pinning are asking outside those windows,
 * asking someone who already answered THIS window, and — the one that would
 * quietly destroy the feature — letting the morning answer silence the evening.
 */
const list = JournalApi.list as unknown as ReturnType<typeof vi.fn>;
const create = JournalApi.create as unknown as ReturnType<typeof vi.fn>;
const routine = RoutineApi.list as unknown as ReturnType<typeof vi.fn>;

/** Asleep 23:00 → 07:00, every day. */
const SLEEP = [
  { id: 'r1', label: 'Sleep', kind: 'sleep', days: 127, onDate: null, startMin: 23 * 60, endMin: 7 * 60 },
];

/** Freeze the clock at a local hour today, so windows are deterministic. */
function atLocalHour(h: number, m = 0) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  vi.setSystemTime(d);
  return d;
}

/** A mood entry logged at a local time today. */
const moodAt = (h: number, mood = 3) => {
  const d = new Date();
  d.setHours(h, 30, 0, 0);
  return {
    id: Math.random().toString(36).slice(2),
    entryDate: d.toISOString(),
    body: '',
    mood,
    tags: [],
    createdAt: d.toISOString(),
  };
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

const MORNING = /How did you wake up/i;
const EVENING = /How are you ending the day/i;
const ANY = /How did you wake up|How are you ending the day/i;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  create.mockResolvedValue(moodAt(8, 4));
  routine.mockResolvedValue(SLEEP);
  list.mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe('MoodCheckIn', () => {
  it('asks in the morning, once you are awake', async () => {
    atLocalHour(7, 20);
    wrap(<MoodCheckIn />);
    expect(await screen.findByText(MORNING)).toBeTruthy();
  });

  it('asks again in the evening, before bed', async () => {
    atLocalHour(22, 30);
    wrap(<MoodCheckIn />);
    expect(await screen.findByText(EVENING)).toBeTruthy();
  });

  /** The middle of the day is not a moment Atlas has anything to ask about. */
  it('says nothing at all in between', async () => {
    atLocalHour(14);
    wrap(<MoodCheckIn />);
    await waitFor(() => expect(routine).toHaveBeenCalled());
    expect(screen.queryByText(ANY)).toBeNull();
  });

  it('records a mood in one tap, with no body', async () => {
    atLocalHour(7, 20);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    wrap(<MoodCheckIn />);
    await user.click(await screen.findByRole('button', { name: /Low — 2 out of 5/i }));
    // An empty body is the point: a mood is a legitimate entry on its own.
    // TanStack v5 passes the mutation context as a second argument, so this
    // reads the first rather than the whole call.
    await waitFor(() => expect(create.mock.calls[0]?.[0]).toEqual({ body: '', mood: 2 }));
  });

  it('does not ask twice within one window', async () => {
    atLocalHour(7, 45);
    list.mockResolvedValue([moodAt(7)]);
    wrap(<MoodCheckIn />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.queryByText(ANY)).toBeNull();
  });

  /**
   * The one that would quietly destroy the feature. Answering at breakfast must
   * not stand in for answering at bedtime — two readings is the entire point,
   * and a single one cannot separate "today was hard" from "I woke up like this".
   */
  it('still asks in the evening after a morning answer', async () => {
    atLocalHour(22, 30);
    list.mockResolvedValue([moodAt(7)]);
    wrap(<MoodCheckIn />);
    expect(await screen.findByText(EVENING)).toBeTruthy();
  });

  it('does not re-ask in the evening once the evening is answered', async () => {
    atLocalHour(22, 45);
    list.mockResolvedValue([moodAt(7), moodAt(22)]);
    wrap(<MoodCheckIn />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.queryByText(ANY)).toBeNull();
  });

  /** A written entry with no mood does not count as having been asked. */
  it('still asks when today has words but no mood', async () => {
    atLocalHour(7, 20);
    list.mockResolvedValue([{ ...moodAt(7), mood: null, body: 'Long day.' }]);
    wrap(<MoodCheckIn />);
    expect(await screen.findByText(MORNING)).toBeTruthy();
  });

  /** The times are the USER'S. A night shift is why this reads the routine. */
  it('follows a night shift rather than the clock', async () => {
    atLocalHour(17, 30);
    routine.mockResolvedValue([{ ...SLEEP[0], startMin: 9 * 60, endMin: 17 * 60 }]);
    wrap(<MoodCheckIn />);
    expect(await screen.findByText(MORNING)).toBeTruthy();
  });

  it('falls back to ordinary hours, and offers to be told the real ones', async () => {
    atLocalHour(7, 20);
    routine.mockResolvedValue([]);
    wrap(<MoodCheckIn />);
    expect(await screen.findByText(MORNING)).toBeTruthy();
    expect(screen.getByText(/Set your sleep hours in Settings/i)).toBeTruthy();
  });

  /** The pair is the point, so the prompt says so rather than looking like a nag. */
  it('explains that the two readings are what get compared', async () => {
    atLocalHour(7, 20);
    wrap(<MoodCheckIn />);
    await screen.findByText(MORNING);
    expect(screen.getByText(/Tonight Atlas asks again/i)).toBeTruthy();
  });

  /** Being corrected while doing the thing correctly is a strange reward. */
  it('mentions the better hour only once you are past it', async () => {
    atLocalHour(9, 30);
    wrap(<MoodCheckIn />);
    await screen.findByText(MORNING);
    expect(screen.getByText(/Best in the first hour after you wake/i)).toBeTruthy();
  });

  /**
   * Same rule as "No habits yet" on Looking back: never make a claim about the
   * user's data from a response that has not arrived. Here the claim would be
   * "you have not logged a mood", shown to someone who did an hour ago.
   */
  it('says nothing while the journal is still loading', () => {
    atLocalHour(7, 20);
    list.mockImplementation(() => new Promise(() => {}));
    wrap(<MoodCheckIn />);
    expect(screen.queryByText(ANY)).toBeNull();
  });

  /** And nothing while the routine is unknown — the times would be a guess. */
  it('says nothing while the routine is still loading', () => {
    atLocalHour(7, 20);
    routine.mockImplementation(() => new Promise(() => {}));
    wrap(<MoodCheckIn />);
    expect(screen.queryByText(ANY)).toBeNull();
  });

  it('says nothing when the journal could not be loaded', async () => {
    atLocalHour(7, 20);
    list.mockRejectedValue(new Error('network'));
    wrap(<MoodCheckIn />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(ANY)).toBeNull());
  });

  it('offers all five points on the scale', async () => {
    atLocalHour(7, 20);
    wrap(<MoodCheckIn />);
    await screen.findByText(MORNING);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole('button', { name: new RegExp(`${n} out of 5`) })).toBeTruthy();
    }
  });
});
