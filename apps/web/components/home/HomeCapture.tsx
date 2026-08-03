'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Send, X } from 'lucide-react';
import { useBrainDump } from '@/lib/hooks/ai';
import { applyUndoBatch, errorMessage } from '@/lib/api';
import { detectCaptureIntent, stripAskPrefix } from '@/lib/capture-intent';
import { useToast } from '@/components/ui';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { useCaptureFallback } from '@/lib/hooks/capture-fallback';
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
 * ("gym at 6", "call mom tomorrow", "how am I doing?"), hit Enter, and Atlas
 * works out whether to file it or answer it.
 *
 * There is no syntax to learn. Asking used to require a literal "?" prefix,
 * which is invisible knowledge: nothing on screen taught it, and forgetting it
 * silently filed your question as a task. Now intent is detected, and when the
 * guess is wrong the toast offers the other reading in one tap — which is what
 * makes a heuristic acceptable here.
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
  const { openChat, recordChanges } = useAtlasUi();
  const fileLocally = useCaptureFallback();
  const qc = useQueryClient();

  // A gap tap bumps focusToken → pull the cursor into the box.
  useEffect(() => {
    if (focusToken > 0) inputRef.current?.focus();
  }, [focusToken]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || brainDump.isPending) return;

    if (detectCaptureIntent(trimmed) === 'ask') {
      const ask = stripAskPrefix(trimmed);
      if (ask) {
        openChat(ask);
        setText('');
      }
      return;
    }

    file(trimmed);
  }

  /** Send text to be filed, and offer the other reading if that was wrong. */
  function file(trimmed: string) {
    // Carry the tapped time window to the AI so it files into that slot.
    const payload = context ? `${trimmed} (${context.hint})` : trimmed;
    brainDump.mutate(payload, {
      onSuccess: (res) => {
        const changes = res.toolExecutions.filter((t) => t.ok);
        const ran = changes.map((t) => t.name);
        // Prefer the server's plain-language summary; fall back to the domain
        // names only when a tool did not supply one.
        const said =
          changes.map((t) => t.summary).filter(Boolean).join(' · ') ||
          (ran.length > 0 ? `Filed: ${summarizeToolRuns(ran)}` : res.content.slice(0, 140));
        // Undo beats "ask instead" when something was actually written: the
        // steps are server-built inverses of the rows just created, and until
        // now they were generated on every AI write and thrown away.
        const undoable = changes.map((t) => t.undo).filter((u): u is NonNullable<typeof u> => Boolean(u));
        // The toast is the immediate offer; the strip is the record. A toast
        // you miss is a change you never knew about.
        recordChanges(
          changes.map((t) => ({
            summary: t.summary || t.name,
            undo: t.undo ? [t.undo] : [],
          })),
        );
        toast(
          said,
          'success',
          undoable.length > 0
            ? {
                label: 'Undo',
                onClick: () => {
                  void applyUndoBatch(undoable).then(() => {
                    toast('Undone', 'info');
                    void qc.invalidateQueries();
                  });
                },
              }
            : { label: 'Ask instead', onClick: () => openChat(trimmed) },
        );
        setText('');
        onClearContext?.();
        // Invalidate EVERYTHING, not just the timeline.
        //
        // Capture can write to any domain — one sentence can create an event,
        // a task and a habit check-in. Scoping this to ['timeline'] meant
        // telling Atlas "I should be studying 8-9:30" wrote the event, showed
        // a success toast, and left Today still saying "Nothing scheduled"
        // until a manual reload. The write is cheap; the wrong cache is not.
        void qc.invalidateQueries();
      },
      onError: (err) => {
        // No AI key yet? File it locally rather than answering a new user's
        // very first capture with an error.
        void fileLocally(trimmed, err).then(
          (said) => {
            if (said) toast(said, 'success');
            else toast(errorMessage(err, 'Atlas could not file that'), 'error');
          },
          () => toast(errorMessage(err, 'Atlas could not file that'), 'error'),
        );
      },
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
              : 'Type anything — "gym at 6", "call mom tomorrow", "how am I doing?"'
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
