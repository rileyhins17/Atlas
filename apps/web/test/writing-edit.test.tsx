import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    JournalApi: {
      list: vi.fn().mockResolvedValue([
        {
          id: 'j1',
          entryDate: '2026-08-20T00:00:00.000Z',
          body: 'wnet for a run',
          mood: 4,
          tags: [],
          createdAt: '2026-08-20T10:00:00.000Z',
        },
      ]),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    NotesApi: {
      list: vi.fn().mockResolvedValue([
        {
          id: 'n1',
          title: 'My knee',
          body: 'left knee, not right',
          tags: [],
          pinned: true,
          createdAt: '2026-08-19T10:00:00.000Z',
          updatedAt: '2026-08-19T10:00:00.000Z',
        },
      ]),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});
import { JournalApi, NotesApi } from '@/lib/api';
import { WritingPanel } from '@/components/panels/WritingPanel';
import { ToastProvider } from '@/components/ui';

/**
 * Both halves of the writing surface are now correctable. Before this, notes
 * had a PATCH on the API with no client method and journal had no update at
 * any layer, so you could fix a note's typo but not yesterday's entry — with
 * nothing on screen explaining the difference.
 *
 * These type into the box rather than setting its value. `fill()`-style
 * assignment has passed against genuinely broken inputs in this repo before:
 * it dispatches one event a React commit can miss, leaving state empty so the
 * submit handler returns early and NO request is sent, while the DOM still
 * reads back the text you asked for.
 */
function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

/**
 * Open the editor on the card containing `text`.
 *
 * Scoped to the card rather than picked out of the page, because BOTH rows have
 * an "Edit …" button and a name-only query matches both. Scoping by position in
 * the list would work today and break the first time sorting changes; the body
 * text is what actually identifies the row.
 */
async function openEditorFor(user: ReturnType<typeof userEvent.setup>, text: string) {
  const card = (await screen.findByText(text)).closest('.card');
  if (!card) throw new Error(`no card around "${text}"`);
  const scope = within(card as HTMLElement);
  await user.click(scope.getByRole('button', { name: /^Edit / }));
  return scope;
}

describe('editing what you have written', () => {
  it('saves a corrected journal entry', async () => {
    const user = userEvent.setup();
    wrap(<WritingPanel />);

    const card = await openEditorFor(user, 'wnet for a run');
    const box = card.getByRole('textbox', { name: /^Edit / });
    await user.clear(box);
    await user.type(box, 'went for a run');

    await user.click(card.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(JournalApi.update).toHaveBeenCalledWith('j1', {
        body: 'went for a run',
        mood: 4,
      }),
    );
  });

  it('keeps the mood when only the text is corrected', async () => {
    const user = userEvent.setup();
    wrap(<WritingPanel />);

    const card = await openEditorFor(user, 'wnet for a run');
    const box = card.getByRole('textbox', { name: /^Edit / });
    await user.clear(box);
    await user.type(box, 'a different day');
    await user.click(card.getByRole('button', { name: 'Save changes' }));

    // Mood is a separate control; editing prose must not silently drop it.
    await waitFor(() => expect(JournalApi.update).toHaveBeenCalled());
    const [, payload] = (JournalApi.update as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]!;
    expect((payload as { mood: number | null }).mood).toBe(4);
  });

  it('sends nothing when the edit is cancelled', async () => {
    const user = userEvent.setup();
    wrap(<WritingPanel />);

    const card = await openEditorFor(user, 'wnet for a run');
    await user.type(card.getByRole('textbox', { name: /^Edit / }), ' — an afterthought');
    await user.click(card.getByRole('button', { name: 'Cancel' }));

    expect(JournalApi.update).not.toHaveBeenCalled();
    // …and the original text is back on screen, not the abandoned draft.
    expect(screen.getByText('wnet for a run')).toBeTruthy();
  });

  it('reopens an edit from the saved row, not from the abandoned draft', async () => {
    const user = userEvent.setup();
    wrap(<WritingPanel />);

    let card = await openEditorFor(user, 'wnet for a run');
    await user.type(card.getByRole('textbox', { name: /^Edit / }), ' rubbish');
    await user.click(card.getByRole('button', { name: 'Cancel' }));

    card = await openEditorFor(user, 'wnet for a run');
    const box = card.getByRole('textbox', { name: /^Edit / });
    expect((box as HTMLTextAreaElement).value).toBe('wnet for a run');
  });

  it('will not save an entry emptied to nothing', async () => {
    const user = userEvent.setup();
    wrap(<WritingPanel />);

    const card = await openEditorFor(user, 'wnet for a run');
    await user.clear(card.getByRole('textbox', { name: /^Edit / }));

    // An empty body is a delete wearing an edit's clothes, and the API rejects
    // it — so the control has to be shut before the request is made.
    expect(card.getByRole('button', { name: 'Save changes' })).toHaveProperty('disabled', true);
    expect(JournalApi.update).not.toHaveBeenCalled();
  });

  it('saves a corrected note, title and all', async () => {
    const user = userEvent.setup();
    wrap(<WritingPanel />);

    const card = await openEditorFor(user, 'left knee, not right');

    const title = card.getByRole('textbox', { name: 'What this note is about' });
    await user.clear(title);
    await user.type(title, 'My left knee');

    const box = card.getByRole('textbox', { name: 'Edit My knee' });
    await user.clear(box);
    await user.type(box, 'left knee only');

    await user.click(card.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(NotesApi.update).toHaveBeenCalledWith('n1', {
        title: 'My left knee',
        body: 'left knee only',
      }),
    );
  });
});
