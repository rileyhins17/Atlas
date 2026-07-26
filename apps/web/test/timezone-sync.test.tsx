import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { UserDTO } from '@atlas/shared';
import { useTimezoneSync } from '@/lib/hooks/timezone';
import { SettingsApi } from '@/lib/api';

/**
 * Atlas has ONE clock per user: the Today canvas buckets by the browser's
 * local day, `/stats` buckets server-side by `User.timezone`, and they agree
 * only because this hook keeps the stored zone equal to the device's. The
 * stored default is 'UTC' and nothing else ever corrects it, so without this
 * every user outside UTC sees Today and Progress disagree.
 */

const user = (timezone: string): UserDTO => ({
  id: 'u1',
  email: 'a@b.c',
  displayName: null,
  timezone,
});

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function setBrowserZone(tz: string) {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone: tz }),
  } as unknown as Intl.DateTimeFormat);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTimezoneSync', () => {
  it('pushes the device zone when the stored one is the UTC default', async () => {
    setBrowserZone('America/Toronto');
    const update = vi
      .spyOn(SettingsApi, 'update')
      .mockResolvedValue({
        displayName: null,
        timezone: 'America/Toronto',
        briefHour: 7,
        proactiveEnabled: true,
      weightUnit: 'lb' as const,
      });
    const qc = new QueryClient();

    renderHook(() => useTimezoneSync(user('UTC')), { wrapper: wrapper(qc) });

    await waitFor(() => expect(update).toHaveBeenCalledWith({ timezone: 'America/Toronto' }));
  });

  it('does nothing when the stored zone already matches', async () => {
    setBrowserZone('America/Toronto');
    const update = vi.spyOn(SettingsApi, 'update');
    const qc = new QueryClient();

    renderHook(() => useTimezoneSync(user('America/Toronto')), { wrapper: wrapper(qc) });

    await new Promise((r) => setTimeout(r, 20));
    expect(update).not.toHaveBeenCalled();
  });

  it('does nothing while signed out', async () => {
    setBrowserZone('America/Toronto');
    const update = vi.spyOn(SettingsApi, 'update');
    const qc = new QueryClient();

    renderHook(() => useTimezoneSync(null), { wrapper: wrapper(qc) });

    await new Promise((r) => setTimeout(r, 20));
    expect(update).not.toHaveBeenCalled();
  });

  it('swallows a failed sync — a stale zone must not break the app', async () => {
    setBrowserZone('America/Toronto');
    const update = vi.spyOn(SettingsApi, 'update').mockRejectedValue(new Error('offline'));
    const qc = new QueryClient();

    renderHook(() => useTimezoneSync(user('UTC')), { wrapper: wrapper(qc) });

    await waitFor(() => expect(update).toHaveBeenCalled());
    // No unhandled rejection, and the cached user keeps its previous zone.
    expect(qc.getQueryData(['auth', 'me'])).toBeUndefined();
  });

  it('only attempts once per mount', async () => {
    setBrowserZone('America/Toronto');
    const update = vi.spyOn(SettingsApi, 'update').mockResolvedValue({
      displayName: null,
      timezone: 'America/Toronto',
      briefHour: 7,
      proactiveEnabled: true,
      weightUnit: 'lb' as const,
    });
    const qc = new QueryClient();

    const { rerender } = renderHook(() => useTimezoneSync(user('UTC')), { wrapper: wrapper(qc) });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
