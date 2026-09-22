import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { WearableDayDTO, WearablesStatusDTO, WearablesSummaryDTO } from '@atlas/shared';
import { BodyCard, WatchActivityCard } from '@/components/wearables/WatchCards';
import { WearablesApi } from '@/lib/api';
import { localDayKey } from '@/lib/dates';

/**
 * The watch cards live on the main screen, so what they must NOT do matters
 * as much as what they show: no box at all for someone without a watch, no
 * "0 hours" for a night the watch was off, and a calm reconnect line — not an
 * error — when Google expires the grant.
 */
function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const status = (over: Partial<WearablesStatusDTO>): WearablesStatusDTO => ({
  configured: true,
  connected: true,
  needsReconnect: false,
  lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...over,
});

const day = (dayKey: string, over: Partial<WearableDayDTO> = {}): WearableDayDTO => ({
  dayKey,
  steps: null,
  restingHeartRate: null,
  hrvMs: null,
  sleepMinutes: null,
  sleepStart: null,
  sleepEnd: null,
  deepMinutes: null,
  remMinutes: null,
  ...over,
});

function mockApi(s: WearablesStatusDTO, summary?: WearablesSummaryDTO) {
  vi.spyOn(WearablesApi, 'status').mockResolvedValue(s);
  const sync = vi.spyOn(WearablesApi, 'sync').mockResolvedValue({
    ran: false,
    days: 0,
    activities: 0,
    newActivities: 0,
  });
  const summaryFn = vi
    .spyOn(WearablesApi, 'summary')
    .mockResolvedValue(summary ?? { lastSyncedAt: null, days: [], activities: [] });
  return { sync, summaryFn };
}

afterEach(() => vi.restoreAllMocks());

describe('BodyCard', () => {
  it('renders nothing at all without a watch, and never asks for its data', async () => {
    const { sync, summaryFn } = mockApi(status({ connected: false }));
    const { container } = render(<BodyCard />, { wrapper: wrapper() });
    await waitFor(() => expect(WearablesApi.status).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(sync).not.toHaveBeenCalled();
    expect(summaryFn).not.toHaveBeenCalled();
  });

  it('shows last night, steps and resting heart rate, and syncs on open', async () => {
    const today = localDayKey(new Date());
    const { sync } = mockApi(status({}), {
      lastSyncedAt: new Date().toISOString(),
      days: [day(today, { sleepMinutes: 380, deepMinutes: 70, steps: 6240, restingHeartRate: 58 })],
      activities: [],
    });
    render(<BodyCard />, { wrapper: wrapper() });
    expect(await screen.findByText('6h 20m')).toBeInTheDocument();
    expect(screen.getByText('deep 1h 10m')).toBeInTheDocument();
    expect(screen.getByText((6240).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('58')).toBeInTheDocument();
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('says no sleep was recorded rather than showing zero', async () => {
    const today = localDayKey(new Date());
    mockApi(status({}), {
      lastSyncedAt: null,
      days: [day(today, { steps: 900 })],
      activities: [],
    });
    render(<BodyCard />, { wrapper: wrapper() });
    expect(await screen.findByText('no sleep recorded')).toBeInTheDocument();
    expect(screen.queryByText(/^0h|^0m/)).not.toBeInTheDocument();
  });

  it('offers a reconnect when Google expired the grant, without syncing', async () => {
    const { sync } = mockApi(status({ needsReconnect: true }));
    render(<BodyCard />, { wrapper: wrapper() });
    expect(await screen.findByRole('link', { name: 'Reconnect' })).toHaveAttribute(
      'href',
      '/settings#wearables',
    );
    expect(sync).not.toHaveBeenCalled();
  });
});

describe('WatchActivityCard', () => {
  it('lists the watch’s workouts with what it measured', async () => {
    mockApi(status({}), {
      lastSyncedAt: null,
      days: [day('2026-09-21', { sleepMinutes: 420, steps: 8000 })],
      activities: [
        {
          id: 'a1',
          type: 'RUNNING',
          name: 'Run',
          startAt: new Date(Date.now() - 26 * 3600e3).toISOString(),
          endAt: new Date(Date.now() - 25 * 3600e3).toISOString(),
          activeMinutes: 32,
          calories: 300,
          avgHeartRate: 152,
          distanceMeters: 5012,
        },
      ],
    });
    render(<WatchActivityCard />, { wrapper: wrapper() });
    expect(await screen.findByText('Run')).toBeInTheDocument();
    expect(screen.getByText('32 min · 5.0 km · 152 bpm')).toBeInTheDocument();
    expect(screen.getByText(/7h sleep a night/)).toBeInTheDocument();
  });
});
