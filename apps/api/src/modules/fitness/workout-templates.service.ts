import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  matchExercise,
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

    const ids = await this.resolveExerciseIds(userId, input.exerciseIds);
    const row = await this.prisma.client.workoutTemplate.create({
      data: {
        userId,
        name,
        position: count,
        exercises: { create: ids.map((exerciseId, position) => ({ exerciseId, position })) },
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

    const ids =
      input.exerciseIds === undefined
        ? null
        : await this.resolveExerciseIds(userId, input.exerciseIds);

    const row = await this.prisma.client.workoutTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        // Replace wholesale: the list IS the ordering, so a diff would be more
        // code for the same result.
        ...(ids
          ? {
              exercises: {
                deleteMany: {},
                create: ids.map((exerciseId, position) => ({ exerciseId, position })),
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
    const out: WorkoutTemplateDTO[] = [];

    for (const t of templates.slice(0, MAX_TEMPLATES)) {
      const ids: string[] = [];
      for (const ex of t.exercises.slice(0, 30)) {
        if (ex.exerciseId) {
          ids.push(ex.exerciseId);
          continue;
        }
        // Title-case it: the raw text came from something the user typed in a
        // hurry ("incline db press"), and it becomes a permanent catalog entry
        // shown next to properly-cased seeded names.
        const name = titleCase(ex.name.trim().slice(0, 120));
        if (!name) continue;
        // upsert-by-name: two proposals naming the same new movement must not
        // create two exercises.
        const existing = await this.prisma.client.exercise.findFirst({
          where: { name, OR: [{ userId: null }, { userId }] },
          select: { id: true },
        });
        if (existing) {
          ids.push(existing.id);
          continue;
        }
        const created = await this.prisma.client.exercise.create({
          data: { userId, name, muscle: 'other', kind: 'weight_reps' },
          select: { id: true },
        });
        ids.push(created.id);
      }

      const name = t.name.trim().slice(0, 60) || 'My workout';
      const existing = await this.prisma.client.workoutTemplate.findFirst({
        where: { userId, name },
        select: { id: true },
      });
      out.push(
        existing
          ? await this.update(userId, existing.id, { exerciseIds: ids })
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
