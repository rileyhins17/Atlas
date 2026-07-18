'use client';

import { useState } from 'react';
import type { AiQuestionDTO } from '@atlas/shared';
import { Sparkles } from 'lucide-react';
import { useAiQuestions, useAnswerQuestion, useDismissQuestion } from '@/lib/hooks/ai-questions';
import { Button, Card, Input } from '@/components/ui';

// The self-curation loop: questions Atlas is asking, surfaced everywhere.
export function AtlasAsks() {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const questionsQuery = useAiQuestions();
  const answerMutation = useAnswerQuestion();
  const dismissMutation = useDismissQuestion();

  const questions = questionsQuery.data ?? [];

  function answer(q: AiQuestionDTO) {
    const text = (draft[q.id] ?? '').trim();
    if (!text) return;
    answerMutation.mutate(
      { id: q.id, answer: text },
      { onSuccess: () => setDraft((d) => ({ ...d, [q.id]: '' })) },
    );
  }

  if (questions.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <h2 className="section-title asks-title" style={{ marginLeft: 4 }}>
        <Sparkles size={15} aria-hidden />
        Atlas wants to know
      </h2>
      <div className="stack">
        {questions.map((q) => (
          <Card key={q.id} stack style={{ borderColor: 'var(--brand-alt)' }}>
            <div>{q.question}</div>
            {q.rationale && <div className="muted" style={{ fontSize: 12 }}>{q.rationale}</div>}
            <div className="row">
              <Input
                placeholder="Your answer…"
                aria-label={`Answer: ${q.question}`}
                value={draft[q.id] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))}
              />
              <Button onClick={() => answer(q)}>Answer</Button>
              <Button variant="ghost" onClick={() => dismissMutation.mutate(q.id)}>
                Dismiss
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
