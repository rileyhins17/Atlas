'use client';

import { useMemo, useState } from 'react';
import {
  describeExercise,
  groupIntoRounds,
  normaliseGroups,
  supersetLabel,
  toggleSupersetAt,
  type ExerciseDTO,
  type WorkoutTemplateDTO,
} from '@atlas/shared';
import { Check, GripVertical, Link2, Plus, Search, Unlink2, X } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import {
  useCreateTemplate,
  useDeleteTemplate,
  useExercises,
  useUpdateTemplate,
} from '@/lib/hooks/fitness';
import { useSubmitLatch } from '@/lib/hooks/submit-latch';
import { MuscleFilter, NO_FILTER, type MuscleFilterValue } from './MuscleFilter';

const NO_EXERCISES: ExerciseDTO[] = [];

/**
 * Build a workout day by tapping exercises.
 *
 * Replaces describing your split in prose as the primary path. Writing
 * "Push: bench, incline db press, lateral raise" is clever and it works, but
 * it is not obvious — nothing on screen tells you the format, and getting it
 * wrong gives you a proposal to audit rather than the day you wanted. Tapping
 * a list is obvious to everyone. The text path still exists for pasting a
 * whole program at once.
 */
export function DayBuilder({
  editing,
  onDone,
  onCancel,
}: {
  /** An existing day to edit, or null to create one. */
  editing: WorkoutTemplateDTO | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const exercises = useExercises();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const remove = useDeleteTemplate();
  const latch = useSubmitLatch();

  const [name, setName] = useState(editing?.name ?? '');
  // Each movement carries whatever it is supersetted with, because the two
  // facts are edited together — moving an exercise out of a pair has to break
  // the pair, and a parallel array of groups would quietly slide out of step.
  const [chosen, setChosen] = useState<{ exerciseId: string; supersetGroup: number | null }[]>(
    editing
      ? editing.exercises.map((e) => ({ exerciseId: e.exerciseId, supersetGroup: e.supersetGroup }))
      : [],
  );
  const chosenIds = useMemo(() => chosen.map((c) => c.exerciseId), [chosen]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MuscleFilterValue>(NO_FILTER);

  // Stable identity: a fresh `[]` fallback would re-run both memos every render.
  const all = useMemo(() => exercises.data ?? NO_EXERCISES, [exercises.data]);
  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Same narrowing as the mid-workout picker, and for a sharper reason. This
    // is where a split gets built, so it is browsed rather than searched: you
    // are deciding what a Leg Day should contain, not looking up a name you
    // already have. Unfiltered, it showed sixty movements out of three hundred
    // in whatever order the API returned them, which is what made building a
    // split feel arbitrary.
    const scoped = all.filter(
      (e) =>
        (!filter.target || e.target === filter.target) &&
        (!filter.equipment || e.equipment === filter.equipment),
    );
    const pool = q ? scoped.filter((e) => e.name.toLowerCase().includes(q)) : scoped;
    // Chosen movements are shown in the list above; offering them again is noise.
    const narrowed = q || filter.target || filter.equipment;
    return pool.filter((e) => !chosenIds.includes(e.id)).slice(0, narrowed ? 40 : 60);
  }, [all, query, chosenIds, filter]);

  /** Which round each movement belongs to, so the list can bracket the pairs. */
  const rounds = useMemo(() => groupIntoRounds(chosen), [chosen]);
  const groupOf = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const round of rounds) {
      for (const m of round.members) map.set(m.exerciseId, round.group);
    }
    return map;
  }, [rounds]);

  const busy = create.isPending || update.isPending;

  function save() {
    const label = name.trim();
    if (!label || chosen.length === 0 || busy) return;
    // Renumber once, here: editing leaves holes (pair, unpair, pair again gives
    // group 2 with no 0 or 1) and the number is shown as "Superset A".
    const tidy = normaliseGroups(chosen);
    const exerciseIds = tidy.map((c) => c.exerciseId);
    const supersetGroups = tidy.map((c) => c.supersetGroup);
    latch((release) => {
      const opts = { onSuccess: onDone, onSettled: release };
      if (editing) {
        update.mutate({ id: editing.id, patch: { name: label, exerciseIds, supersetGroups } }, opts);
      } else {
        create.mutate({ name: label, exerciseIds, supersetGroups }, opts);
      }
    });
  }

  /** Move a movement up or down; the order IS how the session opens. */
  function move(index: number, delta: number) {
    setChosen((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return (
    <Card stack className="day-builder">
      <Input
        placeholder="Name this day — Push, Pull, Legs…"
        aria-label="Workout day name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />

      {chosen.length > 0 && (
        <ol className="day-chosen">
          {chosen.map((entry, i) => {
            const id = entry.exerciseId;
            const ex: ExerciseDTO | undefined = byId.get(id);
            const label = ex?.name ?? 'Exercise';
            const group = groupOf.get(id) ?? null;
            const next = chosen[i + 1];
            const nextName = next ? byId.get(next.exerciseId)?.name ?? 'the next exercise' : null;
            // Linked to the one below only when they are really in the same
            // round. Two members of a group with something between them are
            // not, and the control has to say what is true.
            const linkedBelow =
              next !== undefined &&
              group !== null &&
              (groupOf.get(next.exerciseId) ?? null) === group;
            return (
              <li key={id} className={`day-chosen-item ${group !== null ? 'in-superset' : ''}`}>
                <div className="day-chosen-row">
                  <GripVertical size={14} aria-hidden className="day-grip" />
                  <span className="day-chosen-name">{label}</span>
                  {group !== null && (
                    <span className="day-superset-tag">{supersetLabel(group)}</span>
                  )}
                  <button
                    type="button"
                    className="day-move"
                    aria-label={`Move ${label} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="day-move"
                    aria-label={`Move ${label} down`}
                    disabled={i === chosen.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="day-remove"
                    aria-label={`Remove ${label} from this day`}
                    onClick={() => setChosen((prev) => prev.filter((x) => x.exerciseId !== id))}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
                {next && (
                  <button
                    type="button"
                    className={`day-link ${linkedBelow ? 'on' : ''}`}
                    aria-pressed={linkedBelow}
                    aria-label={
                      linkedBelow
                        ? `Separate ${label} from ${nextName}`
                        : `Superset ${label} with ${nextName}`
                    }
                    onClick={() => setChosen((prev) => toggleSupersetAt(prev, i))}
                  >
                    {linkedBelow ? <Unlink2 size={12} aria-hidden /> : <Link2 size={12} aria-hidden />}
                    <span>{linkedBelow ? 'Separate' : 'Superset'}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="fit-picker-search">
        <Search size={14} aria-hidden />
        <input
          className="task-search-input"
          type="search"
          placeholder="Search exercises to add…"
          aria-label="Search exercises to add"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <MuscleFilter exercises={all} value={filter} onChange={setFilter} />

      <div className="day-options" role="listbox" aria-label="Exercises to add">
        {results.map((e) => (
          <button
            key={e.id}
            type="button"
            role="option"
            aria-selected={false}
            className="day-option"
            onClick={() =>
              setChosen((prev) => [...prev, { exerciseId: e.id, supersetGroup: null }])
            }
          >
            <Plus size={13} aria-hidden />
            <span className="day-option-name">{e.name}</span>
            {/* The specific muscle and the equipment. "Legs" on forty rows
                tells you nothing about which one to pick. */}
            <span className="fit-picker-muscle">{describeExercise(e)}</span>
          </button>
        ))}
        {results.length === 0 && (
          <p className="prog-muted" style={{ padding: '8px 2px', margin: 0 }}>
            {query.trim() || filter.target || filter.equipment
              ? 'Nothing matches that.'
              : 'Everything is already in this day.'}
          </p>
        )}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <Button onClick={save} disabled={!name.trim() || chosen.length === 0 || busy}>
          <Check size={14} aria-hidden />{' '}
          {busy ? 'Saving…' : `Save ${chosen.length ? `(${chosen.length})` : ''}`}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        {editing && (
          <Button
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => remove.mutate(editing.id, { onSuccess: onDone })}
          >
            Delete day
          </Button>
        )}
      </div>
    </Card>
  );
}
