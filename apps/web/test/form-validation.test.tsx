import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Keep ApiError/errorMessage real; stub only the network objects so we can
// assert the client-side guards fire *before* any request.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    AuthApi: { me: vi.fn(), register: vi.fn(), login: vi.fn(), logout: vi.fn() },
    EventsApi: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  };
});
import { AuthApi, EventsApi } from '@/lib/api';
import { AuthGate } from '@/components/AuthGate';
import { CalendarPanel } from '@/components/panels/CalendarPanel';
import { ToastProvider } from '@/components/ui';

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // CalendarPanel raises its own toasts (delete + undo), so the provider is
  // part of its contract, not incidental scaffolding.
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('AuthGate client-side validation', () => {
  it('blocks a too-short registration password before any request', async () => {
    const user = userEvent.setup();
    wrap(<AuthGate />);

    await user.click(screen.getByRole('button', { name: 'Show the create account form' }));
    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(AuthApi.register).not.toHaveBeenCalled();
  });
});

describe('CalendarPanel client-side validation', () => {
  // An end-before-start event is no longer representable: the composer takes a
  // start time plus a duration, so the end is always derived and always after.
  // What remains worth guarding is the empty title.
  it('rejects an untitled event without calling the API', async () => {
    const user = userEvent.setup();
    wrap(<CalendarPanel />);

    await user.click(screen.getByRole('button', { name: /New/ }));
    await user.click(screen.getByRole('button', { name: 'Add event' }));

    expect(screen.getByText('Give the event a name.')).toBeInTheDocument();
    expect(EventsApi.create).not.toHaveBeenCalled();
  });
});
