import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ readPush: vi.fn(), error: null as Error | null }));
vi.mock('@/lib/hooks/settings', () => ({
  useSettings: () => ({ data: { timezone: 'America/Toronto', briefHour: 7, proactiveEnabled: true, weightUnit: 'kg' }, isPending: false, isError: false }),
  useUpdateSettings: () => ({ mutate: vi.fn(), error: state.error, isPending: false }),
}));
vi.mock('@/lib/push', () => ({ currentPushState: state.readPush, enablePush: vi.fn(), disablePush: vi.fn() }));
vi.mock('@/components/ui', async (original) => ({ ...await original<typeof import('@/components/ui')>(), useToast: () => ({ toast: vi.fn() }) }));
import { ProactiveSettingsCard } from '@/components/panels/ProactiveSettingsCard';
import { TrainingSettingsCard } from '@/components/panels/TrainingSettingsCard';
beforeEach(() => { state.readPush.mockReset(); state.error = null; });
it('offers notification-status retry instead of leaving an unusable button', async () => {
  state.readPush.mockRejectedValueOnce(new Error('Synthetic service worker failure')).mockResolvedValue('disabled');
  render(<ProactiveSettingsCard />);
  expect(await screen.findByText('Could not read notification status.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: 'Enable notifications' })).toBeEnabled();
  expect(state.readPush).toHaveBeenCalledTimes(2);
});
it('explains a failed weight preference save while keeping the saved unit selected', () => {
  state.error = new Error('Synthetic save failure');
  render(<TrainingSettingsCard />);
  expect(screen.getByRole('alert').textContent).toContain('Could not save weight preference. Try your selection again.');
  expect(screen.getByRole('button', { name: 'Kilograms (kg)' })).toHaveAttribute('aria-pressed', 'true');
});
