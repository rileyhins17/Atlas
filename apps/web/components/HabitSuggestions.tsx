'use client';

import { Plus } from 'lucide-react';
import type { HabitDTO } from '@atlas/shared';
import { useCreateHabit } from '@/lib/hooks/habits';
import { habitSuggestions } from '@/lib/habit-suggestions';

/**
 * One-tap starter habits, for a list that is still empty. Each chip creates
 * the habit with a sensible daily target; the name and target can be changed
 * afterwards like any other habit.
 */
export function HabitSuggestions({ habits }: { habits: HabitDTO[] }) {
  const create = useCreateHabit();
  const options = habitSuggestions(habits.map((h) => h.name));
  if (options.length === 0) return null;

  return (
    <div className="habit-suggest" role="group" aria-label="Suggested habits">
      {options.map((s) => {
        const label =
          s.target === 1 ? `Add habit ${s.name}` : `Add habit ${s.name}, ${s.target} times a day`;
        return (
          <button
            key={s.name}
            type="button"
            className="habit-suggest-chip"
            aria-label={label}
            disabled={create.isPending}
            onClick={() => create.mutate({ name: s.name, target: s.target })}
          >
            <Plus size={15} aria-hidden />
            {s.name}
            {s.target !== 1 && <span className="habit-suggest-x">×{s.target}</span>}
          </button>
        );
      })}
    </div>
  );
}
