import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Keep ApiError/errorMessage real; stub only the network objects so we can
// assert the client-side guards fire *before* any request.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    AuthApi: { me: vi.fn(), register: vi.fn(), login: vi.fn(), logout: vi.fn() },
    EventsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), remove: vi.fn() },
  };
});
import { AuthApi, EventsApi } from '@/lib/api';
import { AuthGate } from '@/components/AuthGate';
import { CalendarPanel } from '@/components/panels/CalendarPanel';

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe('AuthGate client-side validation', () => {
  it('blocks a too-short registration password before any request', async () => {
    const user = userEvent.setup();
    wrap(<AuthGate />);

    await user.click(screen.getByRole('button', { name: /Need an account/ }));
    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(AuthApi.register).not.toHaveBeenCalled();
  });
});

describe('CalendarPanel client-side validation', () => {
  it('rejects an end-before-start event without calling the API', async () => {
    wrap(<CalendarPanel />);

    fireEvent.change(screen.getByPlaceholderText('Event title'), {
      target: { value: 'Backwards' },
    });
    const [start, end] = screen.getAllByLabelText(/^(Start|End)$/, { selector: 'input' });
    fireEvent.change(start, { target: { value: '2026-07-21T15:00' } });
    fireEvent.change(end, { target: { value: '2026-07-21T09:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));

    expect(screen.getByText('End must be at or after start.')).toBeInTheDocument();
    expect(EventsApi.create).not.toHaveBeenCalled();
  });
});
