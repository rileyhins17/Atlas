'use client';

import { useState } from 'react';
import { AiApi, ApiError } from '@/lib/api';

export function BrainDumpPanel() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function organize(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await AiApi.brainDump(text.trim());
      const created = res.toolExecutions.filter((t) => t.ok).map((t) => t.name);
      setResult(
        created.length > 0
          ? `Filed: ${created.join(', ')}${res.content ? ` — ${res.content}` : ''}`
          : res.content || 'Nothing actionable found.',
      );
      setText('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to organize');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={organize} style={{ marginBottom: 16 }}>
      <div className="section-title" style={{ margin: 0 }}>Brain dump</div>
      <textarea
        className="input"
        rows={3}
        placeholder="Paste anything messy — Atlas will sort it into tasks, events, journal, or notes…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Organizing…' : 'Organize'}
      </button>
      {result && <div className="muted" style={{ fontSize: 13 }}>{result}</div>}
      {error && <div className="error">{error}</div>}
    </form>
  );
}
