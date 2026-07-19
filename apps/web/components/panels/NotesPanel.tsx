'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { useCreateNote, useDeleteNote, useNotes } from '@/lib/hooks/notes';
import { Pin, StickyNote, X } from 'lucide-react';
import { Button, Card, CardListSkeleton, EmptyState, ErrorState, IconButton, Input, Textarea } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';

function NoteCard({
  note,
  onRemove,
}: {
  note: { id: string; title: string | null; body: string; pinned: boolean };
  onRemove: () => void;
}) {
  return (
    <Card className={note.pinned ? 'note-card pinned' : 'note-card'}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong className="row" style={{ gap: 6, minWidth: 0 }}>
          {note.pinned && <Pin size={14} aria-label="Pinned" className="pin-icon" />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {note.title ?? 'Note'}
          </span>
        </strong>
        <IconButton label={`Delete note "${note.title ?? 'Note'}"`} onClick={onRemove}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
      <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>
        {note.body}
      </div>
    </Card>
  );
}

export function NotesPanel() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const notesQuery = useNotes();
  const create = useCreateNote();
  const remove = useDeleteNote();

  const notes = notesQuery.data ?? [];
  const error = create.error
    ? errorMessage(create.error, 'Failed to save note')
    : remove.error
      ? errorMessage(remove.error, 'Failed to delete note')
      : null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    create.mutate(
      { title: title.trim() || undefined, body: body.trim(), pinned },
      {
        onSuccess: () => {
          setTitle('');
          setBody('');
          setPinned(false);
        },
      },
    );
  }

  return (
    <>
      <PageHeader title="Notes" subtitle="What Atlas should know about you." />
      <Card stack>
        <form className="stack" onSubmit={save}>
          <Input
            placeholder="Title (optional) — e.g. 'My goals', 'Sarah'"
            aria-label="Note title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            rows={2}
            placeholder="A durable fact about you, your people, or your context…"
            aria-label="Note body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label className="row muted" style={{ gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pin (always in Atlas&apos;s context)
            </label>
            <Button type="submit" disabled={create.isPending}>
              Save
            </Button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      </Card>

      <div className="stack" style={{ marginTop: 14 }}>
        {notesQuery.isPending && <CardListSkeleton cards={2} lines={1} />}
        {notesQuery.isError && (
          <ErrorState
            message={errorMessage(notesQuery.error, 'Failed to load notes')}
            onRetry={() => void notesQuery.refetch()}
          />
        )}
        {notesQuery.isSuccess && notes.length === 0 && (
          <EmptyState
            icon={StickyNote}
            title="No notes yet"
            hint="Save durable facts about you and your people — pinned notes stay in Atlas's context."
          />
        )}
        {notes.some((n) => n.pinned) && (
          <>
            <h2 className="section-title" style={{ margin: '4px 2px 0' }}>
              Pinned — always in Atlas&apos;s mind
            </h2>
            <div className="notes-grid">
              {notes
                .filter((n) => n.pinned)
                .map((n) => (
                  <NoteCard key={n.id} note={n} onRemove={() => remove.mutate(n.id)} />
                ))}
            </div>
          </>
        )}
        {notes.some((n) => !n.pinned) && (
          <>
            {notes.some((n) => n.pinned) && (
              <h2 className="section-title" style={{ margin: '10px 2px 0' }}>
                Everything else
              </h2>
            )}
            <div className="notes-grid">
              {notes
                .filter((n) => !n.pinned)
                .map((n) => (
                  <NoteCard key={n.id} note={n} onRemove={() => remove.mutate(n.id)} />
                ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
