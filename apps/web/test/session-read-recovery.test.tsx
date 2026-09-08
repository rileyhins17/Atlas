import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const retry = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ error: true }));
vi.mock('@/lib/hooks/auth', () => ({ useMe: () => ({ data: state.error ? undefined : null, isPending: false, isError: state.error, refetch: retry }) }));
vi.mock('@/lib/hooks/timezone', () => ({ useTimezoneSync: () => undefined }));
vi.mock('@/components/AuthGate', () => ({ AuthGate: () => <h1>Sign in</h1> }));
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => null }));
import { AppShell } from '@/components/AppShell';
beforeEach(() => { state.error = true; retry.mockClear(); });
it('offers session recovery instead of claiming the user is signed out on a failed read', () => {
  render(<AppShell><p>Private content</p></AppShell>);
  expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  expect(screen.queryByText('Private content')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledOnce();
});

it('gives the confirmed signed-out screen a main landmark', () => {
  state.error = false;
  render(<AppShell><p>Private content</p></AppShell>);
  expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { name: 'Sign in' }));
});
