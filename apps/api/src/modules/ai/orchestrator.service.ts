import { Injectable, Logger } from '@nestjs/common';
import type { ChatMessage } from '@atlas/connectors';
import type { Insight } from '@atlas/db';
import type { AiToolSpec, InsightDTO, PlanDayDTO, PlanProposalDTO } from '@atlas/shared';
import { buildContext, CostGuard, runToolLoop, type ToolLoopResult } from '@atlas/ai';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { ModuleRegistryService } from '../../core/domain-module.js';
import { ConnectorsService } from '../../core/connectors.service.js';
import { loadEnv } from '../../config/env.js';
import { safeTz } from './time.util.js';
import { StatsService } from '../stats/stats.service.js';
import { ToolRouterService } from './tool-router.service.js';
import { EmbeddingService } from './embedding.service.js';
import { parsePlanReply } from './plan-day.util.js';

const CONTEXT_TOKEN_BUDGET = 3_000;
/**
 * Completion budget for a normal call.
 *
 * `deepseek-v4-flash` is a REASONING model: its `reasoning_content` is billed
 * against — and consumes — the same `max_tokens` as the visible answer. A call
 * that thinks for 700 tokens has 100 left to answer in. Anything whose output
 * has to be complete to be usable therefore needs real headroom, not this.
 */
const MAX_RESPONSE_TOKENS = 800;
/** Long-form prose the user reads in full; observed truncating at 800. */
const NARRATIVE_RESPONSE_TOKENS = 2_000;
/** A plan is only usable if its JSON closes, and the JSON comes after the reasoning. */
const PLAN_RESPONSE_TOKENS = 3_000;
const MEMORY_RECALL_LIMIT = 3;
/**
 * Max L2 distance for a recalled memory to be worth prompt space. Vectors are
 * normalized, so distance runs 0 (identical) to 2. Measured: a genuinely
 * related memory lands ~0.6, an unrelated one ~0.98 — so this keeps the former
 * and drops the latter rather than padding the prompt with noise.
 */
const MAX_MEMORY_DISTANCE = 0.9;

const CHAT_SYSTEM_PROMPT =
  'You are Atlas, a personal life assistant with cross-domain context over the ' +
  "user's tasks, calendar, habits, journal and notes. Be concise and warm. " +
  'Use the provided tools to actually create/update records when the user asks ' +
  'you to (e.g. "add a task", "log my workout") rather than just describing what to do.';

const BRAIN_DUMP_SYSTEM_PROMPT =
  "You are Atlas's intake parser. The user types in plain language; turn it into " +
  'real records with the right tool: tasks.create for to-dos, calendar.add for ' +
  'anything with a date/time, calendar.block to reserve a span of time for ' +
  'focused work, journal.add for reflective/emotional content, notes.remember ' +
  'for durable facts, habits.log for a check-in against an existing habit. Call ' +
  'tools directly for every actionable item; never just describe what you would do.\n\n' +
  'Scheduling rules:\n' +
  '- Resolve every relative date/time ("tomorrow", "next Friday", "in an hour") ' +
  'against the "Now" block below.\n' +
  '- Pass local times, not UTC.\n' +
  '- When a duration is given ("a 1-hour block", "30 minutes"), use ' +
  'durationMinutes instead of inventing an end time.\n' +
  '- If an event has no stated duration, default to 60 minutes.\n' +
  '- If a time is genuinely ambiguous, create a task with a due date rather than ' +
  'guessing a specific hour.\n' +
  '- For anything repeating ("every weekday", "each Monday"), set the recurrence ' +
  'RRULE on tasks.create.\n\n' +
  'If nothing actionable is present, reply briefly saying so and call no tools.';

const BRIEF_SYSTEM_PROMPT = `You are Atlas, writing the user's daily brief from
their cross-domain context and recent activity. Be concise (120-200 words): what
stands out, what's due or upcoming, and one gentle nudge. Plain prose, no headers,
no tools.

Honesty rules: only describe what is actually in the context below. Never invent
activity, and never claim a pattern, trend or correlation unless there are enough
data points to support it - two entries is not a trend, and two unrelated domains
moving together is not a cause. When the data is thin or the user is new, say so
plainly and say what you would need to see; a short honest answer beats a padded one.`;

