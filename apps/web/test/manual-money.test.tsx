import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const state = vi.hoisted(() => ({ create: vi.fn(), pending: false, error: null as Error | null }));
vi.mock('@/lib/hooks/finance', () => ({
  useAccounts: () => ({ data: [], isPending: false, isError: false }),
  useTransactions: () => ({ data: [], isPending: false, isError: false }),
  useCreateAccount: () => ({ mutate: state.create, isPending: state.pending, error: state.error }),
  useCreateTransaction: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));
vi.mock('@/components/panels/PlaidCard', () => ({ PlaidCard: () => <p>Bank connection unavailable</p> }));
import { FinancePanel } from '@/components/panels/FinancePanel';
beforeEach(() => { state.create.mockClear(); state.pending = false; state.error = null; });
it('offers manual account creation without a bank connection and submits exact cents', async () => {
  render(<FinancePanel />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add account' }));
  await user.type(screen.getByLabelText('Account name'), 'Cash reserve');
  await user.type(screen.getByLabelText('Recorded balance'), '185.29');
  await user.click(screen.getByRole('button', { name: 'Save account' }));
  expect(state.create).toHaveBeenCalledWith({ name: 'Cash reserve', type: 'checking', currency: 'CAD', balanceMinor: 18529 }, expect.anything());
});
it('keeps the account draft visible when saving fails', async () => {
  const view = render(<FinancePanel />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add account' }));
  await user.type(screen.getByLabelText('Account name'), 'Cash reserve');
  state.error = new Error('Could not save account');
  view.rerender(<FinancePanel />);
  expect(screen.getByLabelText('Account name')).toHaveProperty('value', 'Cash reserve');
  expect(screen.getByRole('alert').textContent).toContain('Could not save account');
});
