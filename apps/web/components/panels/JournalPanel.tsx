'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { useCreateJournalEntry, useJournal } from '@/lib/hooks/journal';
import { Button, Card, CardListSkeleton, EmptyState, ErrorState, Textarea } from '@/components/ui';

const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];

export function JournalPanel() {
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const journalQuery = useJournal();
  const create = useCreateJournalEntry();

  const entries = journalQuery.data ?? [];
  const error = create.error ? errorMessage(create.error, 'Failed to save entry') : null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    create.mutate(
      { body: body.trim(), mood: mood ?? undefined },
      {
        onSuccess: () => {
          setBody('');
          setMood(null);
        },
      },
    );
  }

  return (
    <>
      <div className="section-title">Journal</div>
      <Card stack>
        <form className="stack" onSubmit={save}>
          <Textarea
            rows={3}
            placeholder="What's on your mind today?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 6 }}>
              {MOODS.map((m, i) => (
                <Button
                  key={m}
                  variant="ghost"
                  style={{ fontSize: 20, opacity: mood === i + 1 ? 1 : 0.4 }}
                  onClick={() => setMood(i + 1)}
                  aria-label={`mood ${i + 1}`}
                >
                  {m}
                </Button>
              ))}
            </div>
            <Button type="submit" disabled={create.isPending}>
              Save
            </Button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      </Card>

      <div className="stack" style={{ marginTop: 14 }}>
        {journalQuery.isPending && <CardListSkeleton cards={2} lines={2} />}
        {journalQuery.isError && (
          <ErrorState
            message={errorMessage(journalQuery.error, 'Failed to load journal')}
            onRetry={() => void journalQuery.refetch()}
          />
        )}
        {journalQuery.isSuccess && entries.length === 0 && (
          <EmptyState
            title="No entries yet"
            hint="Write a line about your day — Atlas remembers it and learns what matters to you."
          />
        )}
        {entries.map((e) => (
          <Card key={e.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {e.entryDate.slice(0, 10)}
              </span>
              {e.mood && <span>{MOODS[e.mood - 1]}</span>}
            </div>
            <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{e.body}</div>
          </Card>
        ))}
      </div>
    </>
  );
}
