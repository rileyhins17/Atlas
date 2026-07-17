'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AiQuestionDTO } from '@atlas/shared';
import { AiQuestionsApi } from '@/lib/api';

// The self-curation loop: questions Atlas is asking, surfaced everywhere.
export function AtlasAsks() {
  const [questions, setQuestions] = useState<AiQuestionDTO[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setQuestions(await AiQuestionsApi.list());
    } catch {
      /* not signed in yet / ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(q: AiQuestionDTO) {
    const text = (draft[q.id] ?? '').trim();
    if (!text) return;
    await AiQuestionsApi.answer(q.id, text);
    setDraft((d) => ({ ...d, [q.id]: '' }));
    await load();
  }

  async function dismiss(q: AiQuestionDTO) {
    await AiQuestionsApi.dismiss(q.id);
    await load();
  }

  if (questions.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="section-title" style={{ marginLeft: 4 }}>
        ✦ Atlas wants to know
      </div>
      <div className="stack">
        {questions.map((q) => (
          <div key={q.id} className="card stack" style={{ borderColor: 'var(--accent-2)' }}>
            <div>{q.question}</div>
            {q.rationale && <div className="muted" style={{ fontSize: 12 }}>{q.rationale}</div>}
            <div className="row">
              <input
                className="input"
                placeholder="Your answer…"
                value={draft[q.id] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))}
              />
              <button className="btn" onClick={() => answer(q)}>
                Answer
              </button>
              <button className="btn ghost" onClick={() => dismiss(q)}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
