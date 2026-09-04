'use client';

import { useMemo, useState } from 'react';
import {
  EQUIPMENT_LABELS,
  MUSCLE_GROUP_LABELS,
  MUSCLE_TARGET_LABELS,
  TARGETS_BY_GROUP,
  type Equipment,
  type ExerciseDTO,
  type MuscleGroup,
  type MuscleTarget,
} from '@atlas/shared';

/** The groups worth offering as browse tabs, in the order people train them. */
const GROUPS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'cardio'];

export interface MuscleFilterValue {
  target: MuscleTarget | null;
  equipment: Equipment | null;
}

export const NO_FILTER: MuscleFilterValue = { target: null, equipment: null };

/**
 * Browse the catalog by muscle, then by equipment.
 *
 * Shared by the two places a movement gets chosen — mid-workout in the picker,
 * and while building a split — because they are the same question asked at
 * different times, and they had drifted into two different answers: the picker
 * searched, and the split builder showed sixty movements in whatever order the
 * API returned them. With a catalog of three hundred that is not a list, it is
 * a wall, which is what made creating a split feel arbitrary.
 *
 * Group first, then the specific muscle, because "legs" is quads, hamstrings,
 * glutes, calves, adductors AND abductors — the coarseness that made a hip
 * abduction machine unfindable while it sat in the catalog the whole time.
 *
 * The equipment row only offers what is actually in view. Sixteen chips, most
 * leading nowhere, is more choosing than the thing is meant to save.
 */
export function MuscleFilter({
  exercises,
  value,
  onChange,
}: {
  exercises: ExerciseDTO[];
  value: MuscleFilterValue;
  onChange: (next: MuscleFilterValue) => void;
}) {
  const [group, setGroup] = useState<MuscleGroup | null>(null);

  const equipmentOnOffer = useMemo(() => {
    const inScope = exercises.filter((e) =>
      value.target ? e.target === value.target : !group || e.muscle === group,
    );
    const seen = new Set<Equipment>();
    for (const e of inScope) if (e.equipment) seen.add(e.equipment);
    return [...seen].sort((a, b) => EQUIPMENT_LABELS[a].localeCompare(EQUIPMENT_LABELS[b]));
  }, [exercises, group, value.target]);

  const on = value.target !== null || value.equipment !== null;

  return (
    <div className="fit-browse">
      <div className="fit-chips" role="group" aria-label="Muscle group">
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            className={`chip ${group === g ? 'active' : ''}`}
            aria-pressed={group === g}
            onClick={() => {
              setGroup(group === g ? null : g);
              // The old target belongs to the old group. Keeping it would show
              // "Chest" selected above a list of quad exercises.
              onChange(NO_FILTER);
            }}
          >
            {MUSCLE_GROUP_LABELS[g]}
          </button>
        ))}
      </div>

      {group && (
        <div className="fit-chips" role="group" aria-label="Specific muscle">
          {TARGETS_BY_GROUP[group].map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${value.target === t ? 'active' : ''}`}
              aria-pressed={value.target === t}
              onClick={() =>
                onChange({ target: value.target === t ? null : t, equipment: value.equipment })
              }
            >
              {MUSCLE_TARGET_LABELS[t]}
            </button>
          ))}
        </div>
      )}

      {group && equipmentOnOffer.length > 1 && (
        <div className="fit-chips" role="group" aria-label="Equipment">
          {equipmentOnOffer.map((eq) => (
            <button
              key={eq}
              type="button"
              className={`chip ${value.equipment === eq ? 'active' : ''}`}
              aria-pressed={value.equipment === eq}
              onClick={() =>
                onChange({ target: value.target, equipment: value.equipment === eq ? null : eq })
              }
            >
              {EQUIPMENT_LABELS[eq]}
            </button>
          ))}
        </div>
      )}

      {on && (
        <button
          type="button"
          className="fit-clear"
          onClick={() => {
            setGroup(null);
            onChange(NO_FILTER);
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
