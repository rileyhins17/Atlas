'use client';

import { useState } from 'react';
import { MAX_TRACKERS, TrackerDirection, type TrackerDTO } from '@atlas/shared';
import { Archive, Plus, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useArchiveTracker, useCreateTracker, useTrackers } from '@/lib/hooks/trackers';
import { useSubmitLatch } from '@/lib/hooks/submit-latch';
import { TrackerHint } from './TrackerCheckIn';

const DIRECTIONS: { value: TrackerDirection; label: string }[] = [
  { value: 'lower_better', label: 'Lower is better' },
  { value: 'higher_better', label: 'Higher is better' },
  { value: 'neutral', label: 'Neither' },
];

/**
 * Set up what you want to rate each day.
 *
 * The suggestions are load-bearing, not decoration: "track anything" is a blank
 * page, and a blank page is why generic tools go unused. Naming four real
 * examples is what turns the feature from an idea into something you can start
 * in one tap.
 */
const SUGGESTIONS = [
  { name: 'Bloating', emoji: '🫄', direction: 'lower_better' as const, low: 'none', high: 'awful' },
  { name: 'Soreness', emoji: '💪', direction: 'lower_better' as const, low: 'fresh', high: 'wrecked' },
  { name: 'Energy', emoji: '⚡', direction: 'higher_better' as const, low: 'flat', high: 'buzzing' },
  { name: 'Anxiety', emoji: '🌀', direction: 'lower_better' as const, low: 'calm', high: 'racing' },
];

export function TrackerManager() {
  const trackers = useTrackers();
  const create = useCreateTracker();
  const archive = useArchiveTracker();
  const latch = useSubmitLatch();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<TrackerDirection>('lower_better');
  const [lowLabel, setLowLabel] = useState('');
  const [highLabel, setHighLabel] = useState('');

  const rows: TrackerDTO[] = trackers.data ?? [];
  const full = rows.length >= MAX_TRACKERS;

  const reset = () => {
    setAdding(false);
    setName('');
    setDirection('lower_better');
    setLowLabel('');
    setHighLabel('');
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    latch((release) =>
      create.mutate(
        {
          name: trimmed,
          direction,
          lowLabel: lowLabel.trim() || null,
          highLabel: highLabel.trim() || null,
        },
        { onSuccess: reset, onSettled: release },
      ),
    );
  };

  return (
    <div className="trk-manage-pane">
      <TrackerHint />

      {rows.length > 0 && (
        <ul className="trk-manage-list">
          {rows.map((t) => (
            <li key={t.id} className="trk-manage-row">
              <span className="trk-manage-name">
                {t.emoji && <span aria-hidden>{t.emoji}</span>}
                {t.name}
              </span>
              <span className="trk-manage-dir">
                {DIRECTIONS.find((d) => d.value === t.direction)?.label}
              </span>
              <button
                type="button"
                className="trk-archive"
                aria-label={`Stop tracking ${t.name}`}
                disabled={archive.isPending}
                onClick={() => archive.mutate(t.id)}
              >
                <Archive size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!adding && !full && rows.length === 0 && (
        <div className="trk-suggests">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.name}
              type="button"
              className="trk-suggest"
              disabled={create.isPending}
              onClick={() =>
                create.mutate({
                  name: s.name,
                  emoji: s.emoji,
                  direction: s.direction,
                  lowLabel: s.low,
                  highLabel: s.high,
                })
              }
            >
              <span aria-hidden>{s.emoji}</span> {s.name}
            </button>
          ))}
        </div>
      )}

      {adding ? (
        <form
          className="trk-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            placeholder="What do you want to rate? — Bloating, Focus, Skin…"
            aria-label="Tracker name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="trk-dirs" role="radiogroup" aria-label="Which end is better">
            {DIRECTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                role="radio"
                aria-checked={direction === d.value}
                className={`chip ${direction === d.value ? 'active' : ''}`}
                onClick={() => setDirection(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="trk-labels">
            <Input
              placeholder="1 means…"
              aria-label="What 1 means"
              value={lowLabel}
              maxLength={24}
              onChange={(e) => setLowLabel(e.target.value)}
            />
            <Input
              placeholder="10 means…"
              aria-label="What 10 means"
              value={highLabel}
              maxLength={24}
              onChange={(e) => setHighLabel(e.target.value)}
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Adding…' : 'Add tracker'}
            </Button>
            <Button variant="ghost" type="button" onClick={reset}>
              <X size={14} aria-hidden /> Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="trk-add"
          disabled={full}
          onClick={() => setAdding(true)}
        >
          <Plus size={14} aria-hidden />
          {full ? `That is all ${MAX_TRACKERS} — archive one to add another` : 'Track something else'}
        </button>
      )}
    </div>
  );
}
