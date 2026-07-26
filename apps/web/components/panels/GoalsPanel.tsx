'use client';

import { useState } from 'react';
import { describeGoalProgress, goalProgress, type GoalDTO, type GoalHorizon } from '@atlas/shared';
import { Check, Plus, Target, X } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useCreateGoal, useDeleteGoal, useGoals, useUpdateGoal } from '@/lib/hooks/goals';
import { Button, Card, EmptyState, ErrorState, Input, ListSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { useSubmitLatch } from '@/lib/hooks/submit-latch';

const HORIZONS: { key: GoalHorizon; label: string; blurb: string }[] = [
  {
    key: 'short',
    label: 'Short term',
    blurb: 'What you are pushing on now — you should see movement in weeks.',
  },
  {
    key: 'long',
    label: 'Long term',
    blurb: 'Direction you are steering by. Checking these weekly only makes you feel behind.',
  },
];

function GoalRow({ goal }: { goal: GoalDTO }) {
  const update = useUpdateGoal();
  const remove = useDeleteGoal();
  const pct = goalProgress(goal);
  const done = goal.status === 'achieved';

  return (
    <li className={`goal-row ${done ? 'done' : ''}`}>
      <button
        type="button"
        className="goal-check"
        aria-label={done ? `Reopen "${goal.title}"` : `Mark "${goal.title}" achieved`}
        aria-pressed={done}
        onClick={() =>
          update.mutate({ id: goal.id, patch: { status: done ? 'active' : 'achieved' } })
        }
      >
        {done ? <Check size={14} aria-hidden /> : null}
      </button>

      <div className="goal-body">
        <span className="goal-title">{goal.title}</span>
        <span className="goal-meta">
          {/* Honest about an empty goal: "0%" reads as failure when it really
              means you have not broken it down yet. */}
          {describeGoalProgress(goal)}
          {goal.targetDate ? ` · by ${new Date(goal.targetDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}
        </span>
        {pct !== null && (
          <span className="goal-bar" aria-hidden>
            <span className="goal-bar-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
          </span>
        )}
      </div>

      <button
        type="button"
        className="goal-move"
        onClick={() =>
          update.mutate({
            id: goal.id,
            patch: { horizon: goal.horizon === 'short' ? 'long' : 'short' },
          })
        }
      >
        {goal.horizon === 'short' ? '→ Long' : '→ Short'}
      </button>
      <button
        type="button"
        className="goal-drop"
        aria-label={`Delete "${goal.title}"`}
        disabled={remove.isPending}
        onClick={() => remove.mutate(goal.id)}
      >
        <X size={14} aria-hidden />
      </button>
    </li>
  );
}

/**
 * Goals, split by horizon.
 *
 * Short and long term are separated because they are read differently: a
 * short-term goal wants weekly progress, a long-term one is direction. Mixing
 * them in one list makes the long ones look permanently stalled.
 */
export function GoalsPanel() {
  const goals = useGoals();
  const create = useCreateGoal();
  const latch = useSubmitLatch();
  const [title, setTitle] = useState('');
  const [horizon, setHorizon] = useState<GoalHorizon>('short');

  const all = goals.data ?? [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text || create.isPending) return;
    latch((release) =>
      create.mutate({ title: text, horizon }, { onSuccess: () => setTitle(''), onSettled: release }),
    );
  }

  return (
    <>
      <PageHeader title="Goals" subtitle="What all of this is actually for." />

      <Card stack>
        <form className="stack" onSubmit={submit} noValidate>
          <Input
            placeholder="What are you working toward?"
            aria-label="New goal"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="row" style={{ gap: 8 }}>
            <div className="cal-scope" role="group" aria-label="Horizon" style={{ flex: 1 }}>
              {HORIZONS.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  className={`cal-scope-btn ${horizon === h.key ? 'on' : ''}`}
                  aria-pressed={horizon === h.key}
                  onClick={() => setHorizon(h.key)}
                >
                  {h.label}
                </button>
              ))}
            </div>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              <Plus size={15} aria-hidden /> Add
            </Button>
          </div>
        </form>
      </Card>

      {goals.isPending ? (
        <ListSkeleton rows={3} circle={false} />
      ) : goals.isError ? (
        <ErrorState
          message={errorMessage(goals.error, 'Failed to load goals')}
          onRetry={() => void goals.refetch()}
        />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          hint="Add one above, or just tell Atlas — 'I want to run a half marathon by spring'."
        />
      ) : (
        HORIZONS.map((h) => {
          const list = all.filter((g) => g.horizon === h.key);
          if (list.length === 0) return null;
          return (
            <section key={h.key} className="goal-group" aria-label={h.label}>
              <h2 className="section-title">{h.label}</h2>
              <p className="prog-muted" style={{ margin: '2px 0 8px', fontSize: 12 }}>
                {h.blurb}
              </p>
              <ul className="goal-list">
                {list.map((g) => (
                  <GoalRow key={g.id} goal={g} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
