import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const state = vi.hoisted(() => ({ create: vi.fn(), pending: false, error: null as Error | null }));
vi.mock('@/lib/hooks/finance', () => ({
  useAccounts: () => ({ data: [{ id: 'cash', name: 'Cash', currency: 'CAD', type: 'cash', balanceMinor: 20000, source: 'atlas' }], isPending: false, isError: false }),
  useTransactions: () => ({ data: [], isPending: false, isError: false }),
  useCreateAccount: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useCreateTransaction: () => ({ mutate: state.create, isPending: state.pending, error: state.error }),
}));
vi.mock('@/components/panels/PlaidCard', () => ({ PlaidCard: () => null }));
import { FinancePanel } from '@/components/panels/FinancePanel';
beforeEach(() => { state.create.mockClear(); state.pending = false; state.error = null; });
it('records spending in exact negative cents with the account currency', async () => {
  render(<FinancePanel />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add transaction' }));
  await user.type(screen.getByLabelText('Description'), 'Groceries');
  await user.type(screen.getByLabelText('Amount (CAD)'), '18.29');
  await user.click(screen.getByRole('button', { name: 'Save transaction' }));
  expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'cash', currency: 'CAD', amountMinor: -1829, description: 'Groceries' }), expect.anything());
});
it('retains the transaction draft on a failed save', async () => {
  const view = render(<FinancePanel />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add transaction' }));
  await user.type(screen.getByLabelText('Description'), 'Groceries');
  state.error = new Error('Save unavailable');
  view.rerender(<FinancePanel />);
  expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Groceries');
  expect(screen.getByRole('alert').textContent).toContain('Could not save transaction. Your draft is kept.');
});
