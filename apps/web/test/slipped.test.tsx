import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { TaskDTO } from '@atlas/shared';
import { SlippedTasks } from '@/components/canvas/SlippedTasks';
import { TasksApi } from '@/lib/api';

/**
 * The forced, batched decision about work that did not happen. The behaviour
 * worth pinning is that BOTH answers are one tap away, that deselecting a row
 * excludes it from the batch, and that "Not now" lasts a day rather than
 * forever — a card you can silence permanently is a card that stops working.
 */
const task = (id: string, title: string): TaskDTO =>
  ({
    id,
    title,
    notes: null,
    status: 'TODO',
    priority: 'MEDIUM',
    dueAt: new Date(2026, 6, 14, 9).toISOString(),
    completedAt: null,
    tags: [],
    goalId: null,
    recurrence: null,
    recurrenceParentId: null,
    createdAt: new Date(2026, 6, 10).toISOString(),
    updatedAt: new Date(2026, 6, 10).toISOString(),
  }) as TaskDTO;

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(TasksApi, 'slipped').mockResolvedValue([
    task('t1', 'Call the bank'),
    task('t2', 'Renew the parking permit'),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SlippedTasks', () => {
  it('offers both answers for the whole set', async () => {
    const roll = vi.spyOn(TasksApi, 'rollForward').mockResolvedValue({ action: 'today', count: 2 });
    render(<SlippedTasks />, { wrapper: wrapper() });

    await screen.findByText("2 things didn't happen");
    await userEvent.click(screen.getByRole('button', { name: /Move 2 to today/i }));
    await waitFor(() => expect(roll).toHaveBeenCalledWith(['t1', 't2'], 'today'));
  });

  it('drops the whole set when that is the honest answer', async () => {
    const roll = vi.spyOn(TasksApi, 'rollForward').mockResolvedValue({ action: 'drop', count: 2 });
    render(<SlippedTasks />, { wrapper: wrapper() });

    await screen.findByText("2 things didn't happen");
    await userEvent.click(screen.getByRole('button', { name: /Not doing them/i }));
    await waitFor(() => expect(roll).toHaveBeenCalledWith(['t1', 't2'], 'drop'));
  });

  it('excludes a deselected task from the batch', async () => {
    const roll = vi.spyOn(TasksApi, 'rollForward').mockResolvedValue({ action: 'today', count: 1 });
    render(<SlippedTasks />, { wrapper: wrapper() });

    await screen.findByText("2 things didn't happen");
    await userEvent.click(screen.getAllByRole('checkbox')[0]!);
    await userEvent.click(screen.getByRole('button', { name: /Move 1 to today/i }));
    await waitFor(() => expect(roll).toHaveBeenCalledWith(['t2'], 'today'));
  });

  it('clears deselections after acting, so what is left is a fresh decision', async () => {
    vi.spyOn(TasksApi, 'rollForward').mockResolvedValue({ action: 'today', count: 1 });
    render(<SlippedTasks />, { wrapper: wrapper() });

    await screen.findByText("2 things didn't happen");
    await userEvent.click(screen.getAllByRole('checkbox')[0]!);
    await userEvent.click(screen.getByRole('button', { name: /Move 1 to today/i }));

    // Left unchecked, the task deliberately skipped would come back still
    // deselected — leaving both buttons disabled with nothing explaining why.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Move 2 to today/i })).toBeEnabled(),
    );
  });

  it('says nothing at all when nothing slipped', async () => {
    vi.spyOn(TasksApi, 'slipped').mockResolvedValue([]);
    const { container } = render(<SlippedTasks />, { wrapper: wrapper() });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('"Not now" hides it for today only, not for good', async () => {
    render(<SlippedTasks />, { wrapper: wrapper() });
    await screen.findByText("2 things didn't happen");
    await userEvent.click(screen.getByRole('button', { name: /Not now/i }));
    expect(screen.queryByText("2 things didn't happen")).toBeNull();

    // Stamped with today's date, so tomorrow's render asks again.
    const stamped = window.localStorage.getItem('atlas.slipped.dismissed');
    expect(stamped).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    window.localStorage.setItem('atlas.slipped.dismissed', '2020-01-01');
    render(<SlippedTasks />, { wrapper: wrapper() });
    expect(await screen.findAllByText("2 things didn't happen")).not.toHaveLength(0);
  });
});
