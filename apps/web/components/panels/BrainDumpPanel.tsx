'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { useBrainDump } from '@/lib/hooks/ai';
import { Button, Card, Textarea } from '@/components/ui';

export function BrainDumpPanel() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const dump = useBrainDump();

  const error = dump.error ? errorMessage(dump.error, 'Failed to organize') : null;

  function organize(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || dump.isPending) return;
    setResult(null);
    dump.mutate(text.trim(), {
      onSuccess: (res) => {
        const created = res.toolExecutions.filter((t) => t.ok).map((t) => t.name);
        setResult(
          created.length > 0
            ? `Filed: ${created.join(', ')}${res.content ? ` — ${res.content}` : ''}`
            : res.content || 'Nothing actionable found.',
        );
        setText('');
      },
    });
  }

  return (
    <Card stack style={{ marginBottom: 16 }}>
      <form className="stack" onSubmit={organize}>
        <h2 className="section-title" style={{ margin: 0 }}>Brain dump</h2>
        <Textarea
          rows={3}
          placeholder="Paste anything messy — Atlas will sort it into tasks, events, journal, or notes…"
          aria-label="Brain dump text"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={dump.isPending}>
          {dump.isPending ? 'Organizing…' : 'Organize'}
        </Button>
        {result && <div className="muted" style={{ fontSize: 13 }}>{result}</div>}
        {error && <div className="error">{error}</div>}
      </form>
    </Card>
  );
}
