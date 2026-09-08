import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({
  settings: { displayName: 'Saved', timezone: 'America/Toronto', briefHour: 7, proactiveEnabled: true },
  calendars: [{ id: 'work', summary: 'Work', syncing: true }, { id: 'home', summary: 'Home', syncing: false }],
}));
vi.mock('@/lib/hooks/settings', () => ({ useSettings: () => ({ data: state.settings, isPending: false, isError: false }), useUpdateSettings: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('@/lib/hooks/auth', () => ({ useMe: () => ({ data: { email: 'synthetic@example.com' }, isPending: false, isError: false }) }));
vi.mock('@/lib/hooks/google', () => ({ useGoogleCalendars: () => ({ data: state.calendars, isPending: false, isError: false }), useSetGoogleCalendars: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('@/lib/push', () => ({ currentPushState: () => Promise.resolve('unsupported'), enablePush: vi.fn(), disablePush: vi.fn() }));
vi.mock('@/components/ui', async (original) => ({ ...await original<typeof import('@/components/ui')>(), useToast: () => ({ toast: vi.fn() }) }));
import { NameSettingsCard } from '@/components/panels/NameSettingsCard';
import { ProactiveSettingsCard } from '@/components/panels/ProactiveSettingsCard';
import { GoogleCalendarPicker } from '@/components/connectors/GoogleCalendarPicker';
beforeEach(() => {
  state.settings = { displayName: 'Saved', timezone: 'America/Toronto', briefHour: 7, proactiveEnabled: true };
  state.calendars = [{ id: 'work', summary: 'Work', syncing: true }, { id: 'home', summary: 'Home', syncing: false }];
});
it('keeps an edited name when the server profile changes in the background', () => {
  const view = render(<NameSettingsCard />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'My draft' } });
  state.settings = { ...state.settings, displayName: 'Remote change' };
  view.rerender(<NameSettingsCard />);
  expect(screen.getByLabelText('Your name')).toHaveProperty('value', 'My draft');
});
it('keeps brief settings when an unrelated settings response arrives', () => {
  const view = render(<ProactiveSettingsCard />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '19' } });
  state.settings = { ...state.settings, displayName: 'Remote change' };
  view.rerender(<ProactiveSettingsCard />);
  expect(screen.getByRole('spinbutton')).toHaveProperty('value', '19');
  expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
});
it('keeps a calendar selection when server sync choices change', () => {
  const view = render(<GoogleCalendarPicker connected />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Work' }));
  state.calendars = state.calendars.map((calendar) => ({ ...calendar, syncing: true }));
  view.rerender(<GoogleCalendarPicker connected />);
  expect(screen.getByRole('checkbox', { name: 'Work' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Home' })).not.toBeChecked();
});
it('explains when the connected account has no available calendars', () => {
  state.calendars = [];
  render(<GoogleCalendarPicker connected />);
  expect(screen.getByText('No calendars are available from this Google account.')).toBeTruthy();
});
