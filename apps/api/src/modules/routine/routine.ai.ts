import { routineToolSpecs } from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { RoutineService } from './routine.service.js';

/**
 * Feeds the user's typical week into every AI call, so briefs and suggestions
 * are timed to their actual life (don't propose deep work at their bedtime).
 * Shared tools let the model update the routine when the user asks.
 */
@Injectable()
export class RoutineAiAdapter extends RegisteredDomainModule {
  readonly id = 'routine';
  readonly contextTitle = 'Routine';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 10;

  constructor(
    routine: RoutineService,
    registry: ModuleRegistryService,
  ) {
    super(registry, routine);
  }

  getToolSpecs(): AiToolSpec[] {
    return routineToolSpecs();
  }
}
