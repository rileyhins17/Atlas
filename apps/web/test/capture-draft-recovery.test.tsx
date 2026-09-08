import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
const ui = vi.hoisted(() => ({ commandOpen: true, setCommandOpen: vi.fn(), openChat: vi.fn(), recordChanges: vi.fn() }));
vi.mock('@/components/atlas/AtlasUiProvider', () => ({ useAtlasUi: () => ui }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/hooks/search', () => ({ useSearch: () => ({ data: { hits: [] }, isSuccess: true, isPending: false, isError: false }) }));
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, AiApi: { ...actual.AiApi, brainDump: vi.fn() }, TasksApi: { ...actual.TasksApi, create: vi.fn() } };
});
import { AiApi, ApiError, TasksApi } from '@/lib/api';
import { ToastProvider } from '@/components/ui';
import { HomeCapture } from '@/components/home/HomeCapture';
import { CommandBar } from '@/components/atlas/CommandBar';
function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(<ToastProvider><QueryClientProvider client={client}>{children}</QueryClientProvider></ToastProvider>);
}
beforeEach(() => {
  ui.commandOpen = true; ui.setCommandOpen.mockClear(); ui.recordChanges.mockClear();
  vi.mocked(AiApi.brainDump).mockReset().mockRejectedValue(new ApiError(503, 'Unavailable'));
  vi.mocked(TasksApi.create).mockReset().mockResolvedValue({ id: 'saved' } as Awaited<ReturnType<typeof TasksApi.create>>);
  Element.prototype.scrollIntoView = vi.fn();
});
it('keeps the command bar open when capture fails', async () => {
  wrap(<CommandBar />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'buy milk' } });
  fireEvent.click(screen.getByRole('option', { name: /Capture:/ }));
  await waitFor(() => expect(AiApi.brainDump).toHaveBeenCalledOnce());
  expect(ui.setCommandOpen).not.toHaveBeenCalledWith(false);
  expect(await screen.findByText('Capture was not confirmed. Your text is kept.')).toBeVisible();
  expect(screen.getByRole('combobox')).toHaveValue('buy milk');
});
it('clears the dock only after a local fallback write succeeds', async () => {
  vi.mocked(AiApi.brainDump).mockRejectedValue(new ApiError(424, 'No provider'));
  wrap(<HomeCapture />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Capture anything' }), { target: { value: 'buy milk' } });
  fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
  await waitFor(() => expect(TasksApi.create).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Capture anything' })).toHaveValue(''));
});
it.each(['dock', 'command'] as const)('protects the submitted %s draft while saving', async (surface) => {
  vi.mocked(AiApi.brainDump).mockImplementation(() => new Promise(() => {}));
  wrap(surface === 'dock' ? <HomeCapture /> : <CommandBar />);
  const input = screen.getByRole(surface === 'dock' ? 'textbox' : 'combobox');
  fireEvent.change(input, { target: { value: 'buy milk' } });
  fireEvent.click(surface === 'dock' ? screen.getByRole('button', { name: /^Capture$/ }) : screen.getByRole('option', { name: /Capture:/ }));
  await waitFor(() => expect(input).toHaveAttribute('readonly'));
});
