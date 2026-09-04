import type { Equipment, MuscleGroup, MuscleTarget } from './fitness.js';

/**
 * How the exercise catalog is browsed.
 *
 * The catalog went from forty-eight movements to three hundred, and a list that
 * long is only usable if it can be narrowed. Search alone is not enough: it
 * answers "where is the thing I can already name", and the harder case is
 * building a split, where you know the muscle and want to see the options —
 * which is exactly how "hip abduction" was unfindable while sitting in the app
 * under "legs".
 *
 * So the tree is group → target, and equipment is a second, independent axis.
 * It lives in shared because both the picker and the seeded catalog have to
 * agree about which muscles belong to which group; two copies would drift and
 * the symptom would be an exercise that is missing from every filter.
 */

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
  cardio: 'Cardio',
  other: 'Other',
};

/**
 * Names people actually use. "Side delts", not "lateral deltoid" — this is a
 * filter chip in a gym, not an anatomy chart.
 */
export const MUSCLE_TARGET_LABELS: Record<MuscleTarget, string> = {
  upper_chest: 'Upper chest',
  mid_chest: 'Mid chest',
  lower_chest: 'Lower chest',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  lower_back: 'Lower back',
  rear_delts: 'Rear delts',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rotator_cuff: 'Rotator cuff',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  adductors: 'Adductors (inner thigh)',
  abductors: 'Abductors (outer hip)',
  hip_flexors: 'Hip flexors',
  tibialis: 'Tibialis',
  abs: 'Abs',
  obliques: 'Obliques',
  lower_abs: 'Lower abs',
  neck: 'Neck',
  full_body: 'Full body',
  cardio: 'Cardio',
  other: 'Other',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  band: 'Band',
  smith: 'Smith machine',
  ez_bar: 'EZ-bar',
  trap_bar: 'Trap bar',
  plate: 'Plate',
  sled: 'Sled',
  suspension: 'Rings / TRX',
  medicine_ball: 'Medicine ball',
  cardio_machine: 'Cardio machine',
  other: 'Other',
};

/**
 * Which specific muscles sit under each group, in the order a person reading
 * the group would expect them — big movers first, then the smaller ones.
 */
export const TARGETS_BY_GROUP: Record<MuscleGroup, MuscleTarget[]> = {
  chest: ['upper_chest', 'mid_chest', 'lower_chest'],
  back: ['lats', 'upper_back', 'traps', 'lower_back'],
  shoulders: ['front_delts', 'side_delts', 'rear_delts', 'rotator_cuff'],
  arms: ['biceps', 'triceps', 'forearms'],
  legs: [
    'quads',
    'hamstrings',
    'glutes',
    'calves',
    'adductors',
    'abductors',
    'hip_flexors',
    'tibialis',
  ],
  core: ['abs', 'lower_abs', 'obliques'],
  cardio: ['cardio'],
  other: ['full_body', 'neck', 'other'],
};

/** The group a specific muscle belongs to. */
export function groupOfTarget(target: MuscleTarget): MuscleGroup {
  for (const [group, targets] of Object.entries(TARGETS_BY_GROUP)) {
    if (targets.includes(target)) return group as MuscleGroup;
  }
  return 'other';
}

/** How an exercise describes itself in one line under its name. */
export function describeExercise(e: {
  muscle: MuscleGroup;
  target?: MuscleTarget | null;
  equipment?: Equipment | null;
}): string {
  const muscle = e.target ? MUSCLE_TARGET_LABELS[e.target] : MUSCLE_GROUP_LABELS[e.muscle];
  return e.equipment ? `${muscle} · ${EQUIPMENT_LABELS[e.equipment]}` : muscle;
}
