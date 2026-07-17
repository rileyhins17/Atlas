'use client';

import { useCallback, useEffect, useState } from 'react';
import type { NoteDTO } from '@atlas/shared';
import { ApiError, NotesApi } from '@/lib/api';

export function NotesPanel() {
  const [notes, setNotes] = useState<NoteDTO[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setNotes(await NotesApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load notes');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await NotesApi.create({ title: title.trim() || undefined, body: body.trim(), pinned });
      setTitle('');
      setBody('');
      setPinned(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save note');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-title">Notes — what Atlas should know about you</div>
      <form className="card stack" onSubmit={save}>
        <input
          className="input"
          placeholder="Title (optional) — e.g. 'My goals', 'Sarah'"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="input"
          rows={2}
          placeholder="A durable fact about you, your people, or your context…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <label className="row muted" style={{ gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            Pin (always in Atlas&apos;s context)
          </label>
          <button className="btn" type="submit" disabled={busy}>
            Save
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>

      <div className="stack" style={{ marginTop: 14 }}>
        {notes.map((n) => (
          <div key={n.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>
                {n.pinned && '📌 '}
                {n.title ?? 'Note'}
              </strong>
              <button className="btn ghost" onClick={() => NotesApi.remove(n.id).then(load)}>
                ✕
              </button>
            </div>
            <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{n.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}
