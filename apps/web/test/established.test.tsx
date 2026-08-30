import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    TasksApi: { ...actual.TasksApi, list: vi.fn() },
    EventsApi: { ...actual.EventsApi, list: vi.fn() },
  };
});
import { EventsApi, TasksApi } from '@/lib/api';
import { ESTABLISHED_KEY, useEstablished } from '@/lib/hooks/established';

/**
 * Onboarding copy earns its place on day one and becomes furniture by day
 * thirty. `.promise` sat above the fold on Today unconditionally — a sentence
 * you have read four hundred times, charging rent on the part of the screen you
 * opened the app to see.
 *
 * The risk in retiring it is the opposite mistake: flashing beginner copy at a
 * long-standing user, or re-teaching someone who cleared their task list. Both
 * are tested here, because both read as the app forgetting who you are.
 */
const tasksList = TasksApi.list as unknown as ReturnType<typeof vi.fn>;
const eventsList = EventsApi.list as unknown as ReturnType<typeof vi.fn>;

function Probe() {
  return <span data-testid="v">{String(useEstablished())}</span>;
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const value = () => screen.getByTestId('v').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  tasksList.mockResolvedValue([]);
  eventsList.mockResolvedValue([]);
});

describe('useEstablished', () => {
  it('treats a genuinely new account as new', async () => {
    wrap(<Probe />);
    await waitFor(() => expect(value()).toBe('false'));
  });

  it('treats an account with tasks as established', async () => {
    tasksList.mockResolvedValue([{ id: 't1', title: 'Something' }]);
    wrap(<Probe />);
    await waitFor(() => expect(value()).toBe('true'));
  });

  it('treats an account with only events as established', async () => {
    eventsList.mockResolvedValue([{ id: 'e1', title: 'Standup' }]);
    wrap(<Probe />);
    await waitFor(() => expect(value()).toBe('true'));
  });

  /**
   * The flash this exists to prevent: localStorage cannot be read during SSR,
   * so guessing "new" would show beginner copy to a long-standing user on every
   * cold load, for one paint, forever.
   */
  it('assumes established until the answer is actually known', () => {
    tasksList.mockReturnValue(new Promise(() => {}));
    eventsList.mockReturnValue(new Promise(() => {}));
    wrap(<Probe />);
    expect(value()).toBe('true');
  });

  it('stays established after the data is cleared again', async () => {
    localStorage.setItem(ESTABLISHED_KEY, '1');
    wrap(<Probe />);
    // Emptying your task list for the afternoon does not make you a new user,
    // and re-teaching the premise would read as the app forgetting you.
    await waitFor(() => expect(value()).toBe('true'));
  });

  it('remembers, so the next cold load never re-teaches', async () => {
    tasksList.mockResolvedValue([{ id: 't1', title: 'Something' }]);
    wrap(<Probe />);
    await waitFor(() => expect(localStorage.getItem(ESTABLISHED_KEY)).toBe('1'));
  });

  it('falls back to the live signal when storage is unavailable', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    try {
      wrap(<Probe />);
      // No latch to read, so a new account is still correctly seen as new.
      await waitFor(() => expect(value()).toBe('false'));
    } finally {
      getItem.mockRestore();
    }
  });
});
