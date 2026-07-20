import { Injectable, Logger } from '@nestjs/common';
import type { ChatMessage } from '@atlas/connectors';
import type { Insight } from '@atlas/db';
import type { AiToolSpec, InsightDTO } from '@atlas/shared';
import { buildContext, CostGuard, runToolLoop, type ToolLoopResult } from '@atlas/ai';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { ModuleRegistryService } from '../../core/domain-module.js';
import { ConnectorsService } from '../../core/connectors.service.js';
import { loadEnv } from '../../config/env.js';
import { ToolRouterService } from './tool-router.service.js';
import { EmbeddingService } from './embedding.service.js';

const CONTEXT_TOKEN_BUDGET = 3_000;
const MAX_RESPONSE_TOKENS = 800;
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
  'You are Atlas\'s intake parser. The user will paste messy, unstructured text ' +
  '(a brain dump). Break it into concrete items and file each one with the right ' +
  'tool: tasks.create for to-dos, calendar.add for events with a date/time, ' +
  'journal.add for reflective/emotional content, notes.remember for durable facts, ' +
  'habits.log for a check-in against an existing habit. Call tools directly for ' +
  'every actionable item you find; do not just describe what you would do. If ' +
  'nothing actionable is present, reply briefly saying so and call no tools.';

const BRIEF_SYSTEM_PROMPT =
  "You are Atlas, writing the user's daily brief from their cross-domain " +
  'context and recent activity. Be concise (120-200 words): what stands out, ' +
  "what's due or upcoming, and one gentle nudge. Plain prose, no headers, no tools.";

const WEEKLY_REVIEW_SYSTEM_PROMPT =
  "You are Atlas, writing the user's weekly review from their cross-domain " +
  "context and the past week's activity. In 150-250 words of plain prose (no " +
  'headers, no tools): what they got done and where they slipped across tasks, ' +
  'habits, calendar, journal mood and spending; one honest pattern you notice ' +
  'over the week; and one concrete focus for the week ahead. Encouraging, not fluffy.';

const QUESTIONS_SYSTEM_PROMPT =
  'You are Atlas, reviewing the context below for genuine knowledge gaps about ' +
  'the user. If (and only if) you notice something worth asking about — a ' +
  "thin journal entry, a stalled habit, a goal with no tasks — call ai.ask_question " +
  'for it. Ask at most 2 questions. If nothing stands out, call no tools.';

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
  ) {}

  private async chatCall(
    userId: string,
    purpose: string,
    messages: ChatMessage[],
    tools?: Record<string, unknown>[],
  ) {
    await this.costGuard.assertUnderCap();
    const env = loadEnv();
    const ctx = this.connectors.contextFor(userId, 'deepseek');
    const res = await this.connectors.deepseek.chat(ctx, messages, {
      model: env.AI_MODEL,
      tools,
      maxTokens: MAX_RESPONSE_TOKENS,
    });
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
    const [contextText, activityText] = await Promise.all([
      this.buildSystemChunk(userId),
      this.recentActivityText(userId, activityLimit),
    ]);
    return { contextText, activityText };
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
  async organizeBrainDump(userId: string, text: string): Promise<ToolLoopResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: BRAIN_DUMP_SYSTEM_PROMPT },
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
    const res = await this.chatCall(userId, 'daily_brief', messages);

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
    const messages: ChatMessage[] = [
      { role: 'system', content: WEEKLY_REVIEW_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextText}\n\nActivity over the last 7 days:\n${activityText}\n\nWrite this week's review.`,
      },
    ];
    const res = await this.chatCall(userId, 'weekly_review', messages);

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
