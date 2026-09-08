import { habitsToolSpecs } from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { HabitsService } from './habits.service.js';

@Injectable()
export class HabitsAiAdapter extends RegisteredDomainModule {
  readonly id = 'habits';
  readonly contextTitle = 'Habits';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 50;

  constructor(
    habits: HabitsService,
    registry: ModuleRegistryService,
  ) {
    super(registry, habits);
  }

  getToolSpecs(): AiToolSpec[] {
    return habitsToolSpecs();
  }
}