const WEEKLY_REVIEW_SYSTEM_PROMPT = `You are Atlas, writing the user's weekly
review from their cross-domain context and the past week's activity.

Format it to be scanned, not read: 3-6 short bullet lines, each starting with "- "
and opening with a bolded 1-3 word label in **asterisks**, then one sentence. No
headers, no preamble, no tools. Cover what got done, where they slipped, one honest
pattern, and one concrete focus for the week ahead. Encouraging, not fluffy.

Example shape:
- **Tasks** You closed 12, up from 7 - most of them early in the week.
- **Focus next** Pick one evening to clear the three overdue items.

Honesty rules: only describe what is actually in the context below. Never invent
activity, and never claim a pattern, trend or correlation unless there are enough
data points to support it - two entries is not a trend, and two unrelated domains
moving together is not a cause. When the data is thin or the user is new, say so
plainly and say what you would need to see; a short honest answer beats a padded one.`;

const PLAN_DAY_SYSTEM_PROMPT = `You are Atlas, fitting the user's OWN open tasks into
the free windows they actually have today.

You will be given a list of free windows and a list of the user's unfinished tasks.
Reply with ONLY a JSON object, no prose and no code fences:
{"proposals":[{"taskId":"<id from the list>","startAt":"<ISO>","endAt":"<ISO>","why":"<one short sentence>"}],"note":null}

Hard rules:
- Every taskId MUST come from the task list you were given. Never invent a task,
  never invent an id, and never propose the same task twice.
- Every slot MUST sit inside one of the given windows, and slots must not overlap.
- Leave a window empty rather than stuffing it. Fewer, well-placed slots beat a
  packed day, and a day with no realistic work to place should return an empty
  list with a short note saying so.
- Respect what the task looks like: something overdue or urgent goes earlier,
  something long needs a window long enough to hold it. If nothing fits a window,
  skip that window.
- Default to 30-60 minutes unless the task clearly implies otherwise.
- "why" is one plain sentence about the placement, not a pep talk.`;

/** Newline as a const: writing '
' inline through tooling keeps getting mangled. */
const NL = String.fromCharCode(10);

const QUESTIONS_SYSTEM_PROMPT =
  'You are Atlas, reviewing the context below for genuine knowledge gaps about ' +
  'the user. If (and only if) you notice something worth asking about — a ' +
  "thin journal entry, a stalled habit, a goal with no tasks — call ai.ask_question " +
  'for it. Ask at most 2 questions. If nothing stands out, call no tools. Base ' +
  'questions only on what the context actually shows; do not ask about activity ' +
  'you assumed rather than observed.';

const ASK_QUESTION_TOOL: AiToolSpec = {
  name: 'ai.ask_question',
  description:
    'Ask the user a question to fill a knowledge gap you noticed. Use sparingly.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      rationale: { type: 'string', description: 'Why this helps Atlas serve the user better' },
      relatesTo: { type: 'string', description: 'Domain this relates to, e.g. journal, habits' },
    },
    required: ['question'],
  },
};

function toInsightDto(i: Insight): InsightDTO {
  return {
    id: i.id,
    kind: i.kind,
    title: i.title,
    body: i.body,
    createdAt: i.createdAt.toISOString(),
  };
}

