import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, GoogleApi: { ...actual.GoogleApi, status: vi.fn() } };
});
import { GoogleApi, ApiError } from '@/lib/api';
import { ToastProvider } from '@/components/ui';
import { GoogleCalendarCard } from '@/components/connectors/GoogleCalendarCard';

const disconnected = { configured: true, connected: false };
function mount(mode: 'inline' | 'compact' | 'full', cached?: typeof disconnected) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cached) client.setQueryData(['google', 'status'], cached);
  return render(<ToastProvider><QueryClientProvider client={client}><GoogleCalendarCard inline={mode === 'inline'} compact={mode === 'compact'} /></QueryClientProvider></ToastProvider>);
}
beforeEach(() => { vi.mocked(GoogleApi.status).mockReset(); });
it('announces the inline connection read before offering setup', () => {
  vi.mocked(GoogleApi.status).mockImplementation(() => new Promise(() => {}));
  mount('inline');
  expect(screen.getByRole('status')).toHaveTextContent('Checking Google Calendar connection…');
  expect(screen.queryByRole('button', { name: /Connect/ })).toBeNull();
});
it.each(['inline', 'compact', 'full'] as const)('recovers a failed %s status read without claiming disconnection', async (mode) => {
  vi.mocked(GoogleApi.status).mockRejectedValueOnce(new ApiError(503, 'Connection read failed')).mockResolvedValue(disconnected);
  mount(mode);
  expect(await screen.findByText('Connection read failed')).toBeVisible();
  expect(screen.queryByText('not connected')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: /Connect Google Calendar/ })).toBeVisible();
  expect(GoogleApi.status).toHaveBeenCalledTimes(2);
});
it.each(['inline', 'compact'] as const)('does not hide a failed %s refresh behind cached unavailable configuration', async (mode) => {
  vi.mocked(GoogleApi.status).mockRejectedValue(new ApiError(503, 'Connection refresh failed'));
  mount(mode, { ...disconnected, configured: false });
  expect(await screen.findByText('Connection refresh failed')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
});
