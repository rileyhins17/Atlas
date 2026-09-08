import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, JournalApi: { ...actual.JournalApi, list: vi.fn(), create: vi.fn() }, NotesApi: { ...actual.NotesApi, list: vi.fn(), create: vi.fn() } };
});
import { ApiError, JournalApi, NotesApi } from '@/lib/api';
import { WritingPanel } from '@/components/panels/WritingPanel';
function mount(note: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><WritingPanel /></QueryClientProvider>);
  if (note) {
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('textbox', { name: 'What this note is about' }), { target: { value: 'A lasting fact' } });
  } else fireEvent.click(screen.getByRole('button', { name: 'Mood 4 out of 5' }));
  const input = screen.getByRole('textbox', { name: 'What are you writing?' });
  fireEvent.change(input, { target: { value: 'Writing worth keeping' } });
  return { input, form: input.closest('form')! };
}
beforeEach(() => {
  vi.mocked(JournalApi.list).mockReset().mockResolvedValue([]);
  vi.mocked(NotesApi.list).mockReset().mockResolvedValue([]);
  vi.mocked(JournalApi.create).mockReset();
  vi.mocked(NotesApi.create).mockReset();
});
for (const note of [false, true]) {
  it(`protects the pending ${note ? 'note' : 'journal'} draft and mode`, async () => {
    const api = note ? NotesApi.create : JournalApi.create;
    vi.mocked(api).mockImplementation(() => new Promise<never>(() => {}));
    const { input, form } = mount(note);
    fireEvent.submit(form);
    await waitFor(() => expect(input).toHaveAttribute('readonly'));
    expect(within(form).getByRole('status')).toHaveTextContent('Saving your writing…');
    expect(screen.getByRole('checkbox')).toBeDisabled();
    if (note) expect(screen.getByRole('textbox', { name: 'What this note is about' })).toHaveAttribute('readonly');
    else expect(screen.getByRole('button', { name: 'Mood 4 out of 5' })).toBeDisabled();
    fireEvent.submit(form);
    expect(api).toHaveBeenCalledOnce();
  });
  it(`retains the failed ${note ? 'note' : 'journal'} draft and retries the same values`, async () => {
    const api = note ? NotesApi.create : JournalApi.create;
    vi.mocked(api).mockRejectedValueOnce(new ApiError(503, 'Unavailable'));
    const { input, form } = mount(note);
    fireEvent.submit(form);
    expect(await within(form).findByRole('alert')).toHaveTextContent('Your writing was not confirmed. Your draft is kept.');
    expect(input).toHaveValue('Writing worth keeping');
    expect(input).not.toHaveAttribute('readonly');
    if (note) {
      expect(screen.getByRole('textbox', { name: 'What this note is about' })).toHaveValue('A lasting fact');
      vi.mocked(NotesApi.create).mockResolvedValueOnce({ id: 'saved' } as Awaited<ReturnType<typeof NotesApi.create>>);
    } else {
      expect(screen.getByRole('button', { name: 'Mood 4 out of 5' })).toHaveAttribute('aria-pressed', 'true');
      vi.mocked(JournalApi.create).mockResolvedValueOnce({ id: 'saved' } as Awaited<ReturnType<typeof JournalApi.create>>);
    }
    fireEvent.submit(form);
    await waitFor(() => expect(input).toHaveValue(''));
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenLastCalledWith(note ? { title: 'A lasting fact', body: 'Writing worth keeping', pinned: true } : { body: 'Writing worth keeping', mood: 4 }, expect.anything());
  });
}
