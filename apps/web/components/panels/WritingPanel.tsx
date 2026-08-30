'use client';

import { useMemo, useState } from 'react';
import { Pin } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useCreateJournalEntry, useJournal, useUpdateJournalEntry } from '@/lib/hooks/journal';
import { useCreateNote, useDeleteNote, useNotes, useUpdateNote } from '@/lib/hooks/notes';
import { WrittenCard, type Written } from './WrittenCard';
import {
  Button,
  Card,
  CardListSkeleton,
  EmptyState,
  ErrorState,
  Input,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { useSubmitLatch } from '@/lib/hooks/submit-latch';

const MOODS = [1, 2, 3, 4, 5];

/**
 * One place to write.
 *
 * Journal and Notes were separate destinations sitting side by side, and from
 * the outside nothing distinguished them — one is dated and one is not, and
 * neither page said so. That is a decision the product was making the user take
 * before they could write a sentence down.
 *
 * So there is one box now, and the difference is expressed as what it is: a
 * question about whether this is *how today went* or *something Atlas should
 * always know*. The two tables are untouched — journal entries are still
 * journal entries and notes are still notes, which matters because the AI reads
 * pinned notes as standing context and mood only makes sense on a dated entry.
 * The merge is in the interface, where the confusion was.
 */
export function WritingPanel() {
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [remember, setRemember] = useState(false);

  const journalQuery = useJournal();
  const notesQuery = useNotes();
  const createEntry = useCreateJournalEntry();
  const createNote = useCreateNote();
  const removeNote = useDeleteNote();
  const updateEntry = useUpdateJournalEntry();
  const updateNote = useUpdateNote();
  const latch = useSubmitLatch();

  const failure =
    createEntry.error ??
    createNote.error ??
    removeNote.error ??
    updateEntry.error ??
    updateNote.error;
  const error = failure ? errorMessage(failure, 'Could not save that') : null;

  const written = useMemo<Written[]>(() => {
    const entries: Written[] = (journalQuery.data ?? []).map((d) => ({
      kind: 'entry',
      at: d.entryDate,
      data: d,
    }));
    const notes: Written[] = (notesQuery.data ?? []).map((d) => ({
      kind: 'note',
      at: d.createdAt,
      data: d,
    }));
    return [...entries, ...notes].sort((a, b) => b.at.localeCompare(a.at));
  }, [journalQuery.data, notesQuery.data]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    latch((release) => {
      const done = {
        onSettled: release,
        onSuccess: () => {
          setBody('');
          setTitle('');
          setMood(null);
          setRemember(false);
        },
      };
      if (remember) {
        // Pinned, because "Atlas should remember this" and "keep it in the
        // model's standing context" are the same intent said two ways.
        createNote.mutate({ title: title.trim() || undefined, body: text, pinned: true }, done);
      } else {
        createEntry.mutate({ body: text, mood: mood ?? undefined }, done);
      }
    });
  }

  const busy = createEntry.isPending || createNote.isPending;
  const savingEdit = updateEntry.isPending || updateNote.isPending;
  const loading = journalQuery.isPending || notesQuery.isPending;
  const failed = journalQuery.isError || notesQuery.isError;

  return (
    <>
      <PageHeader title="Writing" subtitle="How today went, and anything Atlas should remember." />

      <Card stack>
        <form className="stack" onSubmit={save} noValidate>
          {remember && (
            <Input
              placeholder="What is this about? — e.g. 'My knee', 'Sarah'"
              aria-label="What this note is about"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
          {/* One stable accessible name. Swapping it when the checkbox flips
              renames the field under anyone using a screen reader mid-sentence,
              and it makes the control impossible to address reliably. The
              placeholder carries the mode instead. */}
          <Textarea
            rows={3}
            placeholder={
              remember
                ? 'A durable fact — something that stays true after today.'
                : 'How did today go?'
            }
            aria-label="What are you writing?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          {/* Mood belongs to a day, not to a standing fact. Offering it on a
              note would invite mood data that no trend can ever use. */}
          {!remember && (
            <div className="row wr-moods" role="group" aria-label="How was today?">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`wr-mood ${mood === m ? 'on' : ''}`}
                  aria-pressed={mood === m}
                  aria-label={`Mood ${m} out of 5`}
                  onClick={() => setMood((cur) => (cur === m ? null : m))}
                >
                  {m}
                </button>
              ))}
              <span className="muted" style={{ fontSize: 12 }}>
                out of 5, optional
              </span>
            </div>
          )}

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label className="row muted" style={{ gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                aria-label="Atlas should always remember this, not just today"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Atlas should always remember this
            </label>
            <Button type="submit" disabled={!body.trim() || busy}>
              Save
            </Button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      </Card>

      {/* Named, so "did this actually save" can be asked of the LIST rather than
          of any `.card` on the page. React mirrors a controlled textarea's value
          into the element's text content, so `.card` + hasText matched the
          composer itself — the assertion meant to prove a write happened passed
          the instant the text was typed, and the test then navigated away and
          cancelled the request it was supposed to be waiting for. */}
      <div className="stack wr-list" style={{ marginTop: 14 }}>
        {loading && <CardListSkeleton cards={2} lines={2} />}
        {failed && (
          <ErrorState
            message="Failed to load your writing"
            onRetry={() => {
              void journalQuery.refetch();
              void notesQuery.refetch();
            }}
          />
        )}
        {!loading && !failed && written.length === 0 && (
          <EmptyState
            icon={Pin}
            title="Nothing written yet"
            hint="Write how today went, or tick the box to record something Atlas should always know."
          />
        )}

        {written.map((w) => (
          <WrittenCard
            key={`${w.kind}-${w.data.id}`}
            item={w}
            busy={savingEdit}
            onSaveEntry={(id, input, done) =>
              updateEntry.mutate({ id, ...input }, { onSuccess: done })
            }
            onSaveNote={(id, input, done) => updateNote.mutate({ id, ...input }, { onSuccess: done })}
            onDeleteNote={(id) => removeNote.mutate(id)}
          />
        ))}
      </div>
    </>
  );
}
