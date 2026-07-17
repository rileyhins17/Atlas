'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessageDTO } from '@atlas/shared';
import { AiApi, ApiError } from '@/lib/api';

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTools, setLastTools] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setDraft('');
    const history = messages;
    setMessages((m) => [...m, { role: 'user', content: text }]);
    try {
      const res = await AiApi.chat(text, history);
      setMessages((m) => [...m, { role: 'assistant', content: res.content }]);
      setLastTools(res.toolExecutions.filter((t) => t.ok).map((t) => t.name));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chat failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack" style={{ marginBottom: 16 }}>
      <div className="section-title" style={{ margin: 0 }}>Chat with your life</div>
      <div className="stack" style={{ maxHeight: 320, overflowY: 'auto', gap: 8 }}>
        {messages.length === 0 && (
          <span className="muted" style={{ fontSize: 13 }}>
            Ask Atlas anything, or tell it to add a task, log a habit, or write a journal entry.
          </span>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? 'var(--accent-2)' : 'var(--surface-2, #f2f2f2)',
              borderRadius: 8,
              padding: '6px 10px',
              maxWidth: '85%',
              whiteSpace: 'pre-wrap',
            }}
          >
            {m.content}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {lastTools.length > 0 && (
        <div className="muted" style={{ fontSize: 12 }}>Atlas ran: {lastTools.join(', ')}</div>
      )}
      <form className="row" onSubmit={send}>
        <input
          className="input"
          placeholder="Message Atlas…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? '…' : 'Send'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
