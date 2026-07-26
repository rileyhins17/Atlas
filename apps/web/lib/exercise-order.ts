/**
 * What order the exercise picker offers movements in.
 *
 * The whole point of saved workout days: mid-set, you should find the movement
 * you do every week at the top of the list, not by scrolling a 32-item catalog.
 * Pure so the ordering is unit-tested rather than eyeballed through the UI.
 */
import type { ExerciseDTO, WorkoutTemplateDTO } from '@atlas/shared';

export interface PickerSection {
  /** Heading, or null for the ungrouped remainder. */
  title: string | null;
  exercises: ExerciseDTO[];
}

/**
 * Group the catalog into: today's saved day, then movements used recently,
 * then everything else.
 *
 * `alreadyInWorkout` are dropped from the suggested sections — offering a
 * movement you already have a block open for is noise, though it stays findable
 * in the full list so a deliberate re-add is still possible.
 */
export function pickerSections({
  exercises,
  template,
  recentExerciseIds,
  alreadyInWorkout = [],
  query = '',
}: {
  exercises: ExerciseDTO[];
  template: WorkoutTemplateDTO | null;
  recentExerciseIds: string[];
  alreadyInWorkout?: string[];
  query?: string;
}): PickerSection[] {
  const q = query.trim().toLowerCase();
  const matches = (e: ExerciseDTO) => e.name.toLowerCase().includes(q);
  const pool = q ? exercises.filter(matches) : exercises;

  // Searching is an explicit act: honour it with one flat, ranked list rather
  // than scattering hits across three headings the user has to scan.
  if (q) {
    const priority = new Map<string, number>();
    template?.exercises.forEach((te, i) => priority.set(te.exerciseId, i));
    const ranked = [...pool].sort((a, b) => {
      const ap = priority.has(a.id) ? 0 : recentExerciseIds.includes(a.id) ? 1 : 2;
      const bp = priority.has(b.id) ? 0 : recentExerciseIds.includes(b.id) ? 1 : 2;
      if (ap !== bp) return ap - bp;
      // Prefix hits before mid-string hits: typing "bench" should surface
      // "Bench Press" above "Close-Grip Bench Press".
      const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.name.localeCompare(b.name);
    });
    return [{ title: null, exercises: ranked }];
  }

  const byId = new Map(exercises.map((e) => [e.id, e]));
  const used = new Set(alreadyInWorkout);
  const sections: PickerSection[] = [];
  const claimed = new Set<string>();

  if (template) {
    const list = template.exercises
      .map((te) => byId.get(te.exerciseId))
      .filter((e): e is ExerciseDTO => Boolean(e) && !used.has(e!.id));
    if (list.length > 0) {
      sections.push({ title: template.name, exercises: list });
      for (const e of list) claimed.add(e.id);
    }
    // Template movements stay claimed even when already logged, so they do not
    // reappear under "Recent" as if they were a different suggestion.
    for (const te of template.exercises) claimed.add(te.exerciseId);
  }

  const recent = recentExerciseIds
    .map((id) => byId.get(id))
    .filter((e): e is ExerciseDTO => Boolean(e) && !claimed.has(e!.id) && !used.has(e!.id))
    .slice(0, 8);
  if (recent.length > 0) {
    sections.push({ title: 'Recent', exercises: recent });
    for (const e of recent) claimed.add(e.id);
  }

  const rest = exercises
    .filter((e) => !claimed.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (rest.length > 0) {
    sections.push({ title: sections.length > 0 ? 'All exercises' : null, exercises: rest });
  }

  return sections;
}

/**
 * Exercise ids from recent sessions, most-recently-used first.
 * `workouts` are expected newest-first, which is how the history endpoint
 * returns them.
 */
export function recentExerciseIds(
  workouts: { sets: { exerciseId: string }[] }[],
  limit = 12,
): string[] {
  const seen: string[] = [];
  for (const w of workouts) {
    for (const s of w.sets) {
      if (!seen.includes(s.exerciseId)) seen.push(s.exerciseId);
      if (seen.length >= limit) return seen;
    }
  }
  return seen;
}
