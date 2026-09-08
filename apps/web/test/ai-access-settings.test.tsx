import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const state = vi.hoisted(() => ({
  data: { enabled: true, model: 'synthetic-model', dailyTokenCap: 1000, tokensUsedToday: 70, providerConfigured: false, hostedAccess: { granted: false, revoked: false, available: true, inviteRequired: true } },
  error: false, refetch: vi.fn(), redeem: vi.fn(),
}));
vi.mock('@/lib/hooks/ai', () => ({
  useAiStatus: () => ({ data: state.data, isPending: false, isError: state.error, error: new Error('Status unavailable'), refetch: state.refetch }),
  useConnectDeepSeek: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useRedeemAiInvite: () => ({ mutate: state.redeem, isPending: false, error: null }),
}));
import { AiSettingsCard } from '@/components/panels/AiSettingsCard';
beforeEach(() => {
  state.data.hostedAccess.granted = false; state.data.providerConfigured = false; state.error = false;
  state.refetch.mockClear(); state.redeem.mockClear();
});
it('redeems an invite instead of requesting a provider key', async () => {
  render(<AiSettingsCard />);
  await userEvent.setup().type(screen.getByLabelText('Invite code'), 'synthetic-invite');
  fireEvent.click(screen.getByRole('button', { name: 'Activate AI access' }));
  expect(state.redeem).toHaveBeenCalledWith('synthetic-invite', expect.anything());
  expect(screen.queryByLabelText('DeepSeek API key')).toBeNull();
});
it('shows included AI and the member allowance after a grant', () => {
  state.data.hostedAccess.granted = true; state.data.providerConfigured = true;
  render(<AiSettingsCard />);
  expect(screen.getByText('AI is included with your invite.')).toBeTruthy();
  expect(screen.queryByLabelText('DeepSeek API key')).toBeNull();
});
it('offers status retry rather than a key form when the query fails', () => {
  state.error = true;
  render(<AiSettingsCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.refetch).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('DeepSeek API key')).toBeNull();
});
