'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Send, X } from 'lucide-react';
import { useBrainDump } from '@/lib/hooks/ai';
import { errorMessage } from '@/lib/api';
import { useToast } from '@/components/ui';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { summarizeToolRuns } from '@/components/atlas/CommandBar';

/** Time-window context attached by tapping an Open gap on the Day Canvas. */
export interface CaptureContext {
  /** Shown in the chip, e.g. "5:00–6:30 PM". */
  label: string;
  /** Appended (parenthesised) to the brain-dump text so the AI files it into the window. */
  hint: string;
}

/**
 * The universal capture box — Atlas's front door. Type anything in plain words
 * ("gym at 6", "call mom tomorrow", "feeling good today"), hit Enter, and the
 * AI files it into the right domain. Start with "?" to ask instead of file
 * (opens the chat rail). No commands, no menus — anyone can just type.
 */
export function HomeCapture({
  examples,
  autoFocus = false,
  context = null,
  onClearContext,
  focusToken = 0,
}: {
  examples?: string[];
  autoFocus?: boolean;
  context?: CaptureContext | null;
  onClearContext?: () => void;
  focusToken?: number;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const brainDump = useBrainDump();
  const { toast } = useToast();
  const { openChat } = useAtlasUi();
  const qc = useQueryClient();

  // A gap tap bumps focusToken → pull the cursor into the box.
  useEffect(() => {
    if (focusToken > 0) inputRef.current?.focus();
  }, [focusToken]);

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

    // Carry the tapped time window to the AI so it files into that slot.
    const payload = context ? `${trimmed} (${context.hint})` : trimmed;
    brainDump.mutate(payload, {
      onSuccess: (res) => {
        const ran = res.toolExecutions.filter((t) => t.ok).map((t) => t.name);
        toast(ran.length > 0 ? `Filed: ${summarizeToolRuns(ran)}` : res.content.slice(0, 140), 'success');
        setText('');
        onClearContext?.();
        // The filed items are new canvas/feed rows — refresh immediately.
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
      {context && (
        <div className="capture-context" role="status">
          <span>Planning {context.label}</span>
          <button
            type="button"
            className="capture-context-clear"
            aria-label="Clear time window"
            onClick={() => onClearContext?.()}
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      )}
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
          placeholder={
            context
              ? `What should happen ${context.label}?`
              : 'Capture anything — a task, a thought, an event. Start with ? to ask.'
          }
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
