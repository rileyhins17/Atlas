'use client';

import { useState } from 'react';
import type { JournalDTO, NoteDTO } from '@atlas/shared';
import { Pencil, Pin, X } from 'lucide-react';
import { Button, Card, IconButton, Input, Textarea } from '@/components/ui';
import { formatDayHeading } from '@/lib/dates';

const MOODS = [1, 2, 3, 4, 5];

export type Written =
  | { kind: 'entry'; at: string; data: JournalDTO }
  | { kind: 'note'; at: string; data: NoteDTO };

export interface WrittenCardProps {
  item: Written;
  busy: boolean;
  onSaveEntry: (
    id: string,
    input: { body: string; mood: number | null },
    done: () => void,
  ) => void;
  onSaveNote: (id: string, input: { title: string | null; body: string }, done: () => void) => void;
  onDeleteNote: (id: string) => void;
}

/**
 * One written thing, readable and editable in place.
 *
 * Editing lived only on the API until now: notes had `PATCH` and no client
 * method, journal had no update at any layer. Since both are written through
 * one surface, half of what you wrote being correctable was a product
 * inconsistency, not a missing function — you could fix a note's typo and not
 * yesterday's entry, with nothing on screen explaining why.
 *
 * Edit state is per-card and local. Lifting it to the panel would mean one
 * draft shared by every row, so opening a second editor would silently discard
 * the first — and the panel already owns enough.
 */
export function WrittenCard({
  item,
  busy,
  onSaveEntry,
  onSaveNote,
  onDeleteNote,
}: WrittenCardProps) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(item.data.body);
  const [mood, setMood] = useState<number | null>(
    item.kind === 'entry' ? item.data.mood : null,
  );
  const [title, setTitle] = useState(item.kind === 'note' ? (item.data.title ?? '') : '');

  function open() {
    // Re-seed from the row every time, so a cancelled edit never leaves a stale
    // draft waiting to reappear on the next open.
    setBody(item.data.body);
    setTitle(item.kind === 'note' ? (item.data.title ?? '') : '');
    setMood(item.kind === 'entry' ? item.data.mood : null);
    setEditing(true);
  }

  function save() {
    const text = body.trim();
    if (!text) return;
    const done = () => setEditing(false);
    if (item.kind === 'entry') onSaveEntry(item.data.id, { body: text, mood }, done);
    else onSaveNote(item.data.id, { title: title.trim() || null, body: text }, done);
  }

  const label = item.kind === 'entry' ? formatDayHeading(new Date(item.at)) : (item.data.title ?? 'Remembered');

  if (editing) {
    return (
      <Card className={item.kind === 'note' ? 'note-card pinned' : undefined} stack>
        {item.kind === 'note' && (
          <Input
            placeholder="What is this about?"
            aria-label="What this note is about"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
        <Textarea
          rows={4}
          aria-label={`Edit ${label}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        {item.kind === 'entry' && (
          <div className="row wr-moods" role="group" aria-label="How was that day?">
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

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
          {/* Not "Save": the composer at the top of the page has one, and two
              controls with the same name on one screen is ambiguous to anyone
              navigating by button name rather than by position. */}
          <Button onClick={save} disabled={!body.trim() || busy}>
            Save changes
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={item.kind === 'note' ? 'note-card pinned' : undefined}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
        {item.kind === 'entry' ? (
          <strong style={{ fontSize: 13 }}>{label}</strong>
        ) : (
          <strong className="row" style={{ gap: 6, minWidth: 0 }}>
            <Pin size={13} aria-label="Always in Atlas's context" className="pin-icon" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </strong>
        )}
        <div className="row" style={{ gap: 2 }}>
          {item.kind === 'entry' && item.data.mood !== null && (
            <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>
              {item.data.mood}/5
            </span>
          )}
          <IconButton label={`Edit "${label}"`} onClick={open}>
            <Pencil size={14} aria-hidden />
          </IconButton>
          {item.kind === 'note' && (
            <IconButton label={`Delete "${label}"`} onClick={() => onDeleteNote(item.data.id)}>
              <X size={15} aria-hidden />
            </IconButton>
          )}
        </div>
      </div>
      <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>
        {item.data.body}
      </div>
    </Card>
  );
}
