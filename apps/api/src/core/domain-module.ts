import { Injectable } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import type { DomainTool } from './domain-tool.js';

/**
 * The contract every life-domain module implements to plug into the AI brain.
 * Adding a new domain (finance, habits, ...) means writing one of these and
 * registering it — nothing in the core or the AI layer changes.
 */
export interface DomainModule {
  /** Stable id, matches the module folder, e.g. "tasks". */
  readonly id: string;
  /**
   * Where this domain sits when the context budget runs out. LOWER goes first.
   *
   * `buildContext` fills a fixed token budget in the order it is given and
   * trims or drops whatever does not fit, so this decides which domain the
   * model stops being able to see. That used to be decided by the order NestJS
   * happened to register the modules in, which is a function of the import list
   * in `app.module.ts` — so "the AI can no longer see your calendar" was a
   * consequence of where a line sat in a file.
   *
   * Defaults to the middle, so a new domain neither starves the important ones
   * nor silently outranks them.
   */
  readonly contextPriority?: number;
  /** A compact, token-budgeted summary of this domain for the AI context. */
  aiContext(userId: string): Promise<AiContextChunk>;
  /**
   * What the AI may do to this domain — each tool's spec and its handler,
   * declared together so one can never exist without the other.
   */
  tools(): DomainTool[];
}

/**
 * What survives a tight budget, and why.
 *
 * The ordering answers one question: if the model can only be told SOME of
 * this, what does it need to answer "what should I do now" without being
 * confidently wrong?
 *
 *   routine    the shape of the day. Without it "2pm is free" is a guess.
 *   calendar   commitments with other people in them — the costly ones to miss.
 *   tasks      what is actually due.
 *   notes      pinned facts about the user; tiny, and the highest signal per token.
 *   habits     what they are trying to keep up.
 *   goals      what the above is supposedly in service of.
 *   trackers   whatever they chose to watch daily.
 *   fitness    training volume and recent sessions.
 *   journal    how it has been going; the mood the patterns are built from.
 *   finance    the most rows and the least bearing on the next hour.
 */
export const DEFAULT_CONTEXT_PRIORITY = 50;

/**
 * Central registry of domain modules. Each DomainModule registers itself at boot
 * (in its onModuleInit). The AI context builder and tool router read from here,
 * so they never need to know which domains exist.
 */
@Injectable()
export class ModuleRegistryService {
  private readonly modules = new Map<string, DomainModule>();
  private readonly toolsByName = new Map<string, { owner: string; tool: DomainTool }>();

  /**
   * Tools are indexed once, here. Two domains claiming one tool name would make
   * which handler runs depend on registration order, so that fails at boot
   * instead of silently routing the model's call somewhere else.
   */
  register(mod: DomainModule): void {
    const tools = mod.tools();
    for (const t of tools) {
      const existing = this.toolsByName.get(t.spec.name);
      if (existing && existing.owner !== mod.id) {
        throw new Error(
          `Tool "${t.spec.name}" is declared by both "${existing.owner}" and "${mod.id}"`,
        );
      }
    }
    this.modules.set(mod.id, mod);
    for (const tool of tools) this.toolsByName.set(tool.spec.name, { owner: mod.id, tool });
  }

  list(): DomainModule[] {
    return [...this.modules.values()];
  }

  get(id: string): DomainModule | undefined {
    return this.modules.get(id);
  }

  /**
   * Every domain's AI context chunk, MOST IMPORTANT FIRST.
   *
   * The order is load-bearing rather than cosmetic: `buildContext` fills a
   * fixed budget in the order it receives and trims or drops the rest, so this
   * sort is what decides which domain disappears from the model's view when a
   * chatty one fills the budget. Fetching stays parallel; only the result is
   * ordered.
   */
  async collectContext(userId: string): Promise<AiContextChunk[]> {
    const ordered = [...this.list()].sort(
      (a, b) =>
        (a.contextPriority ?? DEFAULT_CONTEXT_PRIORITY) -
          (b.contextPriority ?? DEFAULT_CONTEXT_PRIORITY) || a.id.localeCompare(b.id),
    );
    return Promise.all(ordered.map((m) => m.aiContext(userId)));
  }

  /** Gather every domain's tool specs, for the model. */
  collectToolSpecs(): AiToolSpec[] {
    return [...this.toolsByName.values()].map((t) => t.tool.spec);
  }

  /** The tool the model named, or undefined if no domain declares it. */
  findTool(name: string): DomainTool | undefined {
    return this.toolsByName.get(name)?.tool;
  }
}
