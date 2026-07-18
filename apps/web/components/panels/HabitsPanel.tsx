'use client';

import { useState } from 'react';
import type { HabitDTO } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useCreateHabit, useDeleteHabit, useHabits, useLogHabit } from '@/lib/hooks/habits';
import { Check, Flame, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, ListSkeleton } from '@/components/ui';

export function HabitsPanel() {
  const [name, setName] = useState('');
  const habitsQuery = useHabits();
  const create = useCreateHabit();
  const log = useLogHabit();
  const remove = useDeleteHabit();

  const habits = habitsQuery.data ?? [];
  const error = create.error
    ? errorMessage(create.error, 'Failed to add habit')
    : log.error
      ? errorMessage(log.error, 'Failed to check in')
      : remove.error
        ? errorMessage(remove.error, 'Failed to archive habit')
        : null;

  function addHabit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({ name: name.trim() }, { onSuccess: () => setName('') });
  }

  return (
    <>
      <h2 className="section-title">Habits</h2>
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

      <Card style={{ marginTop: 14 }} aria-busy={habitsQuery.isPending}>
        {habitsQuery.isPending ? (
          <ListSkeleton rows={3} />
        ) : habitsQuery.isError ? (
          <ErrorState
            message={errorMessage(habitsQuery.error, 'Failed to load habits')}
            onRetry={() => void habitsQuery.refetch()}
          />
        ) : habits.length === 0 ? (
          <EmptyState
            title="No habits yet"
            hint="Add one to start a streak — daily check-ins keep it alive."
          />
        ) : (
          habits.map((h) => (
            <HabitRow
              key={h.id}
              habit={h}
              onCheckIn={(x) => log.mutate(x.id)}
              onRemove={(x) => remove.mutate(x.id)}
            />
          ))
        )}
      </Card>
    </>
  );
}

function HabitRow({
  habit,
  onCheckIn,
  onRemove,
}: {
  habit: HabitDTO;
  onCheckIn: (h: HabitDTO) => void;
  onRemove: (h: HabitDTO) => void;
}) {
  return (
    <div className={`task ${habit.doneToday ? 'done' : ''}`}>
      <button
        className="check"
        aria-label={`Check in "${habit.name}"`}
        aria-pressed={habit.doneToday}
        onClick={() => onCheckIn(habit)}
      >
        <Check size={14} strokeWidth={3} aria-hidden />
      </button>
      <span className="title">{habit.name}</span>
      {habit.streak > 0 && (
        <Badge className="streak" aria-label={`${habit.streak} day streak`}>
          <Flame size={13} aria-hidden />
          {habit.streak}
        </Badge>
      )}
      <IconButton label={`Archive "${habit.name}"`} onClick={() => onRemove(habit)}>
        <X size={16} aria-hidden />
      </IconButton>
    </div>
  );
}
