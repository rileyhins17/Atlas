import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { FitnessService } from './fitness.service.js';

@Injectable()
export class FitnessAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'fitness';

  constructor(
    private readonly fitness: FitnessService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.fitness.summarize(userId);
    return { source: this.id, title: 'Training', content, tokensEstimate: estimateTokens(content) };
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
    return [
      {
        name: 'fitness.start_workout',
        description:
          'Start a training session for the user, e.g. when they say they are at the gym ' +
          'or starting a workout. Returns the open session; sets are logged by the user in ' +
          'the app, not by you.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Optional name, e.g. "Push day" or "Legs". Defaults to "Workout".',
            },
          },
          required: [],
        },
      },
    ];
  }
}
