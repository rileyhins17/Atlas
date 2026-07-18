'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { useCreateNote, useDeleteNote, useNotes } from '@/lib/hooks/notes';
import { Pin, StickyNote, X } from 'lucide-react';
import { Button, Card, CardListSkeleton, EmptyState, ErrorState, IconButton, Input, Textarea } from '@/components/ui';

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
      <h2 className="section-title">Notes</h2>
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
        {notes.map((n) => (
          <Card key={n.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong className="row" style={{ gap: 6 }}>
                {n.pinned && <Pin size={14} aria-label="Pinned" className="pin-icon" />}
                {n.title ?? 'Note'}
              </strong>
              <IconButton
                label={`Delete note "${n.title ?? 'Note'}"`}
                onClick={() => remove.mutate(n.id)}
              >
                <X size={16} aria-hidden />
              </IconButton>
            </div>
            <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{n.body}</div>
          </Card>
        ))}
      </div>
    </>
  );
}
