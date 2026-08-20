'use client';

import { useMemo, useState } from 'react';
import { type ExerciseDTO, type WorkoutTemplateDTO } from '@atlas/shared';
import { Plus, Search, X } from 'lucide-react';
import { useCreateExercise, useExercises, useWorkoutHistory } from '@/lib/hooks/fitness';
import { pickerSections, recentExerciseIds } from '@/lib/exercise-order';
import { IconButton, ListSkeleton } from '@/components/ui';
import { NO_EXERCISES } from './helpers';

/**
 * Pick a movement. Search-first because the catalog is long and scrolling a
 * list mid-workout is the slowest possible interaction.
 */
export function ExercisePicker({
  onPick,
  onClose,
  template,
  alreadyInWorkout,
}: {
  onPick: (exercise: ExerciseDTO) => void;
  onClose: () => void;
  /** The saved day this session came from — its movements go to the top. */
  template: WorkoutTemplateDTO | null;
  alreadyInWorkout: string[];
}) {
  const [query, setQuery] = useState('');
  const exercises = useExercises();
  const history = useWorkoutHistory();
  const create = useCreateExercise();

  const q = query.trim().toLowerCase();
  // A fresh `[]` fallback would change identity on every render and re-run the
  // section memo below, so keep it stable.
  const all = useMemo(() => exercises.data ?? NO_EXERCISES, [exercises.data]);
  const recent = useMemo(() => recentExerciseIds(history.data ?? []), [history.data]);
  const sections = useMemo(
    () =>
      pickerSections({
        exercises: all,
        template,
        recentExerciseIds: recent,
        alreadyInWorkout,
        query,
      }),
    [all, template, recent, alreadyInWorkout, query],
  );
  // Offer to create only when the search genuinely matches nothing.
  const canCreate = q.length > 1 && !all.some((e) => e.name.toLowerCase() === q);

  return (
    <div className="fit-picker">
      <div className="fit-picker-search">
        <Search size={14} aria-hidden />
        <input
          autoFocus
          className="task-search-input"
          type="search"
          placeholder="Search exercises…"
          aria-label="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        />
        <IconButton label="Close exercise picker" onClick={onClose}>
          <X size={15} aria-hidden />
        </IconButton>
      </div>

      {exercises.isPending ? (
        <ListSkeleton rows={4} circle={false} />
      ) : (
        <div className="fit-picker-list" role="listbox" aria-label="Exercises">
          {sections.map((section) => (
            <div key={section.title ?? '_'} className="fit-picker-section">
              {section.title && (
                <p className="fit-picker-heading" role="presentation">
                  {section.title}
                </p>
              )}
              {section.exercises.slice(0, 40).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="fit-picker-row"
                  onClick={() => onPick(e)}
                >
                  <span className="fit-picker-name">{e.name}</span>
                  <span className="fit-picker-muscle">{e.muscle}</span>
                </button>
              ))}
            </div>
          ))}
          {canCreate && (
            <button
              type="button"
              className="fit-picker-row create"
              disabled={create.isPending}
              onClick={() =>
                create.mutate(
                  { name: query.trim(), muscle: 'other', kind: 'weight_reps' },
                  { onSuccess: (created) => onPick(created) },
                )
              }
            >
              <Plus size={13} aria-hidden />
              Add &ldquo;{query.trim()}&rdquo;
            </button>
          )}
          {sections.length === 0 && !canCreate && (
            <p className="prog-muted" style={{ padding: '10px 2px' }}>
              No exercises match that.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
