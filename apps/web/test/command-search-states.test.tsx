import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ pending: true, error: false, hits: [] as { domain: string; id: string; title: string; subtitle: string; href: string }[], retry: vi.fn(), capture: vi.fn(), chat: vi.fn(), push: vi.fn() }));
vi.mock('@/lib/hooks/search', () => ({ useSearch: () => ({ isPending: state.pending, isError: state.error, isSuccess: !state.pending && !state.error, data: state.pending || state.error ? undefined : { hits: state.hits }, refetch: state.retry }) }));
vi.mock('@/lib/hooks/ai', () => ({ useBrainDump: () => ({ isPending: false, mutate: state.capture }) }));
vi.mock('@/components/ui', async (importOriginal) => ({ ...await importOriginal<typeof import('@/components/ui')>(), useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/atlas/AtlasUiProvider', () => ({ useAtlasUi: () => ({ commandOpen: true, setCommandOpen: vi.fn(), openChat: state.chat, recordChanges: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
import { CommandBar } from '@/components/atlas/CommandBar';
beforeEach(() => {
  state.pending = true; state.error = false; state.hits = [];
  state.retry.mockClear(); state.capture.mockClear(); state.chat.mockClear(); state.push.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});
function typeQuery(text = 'dentist') {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: text } });
}
it('shows search progress only when a searchable query is active', () => {
  render(<CommandBar />);
  expect(screen.queryByText('Searching your Atlas…')).toBeNull();
  typeQuery('d');
  expect(screen.queryByText('Searching your Atlas…')).toBeNull();
  typeQuery();
  expect(screen.getByRole('status')).toHaveTextContent('Searching your Atlas…');
});
it('offers retry for failed search without claiming no matches or losing input', () => {
  state.pending = false; state.error = true;
  render(<CommandBar />); typeQuery();
  expect(screen.getByText('Your saved items could not be searched.')).toBeVisible();
  expect(screen.queryByText('No saved items match this search.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.retry).toHaveBeenCalledOnce();
  expect(screen.getByRole('combobox')).toHaveValue('dentist');
});
it('explains a confirmed empty search while keeping capture and chat available', () => {
  state.pending = false;
  render(<CommandBar />); typeQuery();
  expect(screen.getByText('No saved items match this search.')).toBeVisible();
  expect(screen.getByRole('option', { name: /Capture:/ })).toBeVisible();
  expect(screen.getByRole('option', { name: /Ask Atlas:/ })).toBeVisible();
});
it('keeps the chosen action when search results arrive above it', () => {
  const view = render(<CommandBar />); typeQuery();
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
  expect(screen.getByRole('option', { name: /Ask Atlas:/ })).toHaveAttribute('aria-selected', 'true');
  state.pending = false;
  state.hits = [{ domain: 'task', id: 'saved', title: 'Dentist appointment', subtitle: 'todo', href: '/tasks' }];
  view.rerender(<CommandBar />);
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
  expect(state.chat).toHaveBeenCalledWith('dentist');
  expect(state.capture).not.toHaveBeenCalled();
});
