'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useChat } from '@/lib/hooks/ai';
import { IconButton, Kbd, Spinner } from '@/components/ui';
import { useAtlasUi } from './AtlasUiProvider';

/**
 * The summonable right rail (⌘J): chat over your whole life from any screen.
 * The transcript lives in AtlasUiProvider so closing the rail keeps the
 * conversation; the command bar's "Ask Atlas" lands here as a pendingAsk.
 */
export function ChatRail() {
  const { chatOpen, setChatOpen, messages, setMessages, consumePendingAsk } = useAtlasUi();
  const chat = useChat();
  const [draft, setDraft] = useState('');
  const [lastTools, setLastTools] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = useCallback(
    (text: string) => {
      if (!text || chat.isPending) return;
      setMessages((m) => [...m, { role: 'user', content: text }]);
      chat.mutate(
        { message: text, history: messages },
        {
          onSuccess: (res) => {
            setMessages((m) => [...m, { role: 'assistant', content: res.content }]);
            setLastTools(res.toolExecutions.filter((t) => t.ok).map((t) => t.name));
          },
          onError: (err) => {
            setMessages((m) => [
              ...m,
              { role: 'assistant', content: `Something went wrong: ${errorMessage(err, 'chat failed')}` },
            ]);
          },
        },
      );
    },
    [chat, messages, setMessages],
  );

  // A question queued from the command bar sends itself when the rail opens.
  useEffect(() => {
    if (!chatOpen) return;
    const ask = consumePendingAsk();
    if (ask) send(ask);
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on open only
  }, [chatOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, chat.isPending]);

  // Esc closes the rail (it's a non-modal panel, so no Radix focus trap).
  useEffect(() => {
    if (!chatOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setChatOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatOpen, setChatOpen]);

  if (!chatOpen) return null;

  return (
    <aside className="chat-rail" aria-label="Atlas chat">
      <header className="chat-rail-head">
        <span className="row" style={{ gap: 8 }}>
          <MessageCircle size={16} aria-hidden style={{ color: 'var(--brand)' }} />
          <strong>Atlas</strong>
          <Kbd>⌘J</Kbd>
        </span>
        <IconButton label="Close chat" onClick={() => setChatOpen(false)}>
          <X size={16} aria-hidden />
        </IconButton>
      </header>

      <div className="chat-rail-log" role="log" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 && (
          <div className="chat-rail-empty">
            <p className="muted" style={{ margin: 0 }}>
              Chat over your whole life — Atlas sees your tasks, calendar, habits, journal and
              notes, and can act on them.
            </p>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Try “what should I focus on today?” or “move my gym day”.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role === 'user' ? 'user' : 'assistant'}`}>
            {m.content}
          </div>
        ))}
        {chat.isPending && (
          <div className="chat-bubble assistant row" style={{ gap: 8 }}>
            <Spinner size={13} /> thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {lastTools.length > 0 && (
        <div className="chat-rail-tools muted">Atlas ran: {lastTools.join(', ')}</div>
      )}

      <form
        className="chat-rail-composer"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setDraft('');
          send(text);
        }}
      >
        <input
          ref={inputRef}
          className="input"
          placeholder="Message Atlas…"
          aria-label="Message Atlas"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <IconButton label="Send" type="submit" disabled={chat.isPending || !draft.trim()}>
          <Send size={16} aria-hidden />
        </IconButton>
      </form>
    </aside>
  );
}
