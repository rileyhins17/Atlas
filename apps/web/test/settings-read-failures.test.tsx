import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({
 settings: { data: undefined, isPending: false, isError: true, refetch: vi.fn() },
 me: { data: { email: 'synthetic@example.com' }, isPending: false, isError: false, refetch: vi.fn() },
}));
vi.mock('@/lib/hooks/settings', () => ({ useSettings: () => state.settings, useUpdateSettings: () => ({ mutate: vi.fn() }) }));
vi.mock('@/lib/hooks/auth', () => ({ useMe: () => state.me }));
import { TrainingSettingsCard } from '@/components/panels/TrainingSettingsCard';
import { NameSettingsCard } from '@/components/panels/NameSettingsCard';
beforeEach(() => { state.settings.refetch.mockClear(); });
it('does not select pounds when the saved weight preference failed to load', () => {
 render(<TrainingSettingsCard />);
 expect(screen.queryByRole('button', { name: 'Pounds (lb)' })).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
 expect(state.settings.refetch).toHaveBeenCalledOnce();
});
it('does not offer an empty name editor when the saved name failed to load', () => {
 render(<NameSettingsCard />);
 expect(screen.queryByRole('textbox')).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
 expect(state.settings.refetch).toHaveBeenCalledOnce();
});
