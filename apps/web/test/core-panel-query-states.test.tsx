import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('@/components/connectors/GoogleCalendarCard', () => ({ GoogleCalendarCard: () => null }));
vi.mock('@/components/panels/PlaidCard', () => ({ PlaidCard: () => null }));
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual,
    EventsApi: { ...actual.EventsApi, list: vi.fn() },
    FinanceApi: { ...actual.FinanceApi, accounts: vi.fn(), transactions: vi.fn() },
    RoutineApi: { ...actual.RoutineApi, list: vi.fn() },
    JournalApi: { ...actual.JournalApi, list: vi.fn() },
    NotesApi: { ...actual.NotesApi, list: vi.fn() },
  };
});
import { EventsApi, FinanceApi, RoutineApi, JournalApi, NotesApi } from '@/lib/api';
import { CalendarPanel } from '@/components/panels/CalendarPanel';
import { FinancePanel } from '@/components/panels/FinancePanel';
import { RoutineEditor } from '@/components/panels/RoutineEditor';
import { WritingPanel } from '@/components/panels/WritingPanel';
import { ToastProvider } from '@/components/ui';
function mount(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
}
const cases = [
  { name: 'calendar', ui: () => <CalendarPanel />, api: EventsApi.list, empty: /Nothing on this day/, error: 'Failed to load events' },
  { name: 'routine', ui: () => <RoutineEditor />, api: RoutineApi.list, empty: /Nothing set yet/, error: 'Failed to load your week' },
  { name: 'accounts', ui: () => <FinancePanel />, api: FinanceApi.accounts, empty: /No accounts yet/, error: 'Failed to load accounts' },
  { name: 'transactions', ui: () => <FinancePanel />, api: FinanceApi.transactions, empty: /^No transactions$/, error: 'Failed to load transactions' },
  { name: 'journal', ui: () => <WritingPanel />, api: JournalApi.list, empty: /Nothing written yet/, error: 'Failed to load your writing' },
  { name: 'notes', ui: () => <WritingPanel />, api: NotesApi.list, empty: /Nothing written yet/, error: 'Failed to load your writing' },
];
beforeEach(() => {
  for (const entry of cases) vi.mocked(entry.api).mockReset().mockResolvedValue([]);
});
for (const entry of cases) {
  it(`${entry.name} shows a real loading placeholder without claiming empty data`, async () => {
    vi.mocked(entry.api).mockImplementation(() => new Promise<never>(() => {}));
    const view = mount(entry.ui());
    await waitFor(() => expect(view.container.querySelector('.skeleton')).not.toBeNull());
    expect(screen.queryByText(entry.empty)).toBeNull();
    if (entry.name === 'accounts') expect(screen.getByRole('button', { name: 'Add transaction' })).toBeDisabled();
  });
  it(`${entry.name} distinguishes failure from empty and retries its read`, async () => {
    vi.mocked(entry.api).mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    mount(entry.ui());
    await screen.findByText(entry.error);
    expect(screen.queryByText(entry.empty)).toBeNull();
    if (entry.name === 'accounts') expect(screen.getByRole('button', { name: 'Add transaction' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }));
    expect(await screen.findByText(entry.empty)).toBeVisible();
    expect(entry.api).toHaveBeenCalledTimes(2);
  });
}
for (const entry of [cases[0], cases[1], cases[2], cases[4]]) {
  it(`${entry.name} has a confirmed empty state`, async () => {
    const view = mount(entry.ui());
    expect(await screen.findByText(entry.empty)).toBeVisible();
    expect(view.container.querySelector('.skeleton')).toBeNull();
    if (entry.name === 'accounts') expect(screen.getByText('No transactions')).toBeVisible();
  });
}
it('keeps confirmed notes visible when journal history fails', async () => {
  vi.mocked(JournalApi.list).mockRejectedValue(new Error('offline'));
  vi.mocked(NotesApi.list).mockResolvedValue([{ id: 'note', title: 'Saved context', body: 'Keep this confirmed note visible.', pinned: true, tags: [], createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' }]);
  const view = mount(<WritingPanel />);
  await screen.findByText('Failed to load your writing');
  expect(view.container.querySelector('.wr-list')).toHaveTextContent('Keep this confirmed note visible.');
  expect(screen.queryByText('Nothing written yet')).toBeNull();
});
