import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { FinanceService } from './finance.service.js';

@Injectable()
export class FinanceAiAdapter extends RegisteredDomainModule {
  readonly id = 'finance';
  readonly contextTitle = 'Finance';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 100;

  constructor(
    finance: FinanceService,
    registry: ModuleRegistryService,
  ) {
    super(registry, finance);
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
