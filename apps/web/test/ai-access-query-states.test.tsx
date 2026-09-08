import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, AiApi: { ...actual.AiApi, status: vi.fn(), redeemInvite: vi.fn(), connectDeepSeek: vi.fn() } };
});
import { AiApi, type AiStatus } from '@/lib/api';
import { AiSettingsCard } from '@/components/panels/AiSettingsCard';
const base: AiStatus = { enabled: true, model: 'synthetic', dailyTokenCap: 1000, tokensUsedToday: 70, providerConfigured: false, domains: [], hostedAccess: { granted: false, revoked: false, available: true, inviteRequired: true } };
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AiSettingsCard /></QueryClientProvider>);
}
beforeEach(() => {
  vi.mocked(AiApi.status).mockReset().mockResolvedValue(structuredClone(base));
  vi.mocked(AiApi.redeemInvite).mockReset();
  vi.mocked(AiApi.connectDeepSeek).mockReset();
});
it('shows pending access without asking for a personal key or invite', () => {
  vi.mocked(AiApi.status).mockImplementation(() => new Promise<never>(() => {}));
  const view = mount();
  expect(view.container.querySelector('.skeleton')).not.toBeNull();
  expect(screen.queryByLabelText('Invite code')).toBeNull();
  expect(screen.queryByLabelText('DeepSeek API key')).toBeNull();
});
it('retries failed status into the real invite form', async () => {
  vi.mocked(AiApi.status).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(base);
  mount();
  await screen.findByText('Could not load AI access');
  fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }));
  expect(await screen.findByLabelText('Invite code')).toBeEnabled();
  expect(AiApi.status).toHaveBeenCalledTimes(2);
});
it('explains approved but unavailable hosted AI without requesting a key', async () => {
  vi.mocked(AiApi.status).mockResolvedValue({ ...base, hostedAccess: { ...base.hostedAccess!, granted: true, available: false } });
  mount();
  expect(await screen.findByText(/Your access is approved. Hosted AI is not available yet/)).toBeVisible();
  expect(screen.queryByLabelText('DeepSeek API key')).toBeNull();
});
it('explains paused hosted AI without offering an activation loop', async () => {
  vi.mocked(AiApi.status).mockResolvedValue({ ...base, enabled: false, providerConfigured: true, hostedAccess: { ...base.hostedAccess!, granted: true } });
  mount();
  expect(await screen.findByText(/AI is currently paused/)).toBeVisible();
  expect(screen.queryByLabelText('Invite code')).toBeNull();
});
it('keeps hosted revocation visible even with a personal connection', async () => {
  vi.mocked(AiApi.status).mockResolvedValue({ ...base, providerConfigured: true, hostedAccess: { ...base.hostedAccess!, granted: true, revoked: true } });
  mount();
  expect(await screen.findByText(/Hosted AI access has been revoked/)).toBeVisible();
  expect(screen.queryByLabelText('Invite code')).toBeNull();
});
it('lets a personal-key account activate included AI with its invite', async () => {
  vi.mocked(AiApi.status).mockResolvedValue({ ...base, providerConfigured: true });
  mount();
  expect(await screen.findByLabelText('Invite code')).toBeEnabled();
  expect(screen.queryByLabelText('DeepSeek API key')).toBeNull();
});
it('retains a failed invite and refreshes into included access after retry', async () => {
  vi.mocked(AiApi.redeemInvite).mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(async () => {
    vi.mocked(AiApi.status).mockResolvedValue({ ...base, providerConfigured: true, hostedAccess: { ...base.hostedAccess!, granted: true } });
    return { ok: true };
  });
  mount();
  const input = await screen.findByLabelText('Invite code');
  fireEvent.change(input, { target: { value: 'synthetic-invite' } });
  fireEvent.click(screen.getByRole('button', { name: 'Activate AI access' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not activate access. Your invite is kept; try again.');
  expect(input).toHaveValue('synthetic-invite');
  fireEvent.click(screen.getByRole('button', { name: 'Activate AI access' }));
  expect(await screen.findByText('AI is included with your invite.')).toBeVisible();
  await waitFor(() => expect(screen.queryByLabelText('Invite code')).toBeNull());
  expect(AiApi.redeemInvite).toHaveBeenCalledTimes(2);
  expect(AiApi.connectDeepSeek).not.toHaveBeenCalled();
});
it('does not call a paused personal connection live', async () => {
  vi.mocked(AiApi.status).mockResolvedValue({ ...base, enabled: false, providerConfigured: true, hostedAccess: { ...base.hostedAccess!, inviteRequired: false } });
  mount();
  expect(await screen.findByText(/AI is currently paused/)).toBeVisible();
  expect(screen.queryByText(/are live/)).toBeNull();
});