/**
 * The AI brain: assembles cross-domain context under a token budget, calls the
 * chat provider through the cost guard, and routes any tool calls the model
 * makes back to the real domain services. Every model call — including each
 * turn of a multi-tool-call conversation — is individually cap-checked and
 * recorded, so spend can never silently exceed AI_DAILY_TOKEN_CAP.
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly registry: ModuleRegistryService,
    private readonly connectors: ConnectorsService,
    private readonly costGuard: CostGuard,
    private readonly toolRouter: ToolRouterService,
    private readonly embeddings: EmbeddingService,
    private readonly stats: StatsService,
  ) {}

  private async chatCall(
    userId: string,
    purpose: string,
    messages: ChatMessage[],
    tools?: Record<string, unknown>[],
    maxTokens: number = MAX_RESPONSE_TOKENS,
  ) {
    await this.costGuard.assertUnderCap();
    const env = loadEnv();
    const ctx = this.connectors.contextFor(userId, 'deepseek');
    const res = await this.connectors.deepseek.chat(ctx, messages, {
      model: env.AI_MODEL,
      tools,
      maxTokens,
    });
    // Truncation is otherwise invisible: the reply just ends mid-sentence, or
    // mid-JSON. Log it so a budget that has become too small shows up as a
    // signal rather than as an occasional mystery empty result.
    if (res.finishReason === 'length') {
      this.logger.warn(
        `${purpose}: model output hit the ${maxTokens}-token cap and was truncated`,
      );
    }
    await this.costGuard.record({
      model: res.model,
      promptTokens: res.usage.promptTokens,
      completionTokens: res.usage.completionTokens,
      cachedPromptTokens: res.usage.cachedPromptTokens,
      purpose,
      userId,
    });
    return res;
  }

  private async buildSystemChunk(userId: string): Promise<string> {
    const chunks = await this.registry.collectContext(userId);
    return buildContext(chunks, CONTEXT_TOKEN_BUDGET).text;
  }

  /**
   * Anchor the model in time. Without this the model resolves "tomorrow at 2pm"
   * against its training data and silently schedules into the wrong day — every
   * relative date in a capture depends on this block existing.
   *
   * It changes only once per minute and sits at the FRONT of the context, which
   * is safe for the prefix cache in a way per-message recall is not (see the
   * prompt-order gotcha): a whole day of calls shares the same date line, and
   * only the trailing time drifts.
   */
  private async nowBlock(userId: string): Promise<string> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const tz = safeTz(user?.timezone || 'UTC');
    const now = new Date();
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(now);
    return `## Now
It is currently ${local} (${tz}).
Resolve every relative date and time ("today", "tomorrow", "next Friday", "in an
hour") against this. All datetimes you pass to tools are in this timezone — do
not convert to UTC yourself.`;
  }

  private async recentActivityText(userId: string, limit = 15): Promise<string> {
    const recent = await this.timeline.recent(userId, limit);
    if (recent.length === 0) return 'No recent activity.';
    return recent.map((e) => `- ${e.type}: ${e.title}`).join('\n');
  }

  /** Module context + recent activity in one shot. Every module summarizes on
   * each call, so build this once per request and pass it around. */
  private async buildSnapshot(
    userId: string,
    activityLimit: number,
  ): Promise<{ contextText: string; activityText: string }> {
    const [nowText, moduleText, activityText] = await Promise.all([
      this.nowBlock(userId),
      this.buildSystemChunk(userId),
      this.recentActivityText(userId, activityLimit),
    ]);
    return { contextText: `${nowText}

${moduleText}`, activityText };
  }

  /**
   * Semantic recall for this message. Module summaries only cover the *current*
   * state (open tasks, recent mood); this surfaces older journal entries, notes
   * and Q&A that are topically relevant but would never fit in a summary.
   * Best-effort: retrieval failing must never take chat down.
   */
  private async recallText(userId: string, query: string): Promise<string> {
    try {
      const matches = await this.embeddings.search(userId, query, MEMORY_RECALL_LIMIT);
      const relevant = matches.filter((m) => m.distance <= MAX_MEMORY_DISTANCE);
      if (relevant.length === 0) return '';
      const lines = relevant.map((m) => `- (${m.ownerType}) ${m.content.slice(0, 300)}`);
      // Appended to the user's message, not the system prompt — see chat().
      return `\n\n[Possibly relevant things you know about me:\n${lines.join('\n')}]`;
    } catch (err) {
      this.logger.warn(
        `Memory recall failed, continuing without it: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
      return '';
    }
  }

  /**
   * Chat with the AI over the user's whole life, with tool calling enabled.
   *
   * Message order is deliberate and load-bearing for cost. DeepSeek's discount
   * is a *prefix* cache, so everything from the first differing token onward is
   * billed at full price. Recall changes on every single message, so putting it
   * in the system prompt (position 1) drops the cache hit rate to 0% —
   * measured. Keeping the stable prefix (instructions → module context →
   * history) intact and appending volatile recall to the final user message
   * instead measures ~92% cached.
   */
  async chat(userId: string, message: string, history: ChatMessage[] = []): Promise<ToolLoopResult> {
    const [contextText, recall] = await Promise.all([
      this.buildSystemChunk(userId),
      this.recallText(userId, message),
    ]);
    const messages: ChatMessage[] = [
      { role: 'system', content: `${CHAT_SYSTEM_PROMPT}\n\n${contextText}` },
      ...history,
      { role: 'user', content: `${message}${recall}` },
    ];
    const tools = this.registry.collectToolSpecs();
    return runToolLoop({
      messages,
      tools,
      chat: (m, t) => this.chatCall(userId, 'chat', m, t),
      executeTool: (name, args) => this.toolRouter.execute(userId, name, args),
    });
  }

  /** Parse a free-form brain dump into real records via tool calls. */
  /**
   * Propose where today's open tasks could go in today's free windows.
   *
   * Deliberately NOT a tool-calling loop: this returns proposals for the user to
   * accept, and the model is never given the power to write them. A plan you
   * didn't agree to is worse than no plan, and a hallucinated task on your
   * calendar is worse still — so every proposal is matched back to a real task
   * id here and silently dropped if it doesn't match.
   */
  async planDay(userId: string, gaps: { startAt: Date; endAt: Date }[]): Promise<PlanDayDTO> {
    const open = await this.prisma.client.task.findMany({
      where: { userId, status: { in: ['TODO', 'IN_PROGRESS'] } },
      orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }],
      take: 25,
    });
    if (open.length === 0) {
      return { proposals: [], note: 'Nothing open to schedule — your task list is clear.' };
    }

    const nowText = await this.nowBlock(userId);
    const windows = gaps
      .map((g) => `- ${g.startAt.toISOString()} to ${g.endAt.toISOString()} (${Math.round((g.endAt.getTime() - g.startAt.getTime()) / 60_000)} min)`)
      .join(NL);
    const tasks = open
      .map((t) => {
        const due = t.dueAt ? `, due ${t.dueAt.toISOString().slice(0, 10)}` : '';
        return `- id=${t.id} | ${t.title} | ${t.priority.toLowerCase()}${due}`;
      })
      .join(NL);

    const messages: ChatMessage[] = [
      { role: 'system', content: PLAN_DAY_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${nowText}

Free windows today:
${windows}

Open tasks:
${tasks}

Propose a plan.`,
      },
    ];

    const reply = await this.chatCall(
      userId,
      'plan_day',
      messages,
      undefined,
      PLAN_RESPONSE_TOKENS,
    );
    const parsed = parsePlanReply(reply.content ?? '');
    if (!parsed) return { proposals: [], note: 'Could not put a plan together just now.' };

    // Match every proposal back to a real task. Anything that doesn't match is
    // a hallucination and is dropped rather than shown.
    const byId = new Map(open.map((t) => [t.id, t]));
    const seen = new Set<string>();
    const proposals: PlanProposalDTO[] = [];
    for (const p of parsed.proposals) {
      // Everything off the wire is untrusted and optional — the model can and
      // does omit fields.
      if (!p.taskId || !p.startAt || !p.endAt) continue;
      const task = byId.get(p.taskId);
      if (!task || seen.has(p.taskId)) continue;
      const start = new Date(p.startAt);
      const end = new Date(p.endAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
      // The slot must genuinely sit inside a window we offered.
      const fits = gaps.some((g) => start >= g.startAt && end <= g.endAt);
      if (!fits) continue;
      seen.add(p.taskId);
      proposals.push({
        taskId: task.id,
        title: task.title,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        why: String(p.why ?? '').slice(0, 200),
      });
    }
    proposals.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return {
      proposals,
      note: proposals.length === 0 ? (parsed.note ?? 'No slot looked like a good fit.') : null,
    };
  }

  async organizeBrainDump(userId: string, text: string): Promise<ToolLoopResult> {
    // Capture is where relative dates actually arrive ("gym tomorrow at 6"), so
    // this path needs the time anchor most — it previously had no context at all.
    const nowText = await this.nowBlock(userId);
    const messages: ChatMessage[] = [
      { role: 'system', content: `${BRAIN_DUMP_SYSTEM_PROMPT}

${nowText}` },
      { role: 'user', content: text },
    ];
    const tools = this.registry.collectToolSpecs();
    return runToolLoop({
      messages,
      tools,
      chat: (m, t) => this.chatCall(userId, 'auto_organize', m, t),
      executeTool: (name, args) => this.toolRouter.execute(userId, name, args),
      maxIterations: 6,
    });
  }

  /**
   * Have the AI notice knowledge gaps and queue ai_questions for the user.
   *
   * `snapshot` lets a caller that has already assembled the context (the daily
   * brief) hand it over instead of making every module re-summarize.
   */
  async generateQuestions(
    userId: string,
    snapshot?: { contextText: string; activityText: string },
  ): Promise<ToolLoopResult> {
    const { contextText, activityText } = snapshot ?? (await this.buildSnapshot(userId, 20));
    const messages: ChatMessage[] = [
      { role: 'system', content: QUESTIONS_SYSTEM_PROMPT },
      { role: 'user', content: `${contextText}\n\nRecent activity:\n${activityText}` },
    ];
    return runToolLoop({
      messages,
      tools: [ASK_QUESTION_TOOL],
      chat: (m, t) => this.chatCall(userId, 'questions', m, t),
      executeTool: (name, args) => this.toolRouter.execute(userId, name, args),
      maxIterations: 2,
    });
  }

  /** Write today's brief to `insights`, then best-effort surface follow-up questions. */
  async generateDailyBrief(userId: string): Promise<InsightDTO> {
    const snapshot = await this.buildSnapshot(userId, 15);
    const { contextText, activityText } = snapshot;
    const messages: ChatMessage[] = [
      { role: 'system', content: BRIEF_SYSTEM_PROMPT },
      { role: 'user', content: `${contextText}\n\nRecent activity:\n${activityText}\n\nWrite today's brief.` },
    ];
    const res = await this.chatCall(
      userId,
      'daily_brief',
      messages,
      undefined,
      NARRATIVE_RESPONSE_TOKENS,
    );

    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const insight = await this.prisma.client.insight.create({
      data: {
        userId,
        kind: 'daily_brief',
        title: `Daily brief — ${dayStart.toISOString().slice(0, 10)}`,
        body: res.content,
        periodFrom: dayStart,
        periodTo: now,
      },
    });

    // Reuse the snapshot rather than making every module summarize again.
    await this.generateQuestions(userId, snapshot).catch(() => undefined);

    return toInsightDto(insight);
  }

  /**
   * A cross-domain weekly review over the last 7 days. Same shape as the daily
   * brief but a wider activity window and a reflective, pattern-finding prompt —
   * this is where the unified timeline earns its keep.
   */
  async generateWeeklyReview(userId: string): Promise<InsightDTO> {
    const snapshot = await this.buildSnapshot(userId, 40);
    const { contextText, activityText } = snapshot;
    // Cross-domain rollups let the review spot real patterns ("training up,
    // mood up, spend down"). Best-effort, and appended LAST — anything volatile
    // early in the prompt kills the prefix cache (see the cost gotcha).
    const statsText = await this.stats.summarizeForAi(userId).catch(() => '');
    const messages: ChatMessage[] = [
      { role: 'system', content: WEEKLY_REVIEW_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextText}\n\nActivity over the last 7 days:\n${activityText}${statsText ? `\n\n${statsText}` : ''}\n\nWrite this week's review.`,
      },
    ];
    const res = await this.chatCall(
      userId,
      'weekly_review',
      messages,
      undefined,
      NARRATIVE_RESPONSE_TOKENS,
    );

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const insight = await this.prisma.client.insight.create({
      data: {
        userId,
        kind: 'weekly_review',
        title: `Weekly review — ${now.toISOString().slice(0, 10)}`,
        body: res.content,
        periodFrom: weekAgo,
        periodTo: now,
      },
    });

    await this.generateQuestions(userId, snapshot).catch(() => undefined);

    return toInsightDto(insight);
  }

  async listInsights(userId: string, page: { limit: number; offset: number }): Promise<InsightDTO[]> {
    const insights = await this.prisma.client.insight.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    });
    return insights.map(toInsightDto);
  }
}
