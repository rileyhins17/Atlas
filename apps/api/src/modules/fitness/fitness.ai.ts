import { fitnessToolSpecs } from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { FitnessService } from './fitness.service.js';

@Injectable()
export class FitnessAiAdapter extends RegisteredDomainModule {
  readonly id = 'fitness';
  readonly contextTitle = 'Training';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 80;

  constructor(
    fitness: FitnessService,
    registry: ModuleRegistryService,
  ) {
    super(registry, fitness);
  }

  /**
   * The AI can START a session but cannot log sets or finish one.
   *
   * A logged set is a factual claim about what your body did — if the model
   * mishears "three sets of eight" the record is silently wrong, and a training
   * log whose history you cannot trust is worse than no log. Starting a session
   * is harmless and is the friction that actually matters ("I'm at the gym").
   */
  getToolSpecs(): AiToolSpec[] {
    return fitnessToolSpecs();
  }
}
