import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    AuthApi: { ...actual.AuthApi, me: vi.fn() },
    SettingsApi: { ...actual.SettingsApi, update: vi.fn(), get: vi.fn() },
    AiApi: { ...actual.AiApi, status: vi.fn(), insights: vi.fn() },
  };
});
import { AiApi, AuthApi, SettingsApi } from '@/lib/api';
import { BriefBlock } from '@/components/stream/TodayHeader';

/**
 * Atlas had never greeted either real account by name.
 *
 * `displayName` has been on the user record since the first migration, with an
 * endpoint, a DTO and a settings field — and it was NULL for both of them, so
 * the greeting fell back to "Good afternoon." forever. Neither email survives
 * being guessed from either: a local part carrying digits is a generated
 * address, not a person.
 *
 * Onboarding deliberately dropped its name question on the grounds that the
 * asks bell would raise it later. It never did. So the greeting itself asks —
 * the one place where the answer is visibly about to be used.
 */
const me = AuthApi.me as unknown as ReturnType<typeof vi.fn>;
const update = SettingsApi.update as unknown as ReturnType<typeof vi.fn>;

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const ASK = /What should Atlas call you/i;

beforeEach(() => {
  vi.clearAllMocks();
  (AiApi.status as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (AiApi.insights as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (SettingsApi.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
  update.mockResolvedValue({ displayName: 'Riley' });
});

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'rileyhinsperger16@gmail.com',
  displayName: null,
  timezone: 'America/Toronto',
  ...over,
});

describe('the greeting asks for a name', () => {
  it('offers when there is nothing to call you', async () => {
    me.mockResolvedValue(user());
    wrap(<BriefBlock />);
    expect(await screen.findByText(ASK)).toBeTruthy();
  });

  it('says nothing once a name is set', async () => {
    me.mockResolvedValue(user({ displayName: 'Riley' }));
    wrap(<BriefBlock />);
    await waitFor(() => expect(me).toHaveBeenCalled());
    expect(screen.queryByText(ASK)).toBeNull();
  });

  /** An address that reads like a person is already an answer. */
  it('says nothing when the address itself gives a name', async () => {
    me.mockResolvedValue(user({ email: 'riley@example.com' }));
    wrap(<BriefBlock />);
    await waitFor(() => expect(me).toHaveBeenCalled());
    expect(screen.queryByText(ASK)).toBeNull();
  });

  /**
   * Same rule that keeps the first-run wizard off an established account: a
   * failed request leaves data undefined, and asking someone for a name they
   * already gave reads as amnesia.
   */
  it('says nothing while /auth/me is still loading or failed', async () => {
    me.mockImplementation(() => new Promise(() => {}));
    const { unmount } = wrap(<BriefBlock />);
    expect(screen.queryByText(ASK)).toBeNull();
    unmount();

    me.mockRejectedValue(new Error('network'));
    wrap(<BriefBlock />);
    await waitFor(() => expect(me).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(ASK)).toBeNull());
  });

  it('saves the name in one tap', async () => {
    const person = userEvent.setup();
    me.mockResolvedValue(user());
    wrap(<BriefBlock />);
    await person.click(await screen.findByText(ASK));
    const box = screen.getByLabelText(ASK);
    await person.click(box);
    await person.type(box, 'Riley');
    await person.click(screen.getByRole('button', { name: /Save your name/i }));
    // TanStack v5 passes the mutation context second, so read the first arg.
    await waitFor(() => expect(update.mock.calls[0]?.[0]).toEqual({ displayName: 'Riley' }));
  });

  it('sends nothing for an empty box', async () => {
    const person = userEvent.setup();
    me.mockResolvedValue(user());
    wrap(<BriefBlock />);
    await person.click(await screen.findByText(ASK));
    expect(screen.getByRole('button', { name: /Save your name/i })).toHaveProperty('disabled', true);
    expect(update).not.toHaveBeenCalled();
  });
});
