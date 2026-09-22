import { Injectable, type OnModuleInit } from '@nestjs/common';
import { StartWorkoutInput, type AiContextChunk } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { defineTool, type DomainTool } from '../../core/domain-tool.js';
import { FitnessService } from './fitness.service.js';

@Injectable()
export class FitnessAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'fitness';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 80;

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
  tools(): DomainTool[] {
    return [
      defineTool(
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
        async (userId, args) => {
          // The model often calls a no-argument tool with null rather than {}.
          const workout = await this.fitness.start(userId, StartWorkoutInput.parse(args ?? {}));
          return { result: workout, summary: `Started "${workout.title}"`, undo: null };
        },
      ),
    ];
  }
}
