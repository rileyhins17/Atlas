'use client';

import { useMemo, useState } from 'react';
import type { HabitDTO } from '@atlas/shared';
import { Check, Flame, Repeat, X } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import {
  useCreateHabit,
  useDeleteHabit,
  useHabitHistory,
  useHabits,
  useLogHabit,
} from '@/lib/hooks/habits';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Heatmap,
  Input,
  ListSkeleton,
} from '@/components/ui';
import { IconButton } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { localDayKey } from '@/lib/dates';

const HISTORY_DAYS = 84; // 12 weeks of heatmap

export function HabitsPanel() {
  const [name, setName] = useState('');
  const habitsQuery = useHabits();
  const historyQuery = useHabitHistory(HISTORY_DAYS);
  const create = useCreateHabit();
  const log = useLogHabit();
  const remove = useDeleteHabit();

  const habits = habitsQuery.data ?? [];
  const historyByHabit = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const h of historyQuery.data ?? []) {
      map.set(h.habitId, new Map(h.days.map((d) => [d.day, d.count])));
    }
    return map;
  }, [historyQuery.data]);

  const error = create.error ? errorMessage(create.error, 'Failed to add habit') : null;

  function addHabit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({ name: name.trim() }, { onSuccess: () => setName('') });
  }

  return (
    <>
      <PageHeader title="Habits" subtitle="Small daily wins, kept alive by your streak." />
      <form className="row" onSubmit={addHabit}>
        <Input
          placeholder="New habit (e.g. Gym, Read, Water)…"
          aria-label="New habit name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          Add
        </Button>
      </form>
      {error && <div className="error">{error}</div>}

      <div className="stack" style={{ marginTop: 14, gap: 12 }} aria-busy={habitsQuery.isPending}>
        {habitsQuery.isPending ? (
          <Card>
            <ListSkeleton rows={3} />
          </Card>
        ) : habitsQuery.isError ? (
          <Card>
            <ErrorState
              message={errorMessage(habitsQuery.error, 'Failed to load habits')}
              onRetry={() => void habitsQuery.refetch()}
            />
          </Card>
        ) : habits.length === 0 ? (
          <Card>
            <EmptyState
              icon={Repeat}
              title="No habits yet"
              hint="Add one to start a streak — daily check-ins keep it alive."
            />
          </Card>
        ) : (
          habits.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              counts={historyByHabit.get(h.id)}
              onCheckIn={() => log.mutate(h.id)}
              onRemove={() => remove.mutate(h.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

/** Last 7 local days (oldest first) with done-ness for the mini week grid. */
export function weekCells(
  counts: Map<string, number> | undefined,
  target: number,
  today: Date,
): Array<{ day: string; done: boolean; count: number }> {
  const cells: Array<{ day: string; done: boolean; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDayKey(d);
    const count = counts?.get(key) ?? 0;
    cells.push({ day: key, done: count >= Math.max(1, target), count });
  }
  return cells;
}

function HabitCard({
  habit,
  counts,
  onCheckIn,
  onRemove,
}: {
  habit: HabitDTO;
  counts: Map<string, number> | undefined;
  onCheckIn: () => void;
  onRemove: () => void;
}) {
  const week = weekCells(counts, habit.target, new Date());
  return (
    <Card stack className={habit.doneToday ? 'habit-card done' : 'habit-card'}>
      <div className="row" style={{ gap: 13 }}>
        <button
          className={`check ${habit.doneToday ? '' : ''}`}
          aria-label={`Check in "${habit.name}"`}
          aria-pressed={habit.doneToday}
          onClick={onCheckIn}
        >
          <Check size={14} strokeWidth={3} aria-hidden />
        </button>
        <div className="stack" style={{ gap: 1, flex: 1, minWidth: 0 }}>
          <strong className="habit-name">{habit.name}</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            {habit.todayCount}/{habit.target} today · {habit.cadence}
          </span>
        </div>
        <div className="week-grid" role="img" aria-label={`${habit.name}: last 7 days`}>
          {week.map((c) => (
            <span key={c.day} className={`week-dot ${c.done ? 'done' : ''}`} title={c.day} />
          ))}
        </div>
        {habit.streak > 0 && (
          <Badge className="streak" aria-label={`${habit.streak} day streak`}>
            <Flame size={13} aria-hidden />
            {habit.streak}
          </Badge>
        )}
        <IconButton label={`Archive "${habit.name}"`} onClick={onRemove}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
      <div className="habit-heatmap">
        <Heatmap
          counts={counts ?? new Map()}
          weeks={12}
          target={habit.target}
          label={`${habit.name} check-ins, last 12 weeks`}
        />
      </div>
    </Card>
  );
}
