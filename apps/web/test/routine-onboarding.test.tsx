import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const save = vi.hoisted(() => vi.fn().mockImplementation(() => new Promise(() => {})));
vi.mock('@/lib/hooks/routine', () => ({ useReplaceRoutine: () => ({ mutateAsync: save }) }));
vi.mock('@/lib/hooks/google', () => ({ useGoogleStatus: () => ({ data: { configured: false } }), useGoogleConnectStart: () => ({ mutate: vi.fn() }) }));
vi.mock('@/lib/hooks/ai', () => ({ useConnectDeepSeek: () => ({ mutate: vi.fn() }) }));
vi.mock('@/components/atlas/AtlasUiProvider', () => ({ useAtlasUi: () => ({ setFocusMode: vi.fn() }) }));
vi.mock('@/components/ui', async (original) => ({ ...await original<object>(), useToast: () => ({ toast: vi.fn() }) }));
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
it('saves a routine after two steps without introducing provider setup', () => {
  render(<QueryClientProvider client={new QueryClient()}><OnboardingWizard /></QueryClientProvider>);
  expect(screen.getByRole('group', { name: 'Step 1 of 2' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('group', { name: 'Step 2 of 2' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Build my week' }));
  expect(save).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('DeepSeek API key')).toBeNull();
});
