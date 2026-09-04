import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  matchExercise,
  normaliseGroups,
  parseSplitText,
  type CreateWorkoutTemplateInput,
  type PlanSplitResultDTO,
  type ProposedTemplateDTO,
  type UpdateWorkoutTemplateInput,
  type WorkoutTemplateDTO,
} from '@atlas/shared';
import { CostGuard } from '@atlas/ai';
import { PrismaService } from '../../core/prisma.service.js';
import { ConnectorsService } from '../../core/connectors.service.js';
import { loadEnv } from '../../config/env.js';

/** A user cannot have more days in their split than this. */
const MAX_EXERCISES_PER_TEMPLATE = 30;
const MAX_TEMPLATES = 20;

const WITH_EXERCISES = {
  exercises: { include: { exercise: true }, orderBy: { position: 'asc' } },
} as const;

type TemplateRow = {
  id: string;
  name: string;
  position: number;
  createdAt: Date;
  exercises: {
    exerciseId: string;
    position: number;
    supersetGroup: number | null;
    exercise: { name: string; muscle: string; kind: string };
  }[];
};

function toDto(row: TemplateRow, lastPerformedAt: Date | null): WorkoutTemplateDTO {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    exercises: row.exercises.map((te) => ({
      exerciseId: te.exerciseId,
      name: te.exercise.name,
      muscle: te.exercise.muscle as WorkoutTemplateDTO['exercises'][number]['muscle'],
      kind: te.exercise.kind as WorkoutTemplateDTO['exercises'][number]['kind'],
      position: te.position,
      supersetGroup: te.supersetGroup,
    })),
    lastPerformedAt: lastPerformedAt ? lastPerformedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Named days in a user's split, and the setup flow that fills them.
 *
 * Lives beside FitnessService rather than inside it because the split planner
 * talks to the AI connector, and mixing that into the set-logging path would
 * put a network dependency behind the most latency-sensitive screen in the app.
 */
@Injectable()
export class WorkoutTemplatesService {
  private readonly logger = new Logger(WorkoutTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorsService,
    private readonly costGuard: CostGuard,
  ) {}

  async list(userId: string): Promise<WorkoutTemplateDTO[]> {
    const rows = await this.prisma.client.workoutTemplate.findMany({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: WITH_EXERCISES,
    });

    // One grouped query rather than one per template.
    const last = await this.prisma.client.workout.groupBy({
      by: ['templateId'],
      where: { userId, templateId: { in: rows.map((r) => r.id) }, endedAt: { not: null } },
      _max: { startedAt: true },
    });
    const lastByTemplate = new Map(last.map((l) => [l.templateId, l._max.startedAt]));

    return rows.map((r) => toDto(r as TemplateRow, lastByTemplate.get(r.id) ?? null));
  }

  /** Exercise ids the user is allowed to reference: the shared catalog + their own. */
  private async resolveExerciseIds(userId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const found = await this.prisma.client.exercise.findMany({
      where: { id: { in: ids }, OR: [{ userId: null }, { userId }] },
      select: { id: true },
    });
    const allowed = new Set(found.map((e) => e.id));
    const rejected = ids.filter((id) => !allowed.has(id));
    if (rejected.length > 0) {
      throw new NotFoundException(`Unknown exercise: ${rejected[0]}`);
    }
    // Dedupe while preserving the order given — the template IS an ordering.
    return [...new Set(ids)];
  }

  /**
   * The exercises of a day, each with whatever it is supersetted with.
   *
   * `supersetGroups` arrives index-aligned with `exerciseIds`, and dedupe can
   * change that length — so the two are zipped BEFORE deduping and travel
   * together afterwards. Doing it the other way round silently slides every
   * grouping one place left the first time someone lists an exercise twice.
   */
  private async resolveEntries(
    userId: string,
    ids: string[],
    supersetGroups: (number | null)[] | undefined,
  ): Promise<{ exerciseId: string; supersetGroup: number | null }[]> {
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
    await this.resolveExerciseIds(userId, unique.map((e) => e.exerciseId));
    // Renumber from zero here too: the client normalises before sending, but
    // the AI split path and any other caller do not, and the number is shown.
    return normaliseGroups(unique);
  }

  async create(userId: string, input: CreateWorkoutTemplateInput): Promise<WorkoutTemplateDTO> {
    const count = await this.prisma.client.workoutTemplate.count({ where: { userId } });
    if (count >= MAX_TEMPLATES) {
      throw new BadRequestException(`You can have at most ${MAX_TEMPLATES} workout days`);
    }
    const name = input.name.trim();
    const existing = await this.prisma.client.workoutTemplate.findFirst({
      where: { userId, name },
      select: { id: true },
    });
    if (existing) throw new BadRequestException(`You already have a day called "${name}"`);

    const entries = await this.resolveEntries(userId, input.exerciseIds, input.supersetGroups);
    const row = await this.prisma.client.workoutTemplate.create({
      data: {
        userId,
        name,
        position: count,
        exercises: { create: entries.map((e, position) => ({ ...e, position })) },
      },
      include: WITH_EXERCISES,
    });
    return toDto(row as TemplateRow, null);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateWorkoutTemplateInput,
  ): Promise<WorkoutTemplateDTO> {
    const owned = await this.prisma.client.workoutTemplate.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Workout day not found');

    const entries =
      input.exerciseIds === undefined
        ? null
        : await this.resolveEntries(userId, input.exerciseIds, input.supersetGroups);

    const row = await this.prisma.client.workoutTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        // Replace wholesale: the list IS the ordering, so a diff would be more
        // code for the same result.
        ...(entries
          ? {
              exercises: {
                deleteMany: {},
                create: entries.map((e, position) => ({ ...e, position })),
              },
            }
          : {}),
      },
      include: WITH_EXERCISES,
    });
    return toDto(row as TemplateRow, null);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const { count } = await this.prisma.client.workoutTemplate.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Workout day not found');
    return { ok: true };
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  /**
   * Turn a written split into proposed templates. Writes nothing — the user
   * accepts, exactly like Plan My Day.
   *
   * Local string matching runs first and handles the common case (someone
   * listing movements they already do) at zero cost, instantly, and with no API
   * key. The AI is consulted only when the text does not parse into concrete
   * movements — "my usual upper day" — which is the minority.
   */
  async planSplit(userId: string, text: string): Promise<PlanSplitResultDTO> {
    const catalog = await this.prisma.client.exercise.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      select: { id: true, name: true },
    });

    let days = parseSplitText(text);
    let usedAi = false;
    let note: string | null = null;

    const namedMovements = days.reduce((n, d) => n + d.items.length, 0);
    // Fewer than two movements total means we got a description, not a list.
    if (namedMovements < 2) {
      const expanded = await this.expandWithAi(userId, text, catalog.map((c) => c.name));
      if (expanded) {
        days = parseSplitText(expanded);
        usedAi = true;
      } else {
        note =
          'Atlas could not read that as a list of exercises. Try "Push: bench press, incline dumbbell press, lateral raise".';
      }
    }

    const templates: ProposedTemplateDTO[] = days.map((day) => ({
      name: day.name,
      exercises: day.items.map((item) => {
        const hit = matchExercise(item, catalog);
        return hit
          ? { exerciseId: hit.candidate.id, name: hit.candidate.name, match: hit.match }
          : { exerciseId: null, name: item, match: 'new' as const };
      }),
    }));

    return { templates, usedAi, note };
  }

  /**
   * Ask the model to turn a vague description into a concrete list. Returns null
   * — not an error — when there is no API key, because setup must still work
   * without one.
   */
  private async expandWithAi(
    userId: string,
    text: string,
    catalogNames: string[],
  ): Promise<string | null> {
    try {
      await this.costGuard.assertUnderCap(userId);
      const ctx = this.connectors.contextFor(userId, 'deepseek');
      const res = await this.connectors.deepseek.chat(
        ctx,
        [
          {
            role: 'system',
            content: [
              'You turn a description of a gym routine into a plain list.',
              'Reply with one line per training day, formatted exactly as:',
              'DayName: movement, movement, movement',
              'Use only these exercise names where they fit:',
              catalogNames.join(', '),
              'If a movement is not in that list, still name it plainly.',
              'No commentary, no markdown, no numbering — only the lines.',
            ].join('\n'),
          },
          { role: 'user', content: text },
        ],
        { model: loadEnv().AI_MODEL, maxTokens: 600 },
      );
      await this.costGuard.record({
        model: res.model,
        promptTokens: res.usage.promptTokens,
        completionTokens: res.usage.completionTokens,
        userId,
        purpose: 'fitness.split',
      });
      return res.content?.trim() || null;
    } catch (err) {
      // No key, over the cap, or the provider is down. The caller falls back to
      // the local parse and tells the user how to phrase it — an unconfigured
      // AI must never block setting up a workout.
      this.logger.warn(`split expansion unavailable: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Accept a proposal: create any movements that were not in the catalog, then
   * the templates themselves. Idempotent on name — re-accepting replaces the
   * day rather than failing or duplicating it.
   */
  async applyProposal(
    userId: string,
    templates: { name: string; exercises: { exerciseId: string | null; name: string }[] }[],
  ): Promise<WorkoutTemplateDTO[]> {
    const wanted = templates.slice(0, MAX_TEMPLATES);

    // Every movement the proposal names, resolved in TWO queries rather than
    // two per exercise.
    //
    // This used to look each one up and create it individually, inside the
    // per-day loop. A five-day split of eight movements is ~80 sequential round
    // trips, and a warm round trip to the hosted database measures 384ms —
    // about thirty seconds of spinner for the one action that turns a pasted
    // program into a usable split. Same class as the Google Calendar sync,
    // which went from 305 seconds to under seven the same way.
    //
    // Title-cased first: the text came from something typed in a hurry
    // ("incline db press") and becomes a permanent catalog entry sitting next
    // to properly-cased seeded names.
    const needed = new Set<string>();
    for (const t of wanted) {
      for (const ex of t.exercises.slice(0, MAX_EXERCISES_PER_TEMPLATE)) {
        if (ex.exerciseId) continue;
        const name = titleCase(ex.name.trim().slice(0, 120));
        if (name) needed.add(name);
      }
    }

    const byName = new Map<string, string>();
    if (needed.size > 0) {
      const found = await this.prisma.client.exercise.findMany({
        where: { name: { in: [...needed] }, OR: [{ userId: null }, { userId }] },
        select: { id: true, name: true },
      });
      for (const row of found) byName.set(row.name, row.id);

      // Deduplicated by name before writing, so two days naming the same new
      // movement create it once. `skipDuplicates` covers the race where the
      // same proposal is accepted twice at the same moment.
      const missing = [...needed].filter((n) => !byName.has(n));
      if (missing.length > 0) {
        await this.prisma.client.exercise.createMany({
          data: missing.map((name) => ({ userId, name, muscle: 'other', kind: 'weight_reps' })),
          skipDuplicates: true,
        });
        // createMany returns no rows, so read back the ids it just assigned.
        const created = await this.prisma.client.exercise.findMany({
          where: { name: { in: missing }, OR: [{ userId: null }, { userId }] },
          select: { id: true, name: true },
        });
        for (const row of created) byName.set(row.name, row.id);
      }
    }

    // Which of these days already exist, in one query rather than one per day.
    const dayNames = wanted.map((t) => t.name.trim().slice(0, 60) || 'My workout');
    const existingDays = new Map(
      (
        await this.prisma.client.workoutTemplate.findMany({
          where: { userId, name: { in: dayNames } },
          select: { id: true, name: true },
        })
      ).map((row) => [row.name, row.id]),
    );

    const out: WorkoutTemplateDTO[] = [];
    for (const [i, t] of wanted.entries()) {
      const ids: string[] = [];
      for (const ex of t.exercises.slice(0, MAX_EXERCISES_PER_TEMPLATE)) {
        if (ex.exerciseId) {
          ids.push(ex.exerciseId);
          continue;
        }
        const id = byName.get(titleCase(ex.name.trim().slice(0, 120)));
        if (id) ids.push(id);
      }

      const name = dayNames[i]!;
      const existing = existingDays.get(name);
      // create/update stay per day: each is a nested write Prisma already wraps
      // in its own transaction, and there are at most MAX_TEMPLATES of them.
      out.push(
        existing
          ? await this.update(userId, existing, { exerciseIds: ids })
          : await this.create(userId, { name, exerciseIds: ids }),
      );
    }

    return out;
  }
}

/**
 * "incline db press" → "Incline Db Press". Words already containing a capital
 * are left alone, so "RDL" and "EZ-Bar" survive.
 */
function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/[A-Z]/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
