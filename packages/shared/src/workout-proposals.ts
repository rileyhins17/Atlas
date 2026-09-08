import { matchExercise, parseSplitText } from './dto/exercise-match.js';
import type { ProposedTemplateDTO } from './index.js';

export function pairTemplateExercises(ids: string[], supersetGroups: (number | null)[] | undefined) {
  const paired = ids.map((exerciseId, i) => ({
    exerciseId,
    supersetGroup: supersetGroups?.[i] ?? null,
  }));
  const seen = new Set<string>();
  const unique = paired.filter((e) => {
    if (seen.has(e.exerciseId)) return false;
    seen.add(e.exerciseId);
    return true;
  });
  return unique;
}

export function proposeWorkoutTemplates(days: ReturnType<typeof parseSplitText>, catalog: { id: string; name: string }[]): ProposedTemplateDTO[] {
  const templates: ProposedTemplateDTO[] = days.map((day) => ({
    name: day.name,
    exercises: day.items.map((item) => {
      const hit = matchExercise(item, catalog);
      return hit
        ? { exerciseId: hit.candidate.id, name: hit.candidate.name, match: hit.match }
        : { exerciseId: null, name: item, match: 'new' as const };
    }),
  }));
  return templates;
}
