import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    AiApi: { ...actual.AiApi, status: vi.fn(), insights: vi.fn(), dailyBrief: vi.fn() },
  };
});
import { AiApi } from '@/lib/api';
import { HeroBrief } from '@/components/home/HeroBrief';

/**
 * What Atlas says before it knows anything.
 *
 * The no-key branch needs the AI status query to have resolved, so while that
 * was in flight the component fell through to the briefing path and announced
 * "Reading your day…" — to an account with no AI key, which cannot have a brief
 * read for it. It then corrected itself to "connect the AI in Settings".
 *
 * Every new account saw that, and a correction like it reads as the app
 * changing its story about what it was doing. Same rule as `/health` reporting
 * a stale-but-true database state instead of a fresh-looking guess: do not
 * claim what you do not know yet.
 */
const status = AiApi.status as unknown as ReturnType<typeof vi.fn>;
const insights = AiApi.insights as unknown as ReturnType<typeof vi.fn>;

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const never = () => new Promise(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  insights.mockResolvedValue([]);
});

describe('HeroBrief', () => {
  it('does not claim to be reading your day before it knows there is an AI', () => {
    status.mockImplementation(never);
    insights.mockImplementation(never);
    wrap(<HeroBrief greeting="Good afternoon." />);

    expect(screen.queryByText(/Reading your day/i)).toBeNull();
    // The greeting is safe immediately — it comes from the user, not the provider.
    expect(screen.getByText('Good afternoon.')).toBeTruthy();
  });

  it('points an unconfigured account at Settings rather than at a spinner', async () => {
    status.mockResolvedValue({ providerConfigured: false });
    wrap(<HeroBrief greeting="Good afternoon." />);

    expect(await screen.findByText(/connect the AI in Settings/i)).toBeTruthy();
    expect(screen.queryByText(/Reading your day/i)).toBeNull();
  });

  /** Only once there IS a provider is "reading your day" a true statement. */
  it('reads your day only when an AI is actually configured', async () => {
    status.mockResolvedValue({ providerConfigured: true });
    insights.mockImplementation(never);
    wrap(<HeroBrief greeting="Good afternoon." />);

    expect(await screen.findByText(/Reading your day/i)).toBeTruthy();
  });

  it('shows the brief once there is one', async () => {
    status.mockResolvedValue({ providerConfigured: true });
    insights.mockResolvedValue([
      { id: 'i1', title: 'Daily brief', body: 'Three things today.', createdAt: new Date().toISOString() },
    ]);
    wrap(<HeroBrief greeting="Good afternoon." />);

    await waitFor(() => expect(screen.getByText(/Three things today/)).toBeTruthy());
  });
});


it('retries failed AI configuration without treating it as unconfigured', async () => {
  status.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ providerConfigured: false });
  wrap(<HeroBrief greeting="Good afternoon." />);
  await screen.findByText('AI availability could not be loaded.');
  expect(screen.queryByText(/connect the AI in Settings/i)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText(/connect the AI in Settings/i);
});
it('does not claim there is no brief when its read failed', async () => {
  status.mockResolvedValue({ providerConfigured: true });
  insights.mockRejectedValue(new Error('offline'));
  wrap(<HeroBrief />);
  await screen.findByText('Your daily brief could not be loaded.');
  expect(screen.queryByRole('button', { name: 'Brief me' })).toBeNull();
});
