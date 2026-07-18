'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { useCreateJournalEntry, useJournal } from '@/lib/hooks/journal';
import { Angry, Frown, Meh, PenLine, Smile, Laugh, type LucideIcon } from 'lucide-react';
import { Button, Card, CardListSkeleton, EmptyState, ErrorState, IconButton, Textarea } from '@/components/ui';

// A 5-point mood scale, worst → best. Index + 1 is the stored mood value.
const MOODS: LucideIcon[] = [Angry, Frown, Meh, Smile, Laugh];

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
      <h2 className="section-title">Journal</h2>
      <Card stack>
        <form className="stack" onSubmit={save}>
          <Textarea
            rows={3}
            placeholder="What's on your mind today?"
            aria-label="Journal entry"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="row mood-scale" style={{ gap: 2 }}>
              {MOODS.map((Icon, i) => (
                <IconButton
                  key={i}
                  label={`Mood ${i + 1} of 5`}
                  aria-pressed={mood === i + 1}
                  className={mood === i + 1 ? 'mood-selected' : ''}
                  onClick={() => setMood(i + 1)}
                >
                  <Icon size={22} aria-hidden />
                </IconButton>
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
            icon={PenLine}
            title="No entries yet"
            hint="Write a line about your day — Atlas remembers what matters to you."
          />
        )}
        {entries.map((e) => (
          <Card key={e.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {e.entryDate.slice(0, 10)}
              </span>
              {e.mood ? <MoodIcon value={e.mood} /> : null}
            </div>
            <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{e.body}</div>
          </Card>
        ))}
      </div>
    </>
  );
}

/** The recorded mood (1–5) for a past entry, shown in the brand tint. */
function MoodIcon({ value }: { value: number }) {
  const Icon = MOODS[value - 1];
  if (!Icon) return null;
  return <Icon size={18} className="mood-selected" aria-label={`Mood ${value} of 5`} />;
}
