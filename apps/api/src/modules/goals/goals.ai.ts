import { goalsToolSpecs } from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { GoalsService } from './goals.service.js';

@Injectable()
export class GoalsAiAdapter extends RegisteredDomainModule {
  readonly id = 'goals';
  readonly contextTitle = 'Goals';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 60;

  constructor(
    goals: GoalsService,
    registry: ModuleRegistryService,
  ) {
    super(registry, goals);
  }

  getToolSpecs(): AiToolSpec[] {
    return goalsToolSpecs();
  }
}
