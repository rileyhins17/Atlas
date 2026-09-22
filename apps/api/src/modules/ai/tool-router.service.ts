import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ToolOutcome } from '@atlas/ai';
import { ModuleRegistryService } from '../../core/domain-module.js';
import { defineTool, type DomainTool } from '../../core/domain-tool.js';
import { MemoryService } from '../../core/memory.service.js';

const AskQuestionInput = z.object({
  question: z.string().min(1).max(2_000),
  rationale: z.string().max(2_000).optional(),
  relatesTo: z.string().max(100).optional(),
});

/**
 * Routes a tool call the model made to the domain that declared it.
 *
 * Every domain's tools — spec and handler together — live in its own
 * `*.ai.ts` adapter and reach this class through the registry, so adding a
 * tool or a whole domain never touches the AI module. Unknown tool names and
 * invalid arguments throw; the tool loop turns that into a tool-result error
 * the model can see and recover from.
 *
 * Every write returns a `summary` (what changed, in plain words) and an `undo`
 * (how to reverse it). That pairing is what lets the AI edit and delete freely
 * instead of only ever creating: nothing it does is a one-way door.
 */
@Injectable()
export class ToolRouterService {
  /**
   * The AI's own tool, not a domain's: offered only while it reviews context
   * for knowledge gaps (`generateQuestions`), never in chat.
   */
  readonly askQuestion: DomainTool;

  constructor(
    private readonly registry: ModuleRegistryService,
    memory: MemoryService,
  ) {
    this.askQuestion = defineTool(
      {
        name: 'ai.ask_question',
        description: 'Ask the user a question to fill a knowledge gap you noticed. Use sparingly.',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            rationale: {
              type: 'string',
              description: 'Why this helps Atlas serve the user better',
            },
            relatesTo: {
              type: 'string',
              description: 'Domain this relates to, e.g. journal, habits',
            },
          },
          required: ['question'],
        },
      },
      async (userId, args) => {
        await memory.askUser({ userId, ...AskQuestionInput.parse(args) });
        return { result: { ok: true }, summary: null, undo: null };
      },
    );
  }

  async execute(userId: string, name: string, args: unknown): Promise<ToolOutcome> {
    const tool =
      name === this.askQuestion.spec.name ? this.askQuestion : this.registry.findTool(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.run(userId, args);
  }
}
