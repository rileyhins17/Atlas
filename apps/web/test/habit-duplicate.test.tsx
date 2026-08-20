import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { HabitDTO } from '@atlas/shared';
import { HabitsPanel } from '@/components/panels/HabitsPanel';
import { HabitsApi } from '@/lib/api';

/**
 * M5: a duplicate habit name warns and never blocks. The behaviours worth
 * pinning are the three that make warn-not-block actually mean something:
 * the first submit creates NOTHING (a warning that also creates is just a
 * notification), the same submit repeated goes through (a warning you cannot
 * override is a block wearing different clothes), and editing the name clears
 * the warning (a stale warning against a name no longer in the box would
 * swallow the next legitimate submit).
 */
const habit = (id: string, name: string): HabitDTO => ({
  id,
  name,
  cadence: 'daily',
  target: 1,
  active: true,
  doneToday: false,
  todayCount: 0,
  streak: 0,
  createdAt: new Date(2026, 6, 1).toISOString(),
});

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(HabitsApi, 'list').mockResolvedValue([habit('h1', 'Gym')]);
  vi.spyOn(HabitsApi, 'history').mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function typeAndAdd(text: string) {
  const box = screen.getByLabelText('New habit name');
  await userEvent.clear(box);
  await userEvent.type(box, text);
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
}

describe('duplicate habit names', () => {
  it('warns on a case-insensitive duplicate without creating anything', async () => {
    const create = vi.spyOn(HabitsApi, 'create').mockResolvedValue(habit('h2', 'gym'));
    render(<HabitsPanel />, { wrapper: wrapper() });
    await screen.findByRole('button', { name: 'Edit habit "Gym"' });

    await typeAndAdd('gym');

    expect(await screen.findByRole('status')).toHaveTextContent(/already track/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('the same submit repeated goes through — a warning, not a block', async () => {
    const create = vi.spyOn(HabitsApi, 'create').mockResolvedValue(habit('h2', 'gym'));
    render(<HabitsPanel />, { wrapper: wrapper() });
    await screen.findByRole('button', { name: 'Edit habit "Gym"' });

    await typeAndAdd('gym');
    await screen.findByRole('status');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    // First ARG only: TanStack Query v5 hands mutationFn a second context
    // argument (client, meta, mutationKey), so exact-args matching fails on a
    // call that is otherwise perfectly correct.
    await waitFor(() => expect(create.mock.calls[0]?.[0]).toEqual({ name: 'gym' }));
    // Consumed: the warning does not linger after the deliberate second submit.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('editing the name clears the warning, and a fresh name never warns', async () => {
    const create = vi.spyOn(HabitsApi, 'create').mockResolvedValue(habit('h2', 'Read'));
    render(<HabitsPanel />, { wrapper: wrapper() });
    await screen.findByRole('button', { name: 'Edit habit "Gym"' });

    await typeAndAdd('gym');
    await screen.findByRole('status');

    // Typing again is a new question — the stale warning must not swallow it.
    await userEvent.type(screen.getByLabelText('New habit name'), 'x');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await typeAndAdd('Read');
    await waitFor(() => expect(create.mock.calls[0]?.[0]).toEqual({ name: 'Read' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
