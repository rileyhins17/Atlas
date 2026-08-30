import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, EventsApi: { ...actual.EventsApi, shift: vi.fn() } };
});
import { EventsApi } from '@/lib/api';
import { RunningLate } from '@/components/canvas/RunningLate';
import { ToastProvider } from '@/components/ui';

/**
 * The button that pushes the rest of the day. The rules for what moves live in
 * `@atlas/shared` and are tested there; what matters here is that the control
 * sends what it says it sends, and that the UNDO sends the exact inverse — a
 * mis-tap on a schedule is otherwise unrecoverable without editing every event
 * by hand, which is the work the feature exists to avoid.
 */
const shift = EventsApi.shift as unknown as ReturnType<typeof vi.fn>;

const result = (moved: number, message = 'ok') => ({
  minutes: 30,
  moved: Array.from({ length: moved }, (_, i) => ({ id: `e${i}` })),
  skipped: [],
  message,
});

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

beforeEach(() => vi.clearAllMocks());

describe('RunningLate', () => {
  it('offers the three shifts people actually run late by', () => {
    shift.mockResolvedValue(result(0));
    wrap(<RunningLate />);
    for (const m of [15, 30, 60]) {
      expect(screen.getByRole('button', { name: `Push the rest of today ${m} minutes later` })).toBeTruthy();
    }
  });

  it('sends the minutes for the button pressed', async () => {
    const user = userEvent.setup();
    shift.mockResolvedValue(result(2));
    wrap(<RunningLate />);

    await user.click(screen.getByRole('button', { name: /30 minutes later/ }));
    // TanStack v5 hands the mutation context in as a second argument, so the
    // assertion reads the first one rather than the whole call.
    await waitFor(() => expect(shift.mock.calls[0]?.[0]).toEqual({ minutes: 30 }));
  });

  /** The server writes the sentence so the toast and the timeline cannot drift. */
  it('shows the message the server sent back', async () => {
    const user = userEvent.setup();
    shift.mockResolvedValue(result(2, 'Moved 2 things 30 minutes later, 1 left where it was.'));
    wrap(<RunningLate />);

    await user.click(screen.getByRole('button', { name: /30 minutes later/ }));
    expect(
      await screen.findByText('Moved 2 things 30 minutes later, 1 left where it was.'),
    ).toBeTruthy();
  });

  it('offers an undo that sends the exact inverse', async () => {
    const user = userEvent.setup();
    shift.mockResolvedValue(result(3));
    wrap(<RunningLate />);

    await user.click(screen.getByRole('button', { name: /60 minutes later/ }));
    const undo = await screen.findByRole('button', { name: /^Undo/ });
    await user.click(undo);

    await waitFor(() => expect(shift.mock.calls.at(-1)?.[0]).toEqual({ minutes: -60 }));
  });

  it('offers no undo when nothing actually moved', async () => {
    const user = userEvent.setup();
    shift.mockResolvedValue(result(0, 'Nothing left today to move.'));
    wrap(<RunningLate />);

    await user.click(screen.getByRole('button', { name: /30 minutes later/ }));
    await screen.findByText('Nothing left today to move.');
    // Undoing a no-op would shift the day BACKWARDS by 30 minutes, which is the
    // opposite of what the user asked for and impossible to guess from the UI.
    expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull();
  });

  it('takes the undo away once it has been used', async () => {
    const user = userEvent.setup();
    shift.mockResolvedValue(result(1));
    wrap(<RunningLate />);

    await user.click(screen.getByRole('button', { name: /15 minutes later/ }));
    await user.click(await screen.findByRole('button', { name: /^Undo/ }));
    // Otherwise a second press would undo the undo, silently re-applying the
    // shift the user had just decided against.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull());
  });
});
