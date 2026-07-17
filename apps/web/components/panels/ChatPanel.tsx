'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessageDTO } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useChat } from '@/lib/hooks/ai';
import { Button, Card, Input } from '@/components/ui';

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [draft, setDraft] = useState('');
  const [lastTools, setLastTools] = useState<string[]>([]);
  const chat = useChat();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

  const error = chat.error ? errorMessage(chat.error, 'Chat failed') : null;

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || chat.isPending) return;
    setDraft('');
    const history = messages;
    setMessages((m) => [...m, { role: 'user', content: text }]);
    chat.mutate(
      { message: text, history },
      {
        onSuccess: (res) => {
          setMessages((m) => [...m, { role: 'assistant', content: res.content }]);
          setLastTools(res.toolExecutions.filter((t) => t.ok).map((t) => t.name));
        },
      },
    );
  }

  return (
    <Card stack style={{ marginBottom: 16 }}>
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
              background: m.role === 'user' ? 'var(--brand-alt)' : 'var(--surface-inset)',
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
        <Input
          placeholder="Message Atlas…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" disabled={chat.isPending}>
          {chat.isPending ? '…' : 'Send'}
        </Button>
      </form>
      {error && <div className="error">{error}</div>}
    </Card>
  );
}
