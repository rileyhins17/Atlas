import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    GoogleApi: { ...actual.GoogleApi, calendars: vi.fn(), setCalendars: vi.fn() },
  };
});
import { GoogleApi } from '@/lib/api';
import { GoogleCalendarPicker } from '@/components/connectors/GoogleCalendarPicker';

/**
 * Atlas used to read `primary` and nothing else, which is wrong for almost
 * everyone: the calendars people organise their lives with are the ones they
 * made. This picker is what makes the others visible — and it is also the only
 * place in the app where saving a form DELETES events, so most of what is
 * pinned here is about saying so first.
 */
const list = GoogleApi.calendars as unknown as ReturnType<typeof vi.fn>;
const save = GoogleApi.setCalendars as unknown as ReturnType<typeof vi.fn>;

const cal = (over: Record<string, unknown>) => ({
  id: 'c@example.com',
  summary: 'A calendar',
  primary: false,
  colour: '#4285f4',
  syncing: true,
  ...over,
});

const CALENDARS = [
  cal({ id: 'me@example.com', summary: 'Riley', primary: true }),
  cal({ id: 'work@example.com', summary: 'Work' }),
  cal({ id: 'climb@example.com', summary: 'Climbing', syncing: false }),
];

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue(CALENDARS);
  save.mockResolvedValue({ removed: 0 });
});

describe('GoogleCalendarPicker', () => {
  it('lists every calendar, not just the main one', async () => {
    wrap(<GoogleCalendarPicker connected />);
    expect(await screen.findByText('Climbing')).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByText('Riley')).toBeTruthy();
  });

  it('shows what is already syncing, and what is not', async () => {
    wrap(<GoogleCalendarPicker connected />);
    await screen.findByText('Climbing');
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes[0]!.checked).toBe(true); // Riley
    expect(boxes[1]!.checked).toBe(true); // Work
    expect(boxes[2]!.checked).toBe(false); // Climbing
  });

  it('sends the new selection when saved', async () => {
    const user = userEvent.setup();
    wrap(<GoogleCalendarPicker connected />);
    await user.click(await screen.findByRole('checkbox', { name: /Climbing/i }));
    await user.click(screen.getByRole('button', { name: /Save calendars/i }));
    // TanStack v5 passes the mutation context second, so read the first arg.
    await waitFor(() =>
      expect(save.mock.calls[0]?.[0]).toEqual([
        'me@example.com',
        'work@example.com',
        'climb@example.com',
      ]),
    );
  });

  /**
   * Saving here deletes events. "2 calendars will be removed" is not enough
   * information to press that button, so the calendars are named.
   */
  it('names the calendars whose events will be removed', async () => {
    const user = userEvent.setup();
    wrap(<GoogleCalendarPicker connected />);
    await user.click(await screen.findByRole('checkbox', { name: /Work/i }));
    expect(screen.getByText(/removes the events Atlas imported from Work/i)).toBeTruthy();
  });

  it('warns about nothing when only adding', async () => {
    const user = userEvent.setup();
    wrap(<GoogleCalendarPicker connected />);
    await user.click(await screen.findByRole('checkbox', { name: /Climbing/i }));
    expect(screen.queryByText(/removes the events/i)).toBeNull();
  });

  it('cannot be saved until something changes', async () => {
    wrap(<GoogleCalendarPicker connected />);
    await screen.findByText('Climbing');
    expect(screen.getByRole('button', { name: /Save calendars/i })).toHaveProperty('disabled', true);
  });

  it('confirms the save, and says how many events went', async () => {
    save.mockResolvedValue({ removed: 12 });
    const user = userEvent.setup();
    wrap(<GoogleCalendarPicker connected />);
    await user.click(await screen.findByRole('checkbox', { name: /Work/i }));
    await user.click(screen.getByRole('button', { name: /Save calendars/i }));
    expect(await screen.findByText(/12 imported events removed/i)).toBeTruthy();
  });

  /**
   * The likeliest failure by far is an older grant: every account connected
   * before Atlas asked to read the calendar LIST has a token that cannot. A
   * retry button alone would fail identically forever.
   */
  it('explains that an old connection needs reconnecting', async () => {
    list.mockRejectedValue(new Error('403'));
    wrap(<GoogleCalendarPicker connected />);
    expect(await screen.findByText(/disconnect and connect again/i)).toBeTruthy();
  });

  /** No connection, no request — the endpoint would only 400. */
  it('asks Google nothing when there is no connection', () => {
    wrap(<GoogleCalendarPicker connected={false} />);
    expect(list).not.toHaveBeenCalled();
  });
});
