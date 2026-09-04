'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Check, Copy, MessageCircle, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useChat } from '@/lib/hooks/ai';
import { IconButton, Kbd } from '@/components/ui';
import { useAtlasUi } from './AtlasUiProvider';
import { Markdown } from './Markdown';

/** What Atlas did in response to one message, shown with that message. */
interface Turn {
  /** Index into `messages` of the assistant reply these belong to. */
  at: number;
  actions: string[];
  failed: boolean;
}

const SUGGESTIONS = [
  'What should I focus on today?',
  'How has my week actually gone?',
  'Move my gym day to Thursday',
  'What am I forgetting?',
];

/**
 * What Atlas is doing while you wait.
 *
 * The old state was a spinner and the word "thinking…", which is the same thing
 * every chat UI says and tells you nothing. These are the steps this request
 * genuinely goes through — the server reads your domains, searches your own
 * writing for anything relevant, then answers, and may call tools on the way.
 * They advance on a timer because the API returns one response rather than a
 * stream, so this is a description of the work, not a fake progress bar: the
 * last line stays put until the real answer lands.
 */
const STAGES = ['Reading your day', 'Looking through what you have written', 'Working it out'];

function Thinking() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    // Stop at the last one. Cycling forever would imply progress that is not
    // being measured.
    if (stage >= STAGES.length - 1) return;
    const id = setTimeout(() => setStage((s) => s + 1), 1400);
    return () => clearTimeout(id);
  }, [stage]);

  return (
    <div className="chat-msg assistant">
      <div className="chat-avatar" aria-hidden>
        <Sparkles size={13} />
      </div>
      <div className="chat-body">
        <p className="chat-thinking" aria-live="polite">
          <span className="chat-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {STAGES[stage]}
        </p>
      </div>
    </div>
  );
}

/** Copy a reply, and say so. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="chat-act"
      aria-label={done ? 'Copied' : 'Copy this reply'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          // Clipboard denied (insecure context, or the user said no). Saying
          // nothing is better than a scary toast for a convenience button.
        }
      }}
    >
      {done ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

/**
 * The summonable right rail (⌘J): chat over your whole life from any screen.
 * The transcript lives in AtlasUiProvider so closing the rail keeps the
 * conversation; the command bar's "Ask Atlas" lands here as a pendingAsk.
 */
