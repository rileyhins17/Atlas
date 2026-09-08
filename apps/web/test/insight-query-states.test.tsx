import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { computeAdoption, type StatsDTO } from '@atlas/shared';
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, StatsApi: { ...actual.StatsApi, get: vi.fn() }, AdminApi: { ...actual.AdminApi, adoption: vi.fn() } };
});
import { AdminApi, ApiError, StatsApi } from '@/lib/api';
import { ConnectionCard } from '@/components/stream/ConnectionCard';
import { ProgressPanel } from '@/components/panels/ProgressPanel';
import { AdminPanel } from '@/components/panels/AdminPanel';
const zero = { tasksCompleted: 0, habitChecks: 0, moodAvg: null, journalEntries: 0, spentMinor: 0, earnedMinor: 0, workouts: 0, volumeGrams: 0, events: 0 };
const empty: StatsDTO = { days: [], totals: { current: zero, previous: zero } };
function mount(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
beforeEach(() => { vi.mocked(StatsApi.get).mockReset(); vi.mocked(AdminApi.adoption).mockReset(); });

it('announces pending connections without inventing missing history', () => {
  vi.mocked(StatsApi.get).mockImplementation(() => new Promise(() => {}));
  mount(<ConnectionCard />);
  expect(screen.getByRole('status')).toHaveTextContent('Looking for connections across your days…');
  expect(screen.queryByText(/Atlas needs about two weeks/)).toBeNull();
});
it('recovers failed connections through the actual stats query', async () => {
  vi.mocked(StatsApi.get).mockRejectedValueOnce(new ApiError(503, 'Stats unavailable')).mockResolvedValue(empty);
  mount(<ConnectionCard />);
  expect(await screen.findByText('Connections could not be loaded.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText(/Atlas needs about two weeks/)).toHaveTextContent('It has 0.');
  expect(StatsApi.get).toHaveBeenCalledTimes(2);
});
it('explains a confirmed empty connection history', async () => {
  vi.mocked(StatsApi.get).mockResolvedValue(empty);
  mount(<ConnectionCard />);
  expect(await screen.findByText(/Atlas needs about two weeks/)).toHaveTextContent('It has 0.');
});
it('distinguishes sufficient history without a supported pattern', async () => {
  vi.mocked(StatsApi.get).mockResolvedValue({ ...empty, days: Array.from({ length: 30 }, (_, index) => ({ ...zero, day: `2026-08-${String(index + 1).padStart(2, '0')}`, tasksCompleted: 1, workouts: 1, moodAvg: 3 })) });
  mount(<ConnectionCard />);
  expect(await screen.findByText('No clear connections in the last 30 days.')).toBeVisible();
});

it('keeps progress pending instead of showing an empty comparison', () => {
  vi.mocked(StatsApi.get).mockImplementation(() => new Promise(() => {}));
  const view = mount(<ProgressPanel />);
  expect(view.container.querySelector('.skeleton')).not.toBeNull();
  expect(screen.queryByText('Nothing to compare yet')).toBeNull();
});
it('retries a failed progress read before showing confirmed empty history', async () => {
  vi.mocked(StatsApi.get).mockRejectedValueOnce(new ApiError(503, 'Stats unavailable')).mockResolvedValue(empty);
  mount(<ProgressPanel />);
  expect(await screen.findByText('Stats unavailable')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Nothing to compare yet')).toBeVisible();
  expect(StatsApi.get).toHaveBeenCalledTimes(2);
});
it('keeps range selection available with empty progress', async () => {
  vi.mocked(StatsApi.get).mockResolvedValue(empty);
  mount(<ProgressPanel />);
  await screen.findByText('Nothing to compare yet');
  fireEvent.click(screen.getByRole('button', { name: '90 days' }));
  expect(await screen.findByText('What changed in the last 90 days.')).toBeVisible();
  expect(StatsApi.get).toHaveBeenLastCalledWith(90);
});
it('keeps adoption pending without reporting zero accounts', () => {
  vi.mocked(AdminApi.adoption).mockImplementation(() => new Promise(() => {}));
  const view = mount(<AdminPanel />);
  expect(view.container.querySelector('.skeleton')).not.toBeNull();
  expect(screen.queryByText('Accounts')).toBeNull();
});
it('keeps an adoption read failure distinct from an empty cohort', async () => {
  vi.mocked(AdminApi.adoption).mockRejectedValueOnce(new ApiError(503, 'Adoption unavailable')).mockResolvedValue(computeAdoption([], []));
  mount(<AdminPanel />);
  expect(await screen.findByText('Adoption unavailable')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('No activity recorded yet.')).toBeVisible();
  expect(AdminApi.adoption).toHaveBeenCalledTimes(2);
});
it('shows confirmed empty adoption without fabricating percentages', async () => {
  vi.mocked(AdminApi.adoption).mockResolvedValue(computeAdoption([], []));
  mount(<AdminPanel />);
  expect(await screen.findByText('Nobody yet.')).toBeVisible();
  expect(screen.queryByText('0%')).toBeNull();
  expect(screen.getAllByText('—')).toHaveLength(5);
});
