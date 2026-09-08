import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ pending: false, error: false, required: false, retry: vi.fn(), register: vi.fn() }));
vi.mock('@/lib/hooks/auth', () => ({
  useAuthConfig: () => ({ data: state.pending || state.error ? undefined : { inviteRequired: state.required }, isPending: state.pending, isError: state.error, isSuccess: !state.pending && !state.error, refetch: state.retry }),
  useLogin: () => ({ mutate: vi.fn(), isPending: false }),
  useRegister: () => ({ mutate: state.register, isPending: false }),
}));
import { AuthGate } from '@/components/AuthGate';
beforeEach(() => { state.pending = false; state.error = false; state.required = false; state.retry.mockClear(); state.register.mockClear(); });
it.each(['pending', 'error'] as const)('does not submit registration with unknown invite requirements: %s', (kind) => {
  state[kind] = true;
  render(<AuthGate />);
  fireEvent.click(screen.getByRole('button', { name: 'Show the create account form' }));
  expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  if (kind === 'error') { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(state.retry).toHaveBeenCalledOnce(); }
});
it('keeps sign-in available when registration configuration fails', () => {
  state.error = true;
  render(<AuthGate />);
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});
it('retains credentials when configuration recovers and requires an invite', () => {
  state.error = true;
  const view = render(<AuthGate />);
  fireEvent.click(screen.getByRole('button', { name: 'Show the create account form' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'synthetic@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-password-123' } });
  state.error = false; state.required = true; view.rerender(<AuthGate />);
  expect(screen.getByLabelText('Email')).toHaveValue('synthetic@example.com');
  expect(screen.getByLabelText('Password')).toHaveValue('synthetic-password-123');
  expect(screen.getByLabelText('Invite code')).toBeVisible();
});
