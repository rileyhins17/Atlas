import { Injectable, type OnModuleInit } from '@nestjs/common';
import { estimateTokens, orderDomains, type DomainModule, type AiContextChunk, type AiToolSpec } from '@atlas/shared';

export { DEFAULT_CONTEXT_PRIORITY, type DomainModule } from '@atlas/shared';

/**
 * Central registry of domain modules. Each DomainModule registers itself at boot
 * (in its onModuleInit). The AI context builder and tool router read from here,
 * so they never need to know which domains exist.
 */
@Injectable()
export class ModuleRegistryService {
  private readonly modules = new Map<string, DomainModule>();

  register(mod: DomainModule): void {
    this.modules.set(mod.id, mod);
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
    const ordered = orderDomains(this.list());
    return Promise.all(ordered.map((m) => m.aiContext(userId)));
  }

  /** Gather every domain's tool specs. */
  collectToolSpecs(): AiToolSpec[] {
    return this.list().flatMap((m) => m.getToolSpecs());
  }
}

/** One registration and summary implementation for every life-domain adapter. */
export abstract class RegisteredDomainModule implements DomainModule, OnModuleInit {
  abstract readonly id: string;
  abstract readonly contextTitle: string;
  abstract readonly contextPriority: number;

  protected constructor(
    private readonly registry: ModuleRegistryService,
    private readonly domain: { summarize(userId: string): Promise<string> },
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.domain.summarize(userId);
    return { source: this.id, title: this.contextTitle, content, tokensEstimate: estimateTokens(content) };
  }

  abstract getToolSpecs(): AiToolSpec[];
}
