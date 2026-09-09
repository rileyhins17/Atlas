import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HabitDTO } from '@atlas/shared';
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, HabitsApi: { ...actual.HabitsApi, list: vi.fn(), history: vi.fn(), create: vi.fn(), update: vi.fn() } };
});
import { HabitsApi } from '@/lib/api';
import { HabitsPanel } from '@/components/panels/HabitsPanel';
const habit: HabitDTO = { id: 'h1', name: 'Read', target: 1, cadence: 'daily', active: true, todayCount: 0, doneToday: false, streak: 0, createdAt: '2026-09-01T12:00:00Z' };
beforeEach(() => {
  vi.mocked(HabitsApi.list).mockReset().mockResolvedValue([habit]);
  vi.mocked(HabitsApi.history).mockReset().mockResolvedValue([]);
  vi.mocked(HabitsApi.create).mockReset(); vi.mocked(HabitsApi.update).mockReset();
});
async function mount(edit: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><HabitsPanel /></QueryClientProvider>);
  const open = await screen.findByRole('button', { name: 'Edit habit "Read"' });
  if (edit) fireEvent.click(open);
  const input = screen.getByRole('textbox', { name: edit ? 'Name' : 'New habit name' });
  fireEvent.change(input, { target: { value: 'Read a chapter' } });
  return { input, form: input.closest('form')! };
}
for (const edit of [false, true]) {
  it(`protects the ${edit ? 'edit' : 'new'} habit draft during saving`, async () => {
    vi.mocked(HabitsApi.create).mockImplementation(() => new Promise(() => {}));
    vi.mocked(HabitsApi.update).mockImplementation(() => new Promise(() => {}));
    const { input, form } = await mount(edit);
    fireEvent.submit(form);
    await waitFor(() => expect(input).toHaveAttribute('readonly'));
    expect(within(form).getByRole('status')).toHaveTextContent('Saving habit…');
    if (edit) {
      expect(screen.getByRole('spinbutton', { name: 'Times per day' })).toHaveAttribute('readonly');
      expect(screen.getByRole('combobox', { name: 'Cadence' })).toBeDisabled();
      expect(within(form).getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
      await userEvent.keyboard('{Escape}');
      expect(screen.getByRole('dialog')).toBeVisible();
    }
    fireEvent.submit(form);
    expect(edit ? HabitsApi.update : HabitsApi.create).toHaveBeenCalledOnce();
  });
  it(`retains the failed ${edit ? 'edit' : 'new'} habit draft and confirms a retry`, async () => {
    vi.mocked(HabitsApi.create).mockRejectedValueOnce(new Error('synthetic failure')).mockResolvedValueOnce(habit);
    vi.mocked(HabitsApi.update).mockRejectedValueOnce(new Error('synthetic failure')).mockResolvedValueOnce(habit);
    const { input, form } = await mount(edit);
    fireEvent.submit(form);
    expect(await within(form).findByRole('alert')).toHaveTextContent('Habit was not confirmed. Your draft is kept.');
    expect(input).toHaveValue('Read a chapter');
    expect(input).not.toHaveAttribute('readonly');
    fireEvent.submit(form);
    if (edit) await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    else await waitFor(() => expect(input).toHaveValue(''));
    expect(edit ? HabitsApi.update : HabitsApi.create).toHaveBeenCalledTimes(2);
  });
}
