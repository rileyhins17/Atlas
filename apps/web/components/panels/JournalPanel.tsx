'use client';

import { useCallback, useEffect, useState } from 'react';
import type { JournalDTO } from '@atlas/shared';
import { ApiError, JournalApi } from '@/lib/api';

const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];

export function JournalPanel() {
  const [entries, setEntries] = useState<JournalDTO[]>([]);
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await JournalApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load journal');
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
      await JournalApi.create({ body: body.trim(), mood: mood ?? undefined });
      setBody('');
      setMood(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save entry');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-title">Journal</div>
      <form className="card stack" onSubmit={save}>
        <textarea
          className="input"
          rows={3}
          placeholder="What's on your mind today?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 6 }}>
            {MOODS.map((m, i) => (
              <button
                type="button"
                key={m}
                className={`btn ghost`}
                style={{ fontSize: 20, opacity: mood === i + 1 ? 1 : 0.4 }}
                onClick={() => setMood(i + 1)}
                aria-label={`mood ${i + 1}`}
              >
                {m}
              </button>
            ))}
          </div>
          <button className="btn" type="submit" disabled={busy}>
            Save
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>

      <div className="stack" style={{ marginTop: 14 }}>
        {entries.map((e) => (
          <div key={e.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {e.entryDate.slice(0, 10)}
              </span>
              {e.mood && <span>{MOODS[e.mood - 1]}</span>}
            </div>
            <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{e.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}
