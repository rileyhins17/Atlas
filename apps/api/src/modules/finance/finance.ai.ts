import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { FinanceService } from './finance.service.js';

@Injectable()
export class FinanceAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'finance';

  constructor(
    private readonly finance: FinanceService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.finance.summarize(userId);
    return { source: this.id, title: 'Finance', content, tokensEstimate: estimateTokens(content) };
  }

  /**
   * No tool specs: the AI reads money (via aiContext) but does not move or record
   * it. Writing financial records from a model is a deliberate non-goal for now —
   * see the plan's "AI reads money, doesn't move it" decision.
   */
  getToolSpecs(): AiToolSpec[] {
    return [];
  }
}
