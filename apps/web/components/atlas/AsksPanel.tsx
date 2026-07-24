'use client';

import { useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import type { AiQuestionDTO } from '@atlas/shared';
import { Bell, Check, Sparkles, X } from 'lucide-react';
import { useAiQuestions, useAnswerQuestion, useDismissQuestion } from '@/lib/hooks/ai-questions';
import { Button, IconButton, Input } from '@/components/ui';

/**
 * "Atlas wants to know" — the self-curation loop, reachable from every page via
 * the bell instead of taking up room on Today.
 *
 * The copy leads with the payoff on purpose: answering these is the single
 * highest-leverage thing a user can do for their own experience, and that isn't
 * obvious unless you say it.
 */
export function AsksBell() {
  const [open, setOpen] = useState(false);
  const questions = useAiQuestions();
  const count = questions.data?.length ?? 0;

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Trigger asChild>
        <IconButton label={count > 0 ? `Atlas has ${count} question(s)` : 'Atlas has no questions'}>
          <span className="asks-bell">
            <Bell size={17} aria-hidden />
            {count > 0 && <span className="asks-badge">{count > 9 ? '9+' : count}</span>}
          </span>
        </IconButton>
      </RadixDialog.Trigger>

      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content className="asks-panel" aria-describedby={undefined}>
          <header className="asks-panel-head">
            <div>
              <RadixDialog.Title className="asks-panel-title">
                <Sparkles size={15} aria-hidden /> Answer these and Atlas plans your days better
              </RadixDialog.Title>
              <p className="asks-panel-sub">
                Every answer sharpens your briefs, reminders and suggestions.
              </p>
            </div>
            <RadixDialog.Close asChild>
              <IconButton label="Close">
                <X size={17} aria-hidden />
              </IconButton>
            </RadixDialog.Close>
          </header>

          <div className="asks-panel-body">
            {count === 0 ? (
              <p className="asks-empty">
                Nothing to ask right now — Atlas will ask when it spots a gap.
              </p>
            ) : (
              questions.data?.map((q) => <AskCard key={q.id} question={q} />)
            )}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function AskCard({ question }: { question: AiQuestionDTO }) {
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const answer = useAnswerQuestion();
  const dismiss = useDismissQuestion();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || answer.isPending) return;
    answer.mutate({ id: question.id, answer: text }, { onSuccess: () => setSaved(true) });
  }

  // Confirm what the answer bought them before the row disappears on refetch.
  if (saved) {
    return (
      <div className="ask-card ask-card-saved">
        <Check size={15} aria-hidden />
        Atlas learned something new.
      </div>
    );
  }

  return (
    <form className="ask-card" onSubmit={submit}>
      <p className="ask-question">{question.question}</p>
      {question.rationale && <p className="ask-rationale">{question.rationale}</p>}
      <div className="ask-actions">
        <Input
          placeholder="Your answer…"
          aria-label={`Answer: ${question.question}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" disabled={!draft.trim() || answer.isPending}>
          {answer.isPending ? 'Saving…' : 'Answer'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => dismiss.mutate(question.id)}
          disabled={dismiss.isPending}
        >
          Dismiss
        </Button>
      </div>
    </form>
  );
}
