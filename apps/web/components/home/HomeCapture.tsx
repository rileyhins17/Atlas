'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { useBrainDump } from '@/lib/hooks/ai';
import { errorMessage } from '@/lib/api';
import { useToast } from '@/components/ui';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { summarizeToolRuns } from '@/components/atlas/CommandBar';

/**
 * The universal capture box — Atlas's front door. Type anything in plain words
 * ("gym at 6", "call mom tomorrow", "feeling good today"), hit Enter, and the
 * AI files it into the right domain. Start with "?" to ask instead of file
 * (opens the chat rail). No commands, no menus — anyone can just type.
 */
export function HomeCapture({ examples, autoFocus = false }: { examples?: string[]; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const brainDump = useBrainDump();
  const { toast } = useToast();
  const { openChat } = useAtlasUi();
  const qc = useQueryClient();

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || brainDump.isPending) return;

    // "?how am I doing" → a question, not a capture: hand it to the chat rail.
    if (trimmed.startsWith('?')) {
      const ask = trimmed.replace(/^\?\s*/, '');
      if (ask) {
        openChat(ask);
        setText('');
      }
      return;
    }

    brainDump.mutate(trimmed, {
      onSuccess: (res) => {
        const ran = res.toolExecutions.filter((t) => t.ok).map((t) => t.name);
        toast(ran.length > 0 ? `Filed: ${summarizeToolRuns(ran)}` : res.content.slice(0, 140), 'success');
        setText('');
        // The filed items are new feed rows — refresh the stream immediately.
        void qc.invalidateQueries({ queryKey: ['timeline'] });
      },
      onError: (err) => toast(errorMessage(err, 'Atlas could not file that'), 'error'),
    });
  }

  function pick(example: string) {
    setText(example);
    inputRef.current?.focus();
  }

  return (
    <div className="home-capture">
      <form
        className="home-capture-box"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          className="home-capture-input"
          placeholder="Capture anything — a task, a thought, an event. Start with ? to ask."
          aria-label="Capture anything"
          rows={1}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="submit"
          className="home-capture-send"
          disabled={!text.trim() || brainDump.isPending}
          aria-label="Capture"
        >
          {brainDump.isPending ? <Loader2 size={18} className="spin" aria-hidden /> : <Send size={18} aria-hidden />}
        </button>
      </form>
      {examples && examples.length > 0 && (
        <div className="home-capture-examples">
          {examples.map((ex) => (
            <button key={ex} type="button" className="capture-chip" onClick={() => pick(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
