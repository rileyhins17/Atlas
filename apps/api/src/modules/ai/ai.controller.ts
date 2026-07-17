import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { buildContext, CostGuard, estimateTokens } from '@atlas/ai';
import { AnswerQuestionInput, type AiQuestionDTO } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { ModuleRegistryService } from '../../core/domain-module.js';
import { ConnectorsService } from '../../core/connectors.service.js';
import { AiQuestionsService } from './ai-questions.service.js';
import { loadEnv } from '../../config/env.js';

const CONTEXT_TOKEN_BUDGET = 2000;

@Controller('ai')
@UseGuards(SessionGuard)
export class AiController {
  constructor(
    private readonly registry: ModuleRegistryService,
    private readonly connectors: ConnectorsService,
    private readonly costGuard: CostGuard,
    private readonly questions: AiQuestionsService,
  ) {}

  // --- Self-curation loop: Atlas's questions to the user ---

  @Get('questions')
  listQuestions(@CurrentUser() user: AuthedUser): Promise<AiQuestionDTO[]> {
    return this.questions.listOpen(user.id);
  }

  @Post('questions/:id/answer')
  answerQuestion(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AnswerQuestionInput)) body: AnswerQuestionInput,
  ): Promise<AiQuestionDTO> {
    return this.questions.answer(user.id, id, body.answer);
  }

  @Post('questions/:id/dismiss')
  dismissQuestion(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.questions.dismiss(user.id, id);
  }

  @Get('status')
  async status(@CurrentUser() user: AuthedUser) {
    const env = loadEnv();
    const providerReady = await this.connectors.openrouter.verify(
      this.connectors.contextFor(user.id, 'openrouter'),
    );
    return {
      enabled: this.costGuard.enabled,
      model: env.AI_MODEL,
      dailyTokenCap: env.AI_DAILY_TOKEN_CAP,
      tokensUsedToday: await this.costGuard.tokensUsedToday(),
      providerConfigured: providerReady,
      domains: this.registry.list().map((m) => m.id),
    };
  }

  /**
   * Dry run: assemble the AI context this user would send, estimate its token
   * cost, and record it to the usage ledger — WITHOUT calling the model. Lets us
   * verify the whole AI pipeline end-to-end for $0 in Phase 0.
   */
  @Post('dry-run')
  async dryRun(@CurrentUser() user: AuthedUser) {
    const chunks = await this.registry.collectContext(user.id);
    const built = buildContext(chunks, CONTEXT_TOKEN_BUDGET);
    const systemPromptTokens = estimateTokens(SYSTEM_PROMPT);
    const promptTokens = built.tokensEstimate + systemPromptTokens;

    await this.costGuard.record({
      model: loadEnv().AI_MODEL,
      promptTokens,
      completionTokens: 0,
      purpose: 'dry_run',
      userId: user.id,
    });

    return {
      wouldCallModel: false,
      promptTokensEstimate: promptTokens,
      includedSources: built.includedSources,
      droppedSources: built.droppedSources,
      contextPreview: built.text.slice(0, 500),
    };
  }
}

const SYSTEM_PROMPT =
  'You are Atlas, a personal life assistant with cross-domain context over the ' +
  "user's tasks, calendar, habits, journal and finances. Be concise and helpful.";
