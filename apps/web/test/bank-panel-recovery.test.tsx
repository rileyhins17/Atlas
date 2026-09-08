import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('react-plaid-link', () => ({ usePlaidLink: () => ({ open: vi.fn(), ready: false }) }));
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, PlaidApi: { ...actual.PlaidApi, status: vi.fn(), sync: vi.fn(), disconnect: vi.fn() } };
});
import { PlaidApi, type SyncResult } from '@/lib/api';
import { PlaidCard } from '@/components/panels/PlaidCard';
import { ToastProvider } from '@/components/ui';
const connected = { configured: true, connected: true, items: [{ itemId: 'synthetic', institution: 'Example bank', connectedAt: null, lastSyncedAt: null }] };
const empty = { configured: true, connected: false, items: [] };
const synced: SyncResult = { connector: 'plaid', pushed: 0, imported: 3, updated: 0, deleted: 0, errors: [] };
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ToastProvider><PlaidCard /></ToastProvider></QueryClientProvider>);
}
beforeEach(() => {
  vi.mocked(PlaidApi.status).mockReset().mockResolvedValue(connected);
  vi.mocked(PlaidApi.sync).mockReset();
  vi.mocked(PlaidApi.disconnect).mockReset();
});
it('shows loading without asserting that no bank is connected', () => {
  vi.mocked(PlaidApi.status).mockImplementation(() => new Promise<never>(() => {}));
  const view = mount();
  expect(view.container.querySelector('.skeleton')).not.toBeNull();
  expect(screen.queryByText('not connected')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Connect a bank$/ })).toBeNull();
});
it('retries failed bank status before offering a connection', async () => {
  vi.mocked(PlaidApi.status).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(empty);
  mount();
  await screen.findByText('Failed to load Plaid status');
  expect(screen.queryByRole('button', { name: /^Connect a bank$/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }));
  expect(await screen.findByRole('button', { name: /^Connect a bank$/ })).toBeEnabled();
  expect(PlaidApi.status).toHaveBeenCalledTimes(2);
});
it('explains unavailable bank connections in terms of the manual alternative', async () => {
  vi.mocked(PlaidApi.status).mockResolvedValue({ ...empty, configured: false });
  mount();
  expect(await screen.findByText('Bank connections are unavailable. You can still add accounts and transactions by hand.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Connect a bank$/ })).toBeNull();
});
it('keeps failed disconnection visible and retries the same bank', async () => {
  vi.mocked(PlaidApi.disconnect).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Bank disconnection was not confirmed. Try again.');
  expect(screen.getByText('Example bank')).toBeVisible();
  vi.mocked(PlaidApi.status).mockResolvedValue(empty);
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  await screen.findByRole('button', { name: /^Connect a bank$/ });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(PlaidApi.disconnect).toHaveBeenCalledTimes(2);
  expect(PlaidApi.disconnect).toHaveBeenLastCalledWith('synthetic');
});
it('does not leave an earlier sync result beside a failed new attempt', async () => {
  vi.mocked(PlaidApi.sync).mockResolvedValueOnce(synced).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(synced);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }));
  await screen.findByText(/Synced: 3 new/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sync failed');
  expect(screen.queryByText(/Synced: 3 new/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  expect(await screen.findByText(/Synced: 3 new/)).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
});