export function ChatRail() {
  const { chatOpen, setChatOpen, messages, setMessages, consumePendingAsk, recordChanges } =
    useAtlasUi();
  const chat = useChat();
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = useCallback(
    (text: string) => {
      if (!text || chat.isPending) return;
      setLastSent(text);
      setMessages((m) => [...m, { role: 'user', content: text }]);
      chat.mutate(
        { message: text, history: messages },
        {
          onSuccess: (res) => {
            const ok = res.toolExecutions.filter((t) => t.ok);
            setMessages((m) => {
              // Attach the actions to THIS reply, by its index. The old UI put
              // them in a single strip under the whole conversation, so after a
              // second question you could no longer tell what caused what.
              setTurns((t) => [
                ...t,
                { at: m.length, actions: ok.map((x) => x.summary || x.name), failed: false },
              ]);
              return [...m, { role: 'assistant', content: res.content }];
            });
            recordChanges(
              ok.map((t) => ({ summary: t.summary || t.name, undo: t.undo ? [t.undo] : [] })),
            );
          },
          onError: (err) => {
            setMessages((m) => {
              setTurns((t) => [...t, { at: m.length, actions: [], failed: true }]);
              return [
                ...m,
                {
                  role: 'assistant',
                  content: errorMessage(err, 'Atlas could not answer that'),
                },
              ];
            });
          },
        },
      );
    },
    [chat, messages, setMessages, recordChanges],
  );

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    send(text);
  };

  // A question queued from the command bar sends itself when the rail opens.
  useEffect(() => {
    if (!chatOpen) return;
    const ask = consumePendingAsk();
    if (ask) send(ask);
    // Focus after paint: the rail mounts with an entrance animation, and a
    // synchronous focus on the just-mounted input can be dropped (seen as a
    // headless-CI flake where the input renders but never takes focus). A
    // post-paint frame lands it reliably.
    inputRef.current?.focus();
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on open only
  }, [chatOpen]);

  // Follow the conversation, but never yank the view away from someone who has
  // scrolled up to re-read something.
  useEffect(() => {
    if (atBottom) endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, chat.isPending, atBottom]);

  // The composer grows with the message instead of scrolling a one-line box.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  /**
   * Keep the rail inside the VISUAL viewport, not the layout one.
   *
   * `position: fixed` anchors to the layout viewport, which iOS does not shrink
   * when the keyboard opens — so `bottom: 0` is underneath the keyboard and the
   * composer you are typing into is the one thing you cannot see. Reported from
   * a real phone: the rail opened, the keyboard came up, and the input was
   * gone. visualViewport is the only thing that reports the actual visible box.
   */
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!chatOpen || !vv) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty('--vv-h', `${vv.height}px`);
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.style.removeProperty('--vv-h');
      root.style.removeProperty('--vv-top');
    };
  }, [chatOpen]);

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

  const turnFor = (i: number) => turns.find((t) => t.at === i);

  return (
    <aside className="chat-rail" aria-label="Atlas chat">
      <header className="chat-rail-head">
        <span className="chat-rail-id">
          <MessageCircle size={15} aria-hidden />
          <strong>Atlas</strong>
          <Kbd>⌘J</Kbd>
        </span>
        <span className="row" style={{ gap: 4 }}>
          {messages.length > 0 && (
            <button
              type="button"
              className="chat-act"
              onClick={() => {
                setMessages(() => []);
                setTurns([]);
                setLastSent(null);
              }}
            >
              New chat
            </button>
          )}
          <IconButton label="Close chat" onClick={() => setChatOpen(false)}>
            <X size={16} aria-hidden />
          </IconButton>
        </span>
      </header>

      <div
        className="chat-rail-log"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
        }}
      >
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-mark" aria-hidden>
              <Sparkles size={20} />
            </div>
            <h2 className="chat-empty-title">Ask Atlas anything</h2>
            <p className="chat-empty-sub">
              It can see your tasks, calendar, habits, journal, notes, training and money — and it
              can act on them, not just talk about them.
            </p>
            <div className="chat-suggests">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chat-suggest" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const turn = turnFor(i);
          if (m.role === 'user') {
            return (
              <div key={i} className="chat-msg user">
                <div className="chat-bubble user">{m.content}</div>
              </div>
            );
          }
          return (
            <div key={i} className={`chat-msg assistant ${turn?.failed ? 'is-error' : ''}`}>
              <div className="chat-avatar" aria-hidden>
                <Sparkles size={13} />
              </div>
              <div className="chat-body">
                {turn?.failed ? (
                  <p className="chat-error">{m.content}</p>
                ) : (
                  <Markdown text={m.content} />
                )}

                {turn && turn.actions.length > 0 && (
                  <ul className="chat-did" aria-label="What Atlas did">
                    {turn.actions.map((a, k) => (
                      <li key={k}>
                        <Check size={12} aria-hidden />
                        {a}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="chat-acts">
                  {!turn?.failed && <CopyButton text={m.content} />}
                  {/* Retry belongs to a FAILURE, not to the last reply. Offering
                      it under a good answer invites you to spend a model call
                      re-asking a question that was already answered. */}
                  {turn?.failed && i === messages.length - 1 && lastSent && (
                    <button
                      type="button"
                      className="chat-act"
                      onClick={() => {
                        // Drop the failed exchange before retrying, so the
                        // history sent to the model does not contain the error
                        // message as if Atlas had said it.
                        setMessages((prev) => prev.slice(0, -2));
                        setTurns((t) => t.filter((x) => x.at < messages.length - 1));
                        send(lastSent);
                      }}
                    >
                      <RotateCcw size={13} aria-hidden /> Retry
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {chat.isPending && <Thinking />}
        <div ref={endRef} />
      </div>

      {!atBottom && (
        <button
          type="button"
          className="chat-jump"
          onClick={() => {
            endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setAtBottom(true);
          }}
        >
          <ArrowDown size={13} aria-hidden /> Latest
        </button>
      )}

      <form
        className="chat-rail-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          placeholder="Message Atlas…"
          aria-label="Message Atlas"
          value={draft}
          maxLength={4_000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter starts a line. Anything else and a
            // multi-line message is impossible, which is why the old one-line
            // input made people send three fragments instead of one thought.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="submit"
          className="chat-send"
          aria-label="Send"
          disabled={chat.isPending || !draft.trim()}
        >
          <Send size={16} aria-hidden />
        </button>
      </form>
    </aside>
  );
}
